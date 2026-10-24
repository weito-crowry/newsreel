#!/usr/bin/env python3
"""VOICEVOX 公式API互換の最小HTTPサーバ（テスト専用）

runner.py の HTTP合成バックエンド（--synth http）を、公式VOICEVOXアプリなしで
検証するためのサーバです。中身は voicevox_core（blocking API）を
HTTP の後ろに置いただけで、実装しているのは次の2エンドポイントのみ:

  POST /audio_query?text=<文>&speaker=<style_id>   公式形式のクエリJSONを返す
  POST /synthesis?speaker=<style_id>               クエリJSONを受け取り WAV を返す

Windows では **公式VOICEVOXアプリ** が同じAPIを http://localhost:50021 で
提供するので、このモックは不要です（Linux 側の検証専用）。

使い方:
  ~/workspace/voicevox/venv/bin/python voicevox_mock_server.py [--port 50021] [--host 127.0.0.1]

環境変数:
  VOICEVOX_DIR  エンジン一式（0.vvm / vort / OpenJTalk辞書）の場所
                既定: ~/workspace/voicevox
"""
from __future__ import annotations

import argparse
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from voicevox_core import AccentPhrase, AudioQuery, Mora
from voicevox_core.blocking import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile

VOICEVOX_DIR = Path(os.environ.get("VOICEVOX_DIR") or (Path.home() / "workspace" / "voicevox"))

# voicevox_core の Synthesizer はスレッドセーフでない前提で、全リクエストを直列化する
LOCK = threading.Lock()
SYNTH: Synthesizer | None = None


def load_engine() -> Synthesizer:
    ort = Onnxruntime.load_once(
        filename=str(VOICEVOX_DIR / "vort/lib/libvoicevox_onnxruntime.so.1.23.2")
    )
    synth = Synthesizer(
        ort,
        OpenJtalk(str(VOICEVOX_DIR / "dict/open_jtalk_dic_utf_8-1.11")),
        acceleration_mode="CPU",
    )
    with VoiceModelFile.open(str(VOICEVOX_DIR / "0.vvm")) as model:
        synth.load_voice_model(model)
    return synth


# ---------------------------------------------------------------- JSON 変換（公式エンジンの形式）

def mora_to_json(m) -> dict:
    # core 0.17 の pause_mora は Mora でなく dict（公式JSON形式のキー）で返る
    if isinstance(m, dict):
        return {
            "text": m["text"],
            "consonant": m.get("consonant"),
            "consonant_length": m.get("consonant_length"),
            "vowel": m["vowel"],
            "vowel_length": m["vowel_length"],
            "pitch": m["pitch"],
        }
    return {
        "text": m.text,
        "consonant": m.consonant,
        "consonant_length": m.consonant_length,
        "vowel": m.vowel,
        "vowel_length": m.vowel_length,
        "pitch": m.pitch,
    }


def mora_from_json(d: dict) -> Mora:
    return Mora(
        text=d["text"],
        vowel=d["vowel"],
        vowel_length=d["vowel_length"],
        pitch=d["pitch"],
        consonant=d.get("consonant"),
        consonant_length=d.get("consonant_length"),
    )


def query_to_json(q: AudioQuery) -> dict:
    return {
        "accent_phrases": [
            {
                "moras": [mora_to_json(m) for m in p.moras],
                "accent": p.accent,
                "pause_mora": mora_to_json(p.pause_mora) if p.pause_mora else None,
                "is_interrogative": p.is_interrogative,
            }
            for p in q.accent_phrases
        ],
        "speedScale": q.speed_scale,
        "pitchScale": q.pitch_scale,
        "intonationScale": q.intonation_scale,
        "volumeScale": q.volume_scale,
        "prePhonemeLength": q.pre_phoneme_length,
        "postPhonemeLength": q.post_phoneme_length,
        "pauseLength": None,  # core 0.17 の AudioQuery には無い項目。公式形式に合わせて null
        "pauseLengthScale": 1.0,
        "outputSamplingRate": q.output_sampling_rate,
        "outputStereo": q.output_stereo,
        "kana": q.kana,
    }


def query_from_json(d: dict) -> AudioQuery:
    phrases = []
    for p in d["accent_phrases"]:
        phrases.append(
            AccentPhrase(
                moras=[mora_from_json(m) for m in p["moras"]],
                accent=p["accent"],
                pause_mora=mora_from_json(p["pause_mora"]) if p.get("pause_mora") else None,
                is_interrogative=p.get("is_interrogative", False),
            )
        )
    return AudioQuery(
        accent_phrases=phrases,
        speed_scale=d.get("speedScale", 1.0),
        pitch_scale=d.get("pitchScale", 0.0),
        intonation_scale=d.get("intonationScale", 1.0),
        volume_scale=d.get("volumeScale", 1.0),
        pre_phoneme_length=d.get("prePhonemeLength", 0.1),
        post_phoneme_length=d.get("postPhonemeLength", 0.1),
        output_sampling_rate=d.get("outputSamplingRate", 24000),
        output_stereo=d.get("outputStereo", False),
        kana=d.get("kana"),
    )


# ---------------------------------------------------------------- HTTP ハンドラ

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # 既定のアクセスログは抑制（必要なら stderr へ）
        pass

    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, code: int, obj) -> None:
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"),
                   "application/json; charset=utf-8")

    def do_GET(self):
        if self.path in ("/", "/version"):
            self._send(200, b"voicevox-mock (test only)", "text/plain; charset=utf-8")
        else:
            self._send_json(404, {"detail": "not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        params = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        try:
            speaker = int(params.get("speaker", "2"))
        except ValueError:
            self._send_json(422, {"detail": "speaker must be an integer"})
            return
        assert SYNTH is not None
        if parsed.path == "/audio_query":
            text = params.get("text")
            if text is None:
                self._send_json(422, {"detail": "text is required"})
                return
            with LOCK:
                query = SYNTH.create_audio_query(text, speaker)
            self._send_json(200, query_to_json(query))
        elif parsed.path == "/synthesis":
            length = int(self.headers.get("Content-Length") or 0)
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
                query = query_from_json(body)
            except Exception as e:  # noqa: BLE001 - テスト用サーバなので素直に 422 を返す
                self._send_json(422, {"detail": f"invalid query json: {e}"})
                return
            with LOCK:
                wav = SYNTH.synthesis(query, speaker)
            self._send(200, wav, "audio/wav")
        else:
            self._send_json(404, {"detail": "not found"})


def main() -> int:
    ap = argparse.ArgumentParser(description="VOICEVOX公式API互換の最小モックサーバ（テスト専用）")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=50021)
    args = ap.parse_args()

    global SYNTH
    print(f"エンジン読み込み中: {VOICEVOX_DIR}")
    SYNTH = load_engine()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"listening: http://{args.host}:{args.port} （/audio_query, /synthesis のみ）")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
