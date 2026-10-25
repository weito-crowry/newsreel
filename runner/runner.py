#!/usr/bin/env python3
"""newsreel 制作ランナー

動画スクリプトJSON（production.json）を1本渡すと、
  ①読み替え辞書適用 → ②VOICEVOX合成（文単位・実尺計測）
  → ③シーン別 Remotion レンダリング → ④ffmpeg連結 → 完成mp4＋制作ログ
までを一気に実行する。

使い方:
  python3 runner.py production.json --mode dev     # 開発用（960x540）
  python3 runner.py production.json --mode final   # 最終版（1920x1080）
  python3 runner.py production.json --mode dev --scenes S3        # シーン単体
  python3 runner.py production.json --mode dev --skip-synth       # 合成を再利用
  python3 runner.py production.json --audio-only-from old.mp4 --out new.mp4
      # 音声だけ差し替え（映像はコピー、再レンダリングなし）

前提:
  - 合成バックエンドが2種類ある（--synth で選択、既定は core）:
    - core: VOICEVOX core を直接使う（この Linux 環境用）。voicevox の venv の
      python で実行すること（例: ~/workspace/voicevox/venv/bin/python runner.py ...）。
    - http: VOICEVOX エンジンの公式HTTP API（既定 http://localhost:50021）を使う。
      voicevox_core は不要で、通常の python3 で実行できる。Windows では公式
      VOICEVOX アプリが同じ API を提供するので、この方式で JSON から完結できる。
  - --skip-synth の描画だけならどちらの場合も通常の python3 でよい。
  - 描画には Node.js + プロジェクトの node_modules、連結には ffmpeg が必要。

production.json のスキーマは README.md を参照。
"""
from __future__ import annotations

import argparse
import array
import importlib.util
import hashlib
import io
import json
import math
import os
import shutil
import subprocess
import sys
import time
import wave
from pathlib import Path

FPS = 30
PAD_HEAD = 0.175  # layout.ts と一致させること（2026-10-26 田中指定で従来の半分）
PAD_TAIL = 0.225
INTRO_GAP_AFTER = 0.15  # 冒頭効果音が終わってから発話が始まるまでの間（秒）（2026-10-26 田中指定で 0.30→0.15）
RUNNER_DIR = Path(__file__).resolve().parent
PACKAGE_DIR = RUNNER_DIR.parent
DEFAULT_PROJECT = PACKAGE_DIR / "template"
DEFAULT_VOICE_DIR = PACKAGE_DIR / "voice"
# VOICEVOX エンジン一式（0.vvm / vort / OpenJTalk辞書 / venv）はパッケージ外に置く。
# 既定はパッケージと同じ階層の voicevox/（= ~/workspace/voicevox）。
# 置き場所を変える場合は環境変数 VOICEVOX_DIR か --voicevox-dir で指定する。
DEFAULT_VOICEVOX = Path(os.environ.get("VOICEVOX_DIR") or (PACKAGE_DIR.parent / "voicevox"))


def js_round(x: float) -> int:
    """JavaScript の Math.round と同じ（.5 は切り上げ）"""
    return math.floor(x + 0.5)


def now() -> float:
    return time.perf_counter()


class Log:
    def __init__(self) -> None:
        self.rows: list[tuple[str, float, str]] = []
        self.notes: list[str] = []

    def step(self, name: str, seconds: float, note: str = "") -> None:
        self.rows.append((name, seconds, note))
        print(f"  [{seconds:6.1f}s] {name} {note}".rstrip())

    def note(self, text: str) -> None:
        self.notes.append(text)
        print(f"  note: {text}")

    def write(self, path: Path, title: str, meta: dict) -> None:
        lines = [f"# 制作ログ: {title}", ""]
        for k, v in meta.items():
            lines.append(f"- {k}: {v}")
        lines += ["", "| 工程 | 所要 | 備考 |", "|---|---|---|"]
        total = 0.0
        for name, sec, note in self.rows:
            lines.append(f"| {name} | {sec:.1f}s | {note} |")
            total += sec
        lines.append(f"| **合計** | **{total:.1f}s** | |")
        if self.notes:
            lines += ["", "## メモ", *[f"- {n}" for n in self.notes]]
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _windows_cmdline(cmd: list[str]) -> str:
    """Windows（cmd.exe 経由）用にコマンドライン文字列を組み立てる。

    list2cmdline は空白を含む引数しか引用符で囲まないため、ffmpeg フィルタの
    「|」や「&」が cmd のパイプ／連結と解釈されて壊れる（2026-10-25 の効果音
    ミックス失敗の原因）。メタ文字を含む引数は空白がなくても引用符で囲む。
    """
    parts = []
    for a in cmd:
        if a and not any(c in a for c in ' \t"'):
            if any(c in a for c in "|&^%<>"):
                a = f'"{a}"'
            parts.append(a)
        else:
            parts.append(subprocess.list2cmdline([a]))
    return " ".join(parts)


def run_cmd(cmd: list[str], cwd: Path, env: dict | None = None) -> subprocess.CompletedProcess:
    """クロスプラットフォームなコマンド実行（Windows では .cmd 解決のため shell 経由）"""
    full_env = dict(os.environ)
    if env:
        full_env.update(env)
    if os.name == "nt":
        return subprocess.run(
            _windows_cmdline(cmd), shell=True, cwd=str(cwd), env=full_env,
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
    return subprocess.run(cmd, cwd=str(cwd), env=full_env, capture_output=True, text=True,
                          encoding="utf-8", errors="replace")


def tool(name: str) -> str:
    p = shutil.which(name)
    if not p:
        raise SystemExit(f"エラー: {name} が見つかりません。インストールと PATH を確認してください。")
    return p


def probe_duration(path: Path) -> float:
    r = subprocess.run(
        [tool("ffprobe"), "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True,
    )
    return float(r.stdout.strip())


def probe_has_audio(path: Path) -> bool:
    r = subprocess.run(
        [tool("ffprobe"), "-v", "error", "-select_streams", "a",
         "-show_entries", "stream=index", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True,
    )
    return bool(r.stdout.strip())


# ---------------------------------------------------------------- 合成

def load_dict_module(voice_dir: Path):
    spec = importlib.util.spec_from_file_location(
        "apply_reading_dict", voice_dir / "apply_reading_dict.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


def synth_core(texts: list[str], style_id: int, speed: float, voicevox_dir: Path) -> list[bytes]:
    """core バックエンド: voicevox_core を直接使って文ごとに WAV バイト列を返す。"""
    try:
        from voicevox_core.blocking import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile
    except ImportError:
        raise SystemExit(
            "エラー: voicevox_core が import できません。voicevox の venv の python で実行するか、"
            "--synth http（VOICEVOXエンジンのHTTP API）を使ってください"
            f"（例: {voicevox_dir / 'venv' / 'bin' / 'python'} runner.py ...）"
        )
    ort = Onnxruntime.load_once(
        filename=str(voicevox_dir / "vort/lib/libvoicevox_onnxruntime.so.1.23.2")
    )
    synth = Synthesizer(
        ort,
        OpenJtalk(str(voicevox_dir / "dict/open_jtalk_dic_utf_8-1.11")),
        acceleration_mode="CPU",
    )
    with VoiceModelFile.open(str(voicevox_dir / "0.vvm")) as model:
        synth.load_voice_model(model)
    wavs: list[bytes] = []
    for spoken in texts:
        query = synth.create_audio_query(spoken, style_id)
        query.speed_scale = speed
        wavs.append(synth.synthesis(query, style_id))
    return wavs


def synth_http(texts: list[str], style_id: int, speed: float, engine_url: str) -> list[bytes]:
    """http バックエンド: VOICEVOX エンジン公式HTTP API で文ごとに WAV バイト列を返す。

    POST /audio_query（text, speaker）→ クエリJSON の speedScale を設定
    → POST /synthesis（speaker, クエリJSON）→ WAV。
    style_id の意味は公式エンジンと同一（2 = 四国めたん ノーマル）。
    """
    import urllib.error
    import urllib.parse
    import urllib.request

    base = engine_url.rstrip("/")

    def post(path: str, params: dict, data: bytes | None = None,
             content_type: str | None = None) -> bytes:
        url = f"{base}{path}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, data=data, method="POST")
        if content_type:
            req.add_header("Content-Type", content_type)
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                return r.read()
        except urllib.error.URLError as e:
            raise SystemExit(
                f"エラー: VOICEVOX エンジンに接続できません（{base}）: {e}\n"
                "公式VOICEVOXアプリ（エンジン）を起動し、http://localhost:50021 で"
                "応答する状態にしてから再実行してください。URL が違う場合は --engine-url で指定します。"
            )

    wavs: list[bytes] = []
    for spoken in texts:
        raw = post("/audio_query", {"text": spoken, "speaker": style_id})
        query = json.loads(raw)
        query["speedScale"] = speed
        wav = post(
            "/synthesis",
            {"speaker": style_id},
            data=json.dumps(query).encode("utf-8"),
            content_type="application/json",
        )
        wavs.append(wav)
    return wavs


def synthesize(
    production: dict,
    voicevox_dir: Path,
    voice_dir: Path,
    audio_dir: Path,
    timing_path: Path,
    log: Log,
    backend: str = "core",
    engine_url: str = "http://localhost:50021",
) -> list[dict]:
    """辞書適用→文単位合成→実尺計測。timing.json を書き、ユニット一覧を返す。

    読み替え辞書の適用はバックエンド非依存の前処理（合成用テキストにだけ効く）。
    """
    dict_mod = load_dict_module(voice_dir)
    entries = dict_mod.load_dict()
    voice = production.get("voice", {})
    style_id = int(voice.get("styleId", 2))
    speed = float(voice.get("speed", 1.12))
    tail_silence = float(voice.get("tailSilence", 0.28))

    jobs: list[tuple[str, str, str]] = []  # (scene_id, 字幕用原文, 合成用テキスト)
    applied_total: list[tuple[str, str, int]] = []
    for scene in production["scenes"]:
        for text in scene.get("narration", []):
            spoken, applied = dict_mod.apply_dict(text, entries)
            applied_total.extend(applied)
            jobs.append((scene["id"], text, spoken))

    if backend == "http":
        wav_list = synth_http([j[2] for j in jobs], style_id, speed, engine_url)
        log.note(f"合成バックエンド: http（{engine_url}）")
    else:
        wav_list = synth_core([j[2] for j in jobs], style_id, speed, voicevox_dir)
        log.note("合成バックエンド: core（voicevox_core 直接）")

    audio_dir.mkdir(parents=True, exist_ok=True)
    units: list[dict] = []
    for idx, ((scene_id, text, _spoken), wav_bytes) in enumerate(zip(jobs, wav_list)):
        with wave.open(io.BytesIO(wav_bytes), "rb") as w:
            params = w.getparams()
            frames = w.readframes(w.getnframes())
        speech_dur = (len(frames) / params.sampwidth / params.nchannels) / params.framerate
        silence = b"\x00" * int(params.framerate * tail_silence) * params.nchannels * params.sampwidth
        name = f"u{idx:02d}.wav"
        with wave.open(str(audio_dir / name), "wb") as w:
            w.setparams(params)
            w.writeframes(frames + silence)
        dur = round(speech_dur + tail_silence, 3)
        units.append({"scene": scene_id, "text": text, "file": f"audio/{name}", "dur": dur})
    timing_path.parent.mkdir(parents=True, exist_ok=True)
    timing_path.write_text(json.dumps({"units": units}, ensure_ascii=False, indent=1), encoding="utf-8")
    if applied_total:
        merged: dict[str, int] = {}
        for surface, _reading, count in applied_total:
            merged[surface] = merged.get(surface, 0) + count
        log.note("読み替え適用: " + ", ".join(f"{k}×{v}" for k, v in merged.items()))
    log.note(f"合成ユニット {len(units)} 件、ナレーション合計 {sum(u['dur'] for u in units):.1f}s")
    return units


# ---------------------------------------------------------------- レイアウト計算（layout.ts の鏡像）

def intro_hold_seconds(production: dict, se_enabled: bool) -> float:
    """冒頭効果音（intro.wav）が終わってから発話を始めるための、先頭シーンの追加の間。

    効果音オフ／先頭がフックでない／intro.wav が無い場合は 0。
    発話開始 = intro の実尺 + INTRO_GAP_AFTER になるよう、PAD_HEAD 分を差し引いて返す。
    """
    if not se_enabled or not production.get("scenes"):
        return 0.0
    first = production["scenes"][0]
    if first.get("type") != "hook" or not first.get("narration"):
        return 0.0
    intro = SE_DIR / "intro.wav"
    if not intro.exists():
        return 0.0
    with wave.open(str(intro), "rb") as w:
        dur = w.getnframes() / float(w.getframerate())
    return round(max(0.0, dur + INTRO_GAP_AFTER - PAD_HEAD), 3)


def compute_layout(production: dict, units: list[dict], intro_hold: float = 0.0) -> list[dict]:
    """シーンごとの {id, frames, seconds, unit_offsets} を返す。unit_offsets はシーン相対秒。

    intro_hold は先頭フックシーンにだけ効く（冒頭効果音が終わってから発話を始める）。
    """
    layout = []
    for scene in production["scenes"]:
        sid = scene["id"]
        if scene["type"] in ("title", "end"):
            sec = float(scene.get("fixedSeconds", 3 if scene["type"] == "title" else 5))
            frames = js_round(sec * FPS)
            layout.append({"id": sid, "type": scene["type"], "frames": frames,
                           "seconds": frames / FPS, "unit_offsets": [], "unit_durs": []})
            continue
        s_units = [u for u in units if u["scene"] == sid]
        head = PAD_HEAD + (intro_hold if not layout and scene["type"] == "hook" else 0.0)
        total_sec = head + sum(u["dur"] for u in s_units) + PAD_TAIL
        frames = js_round(total_sec * FPS)
        offsets, durs = [], []
        cur = head
        for u in s_units:
            offsets.append(cur)
            durs.append(u["dur"])
            cur += u["dur"]
        layout.append({"id": sid, "type": scene["type"], "frames": frames,
                       "seconds": frames / FPS, "unit_offsets": offsets, "unit_durs": durs})
    return layout


def _template_hash(project: Path) -> str:
    """テンプレ側ソース（src/*.ts(x)）の指紋。レイアウトや見た目が変わったら描き直すため。"""
    h = hashlib.sha1()
    src = project / "src"
    if src.exists():
        for p in sorted(src.iterdir()):
            if p.is_file() and p.suffix in (".ts", ".tsx"):
                h.update(p.read_bytes())
    return h.hexdigest()


def _scene_signature(tpl_hash: str, mode: str, scene_def: dict,
                     scene_units: list[dict], hold: float) -> str:
    """シーンキャッシュの署名。入力がすべて同じときだけ既存シーンを再利用する。"""
    payload = {"tpl": tpl_hash, "mode": mode, "def": scene_def,
               "units": scene_units, "hold": hold}
    return hashlib.sha1(
        json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()


# ---------------------------------------------------------------- 描画・連結

def render_scene(project: Path, comp_id: str, out_file: Path, mode: str, log: Log) -> float:
    scale = "0.5" if mode == "dev" else "1"
    tmpdir = project / ".tmp"
    tmpdir.mkdir(exist_ok=True)
    env = {"TMPDIR": str(tmpdir)}
    if os.name == "nt":
        env["TEMP"] = str(tmpdir)
        env["TMP"] = str(tmpdir)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    cmd = [tool("npx"), "remotion", "render", "src/index.ts", comp_id, str(out_file)]
    if mode == "dev":
        cmd += ["--scale", scale]
    t = now()
    r = run_cmd(cmd, cwd=project, env=env)
    elapsed = now() - t
    if r.returncode != 0:
        print(r.stdout[-3000:])
        print(r.stderr[-3000:], file=sys.stderr)
        raise SystemExit(f"エラー: シーン {comp_id} のレンダリングに失敗しました")
    return elapsed


def ensure_audio(project: Path, scene_file: Path) -> bool:
    """無音声シーン（タイトル/エンディング）に無音AACトラックを足し、連結互換にする。"""
    if probe_has_audio(scene_file):
        return False
    tmp = scene_file.with_suffix(".withaudio.mp4")
    dur = probe_duration(scene_file)
    r = run_cmd(
        [tool("ffmpeg"), "-y", "-v", "error", "-i", str(scene_file),
         "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
         "-t", f"{dur:.3f}", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", str(tmp)],
        cwd=project,
    )
    if r.returncode != 0:
        print(r.stderr[-2000:], file=sys.stderr)
        raise SystemExit(f"エラー: {scene_file.name} への無音トラック追加に失敗しました")
    tmp.replace(scene_file)
    return True


def concat_scenes(project: Path, scene_files: list[Path], out_file: Path, expected_sec: float, log: Log) -> str:
    list_file = out_file.parent / "concat-list.txt"
    list_file.write_text(
        "".join(
            f"file '{os.path.relpath(p, out_file.parent).replace(os.sep, '/')}'\n"
            for p in scene_files
        ),
        encoding="utf-8",
    )
    # まず stream copy で連結を試す
    r = run_cmd(
        [tool("ffmpeg"), "-y", "-v", "error", "-f", "concat", "-safe", "0",
         "-i", list_file.name, "-c", "copy", out_file.name],
        cwd=out_file.parent,
    )
    if r.returncode == 0 and out_file.exists():
        actual = probe_duration(out_file)
        if abs(actual - expected_sec) <= 1.5:
            return f"stream copy（実尺 {actual:.2f}s / 予測 {expected_sec:.2f}s）"
        log.note(f"copy連結の尺が予測とずれた（{actual:.2f}s vs {expected_sec:.2f}s）ため再エンコードに切替")
    # フォールバック: 再エンコード
    r = run_cmd(
        [tool("ffmpeg"), "-y", "-v", "error", "-f", "concat", "-safe", "0",
         "-i", list_file.name, "-c:v", "libx264", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "128k", out_file.name],
        cwd=out_file.parent,
    )
    if r.returncode != 0:
        print(r.stderr[-2000:], file=sys.stderr)
        raise SystemExit("エラー: シーン連結に失敗しました")
    actual = probe_duration(out_file)
    return f"再エンコード（実尺 {actual:.2f}s / 予測 {expected_sec:.2f}s）"


# ---------------------------------------------------------------- 効果音

SE_DIR = RUNNER_DIR / "assets" / "se"
# (種別, ファイル名, ミックス時のゲインdB, シーン頭からのオフセット秒)
# 効果音は冒頭の intro.wav のみ（2026-10-25 Tanaka 判断: 「頭の効果音以外はいらない」。
# それ以外の音は「無いもの」として扱い、plan が空でないのは先頭フックだけになる）。
SE_RULES = [
    ("hook", "intro.wav", -3.0, 0.0),   # 冒頭の音は Tanaka 提供の intro.wav（2026-10-25）
]


def plan_sound_effects(production: dict, layout_subset: list[dict]) -> list[tuple[float, str, float]]:
    """レイアウト（対象シーンの並び）から効果音の配置 (開始秒, ファイル名, ゲインdB) を決める。"""
    scene_by_id = {s["id"]: s for s in production["scenes"]}
    events: list[tuple[float, str, float]] = []
    cursor = 0.0
    for lay in layout_subset:
        scene = scene_by_id.get(lay["id"], {})
        stype = scene.get("type", "")
        for kind, fname, gain, off in SE_RULES:
            if stype == kind:
                events.append((cursor + off, fname, gain))
        cursor += lay["seconds"]
    return events


def mix_sound_effects(project: Path, media: Path, production: dict,
                      layout_subset: list[dict], log: Log) -> str:
    """効果音を所定の位置に重ねる（映像は stream copy）。音量の最終調整は続く loudnorm が担う。"""
    events = plan_sound_effects(production, layout_subset)
    events = [e for e in events if (SE_DIR / e[1]).exists()]
    if not events:
        return "配置なし（アセット不足）"
    tmp = media.with_suffix(".se.mp4")

    def build(amix_tail: str):
        filters, labels = [], ["[0:a]"]
        for i, (off, _, gain) in enumerate(events):
            ms = int(off * 1000)
            filters.append(f"[{i + 1}:a]adelay={ms}|{ms},volume={gain}dB[se{i}]")
            labels.append(f"[se{i}]")
        filters.append(
            f"{''.join(labels)}amix=inputs={len(events) + 1}"
            f":duration=first:dropout_transition=0{amix_tail}[aout]")
        cmd = [tool("ffmpeg"), "-y", "-v", "error", "-i", media.name]
        for _, fname, _ in events:
            cmd += ["-i", str(SE_DIR / fname)]
        cmd += ["-filter_complex", ";".join(filters), "-map", "0:v", "-map", "[aout]",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", tmp.name]
        return cmd

    r = run_cmd(build(":normalize=0"), cwd=media.parent)
    if r.returncode != 0 or not tmp.exists():
        # normalize=0 に未対応の ffmpeg では付けずに再試行（全体量は loudnorm がそろえる）
        r = run_cmd(build(""), cwd=media.parent)
    if r.returncode != 0 or not tmp.exists():
        print((r.stderr or "")[-2000:], file=sys.stderr)
        raise SystemExit("エラー: 効果音ミックスに失敗しました")
    tmp.replace(media)
    desc = ", ".join(f"{fname.replace('.wav', '')}@{off:.1f}s" for off, fname, _ in events)
    return f"{len(events)}件配置（{desc}）"


# ---------------------------------------------------------------- ラウドネス正規化

LOUDNORM_TARGET = {"I": -14.0, "TP": -1.0, "LRA": 11.0}


def measure_loudness(media: Path) -> dict | None:
    """ffmpeg loudnorm の計測パスを実行し、測定値（input_* / target_offset）を返す。"""
    r = run_cmd(
        [tool("ffmpeg"), "-hide_banner", "-i", str(media), "-vn",
         "-af", "loudnorm=print_format=json", "-f", "null", "-"],
        cwd=media.parent,
    )
    text = r.stderr or ""
    start = text.rfind('"input_i"')
    if start < 0:
        return None
    begin = text.rfind("{", 0, start)
    end = text.find("}", start)
    if begin < 0 or end < 0:
        return None
    try:
        data = json.loads(text[begin:end + 1])
        return {k: float(v) for k, v in data.items()
                if k.startswith("input_") or k == "target_offset"}
    except Exception:
        return None


def normalize_loudness(project: Path, media: Path, log: Log) -> str:
    """完成mp4の音量を YouTube 基準相当（-14 LUFS / TP -1dB）に正規化する。

    方式: loudnorm で計測 → 必要ゲインを volume で適用しつつ alimiter で
    ピークを -2 dBFS に抑える → 再計測して担保する。
    loudnorm の dynamic 補正は冒頭に強い音がある素材でピーク上限を超える
    ことが実測で判明したため、補正そのものには使わない（計測専用）。
    すでに基準内（±0.5 LUFS かつ TP 以下）なら何もしない。
    """
    t = LOUDNORM_TARGET
    m = measure_loudness(media)
    if not m or "input_i" not in m:
        return "計測できなかったためスキップ"
    before = f"{m['input_i']:.2f} LUFS / TP {m.get('input_tp', 0.0):+.2f} dB"
    if abs(m["input_i"] - t["I"]) <= 0.5 and m.get("input_tp", 0.0) <= t["TP"]:
        return f"{before}（基準内、そのまま）"

    def apply_gain(gain_db: float, suffix: str) -> dict | None:
        tmp = media.with_suffix(suffix)
        r = run_cmd(
            [tool("ffmpeg"), "-y", "-v", "error", "-i", media.name,
             "-c:v", "copy",
             "-af", f"volume={gain_db:.2f}dB,alimiter=limit=0.794:level=0",
             "-c:a", "aac", "-b:a", "192k", "-ar", "48000", tmp.name],
            cwd=media.parent,
        )
        if r.returncode != 0 or not tmp.exists():
            print((r.stderr or "")[-2000:], file=sys.stderr)
            raise SystemExit("エラー: ラウドネス正規化に失敗しました")
        tmp.replace(media)
        return measure_loudness(media)

    gain = t["I"] - m["input_i"]
    after_m = apply_gain(gain, ".loudnorm.mp4")
    passes = 1
    # リミッターで想定より下がった場合は、差分だけもう一度ゲインして寄せる
    if after_m and "input_i" in after_m and abs(after_m["input_i"] - t["I"]) > 0.7:
        after_m = apply_gain(t["I"] - after_m["input_i"], ".loudnorm2.mp4")
        passes += 1
    # 最終ガード: それでもピークが上限超えなら、超過分だけ下げて確実に収める
    trimmed = False
    if after_m and after_m.get("input_tp", 0.0) > t["TP"]:
        after_m = apply_gain(t["TP"] - after_m["input_tp"], ".loudnorm3.mp4")
        passes += 1
        trimmed = True
    after = (f"{after_m['input_i']:.2f} LUFS / TP {after_m.get('input_tp', 0.0):+.2f} dB"
             if after_m and "input_i" in after_m else "再計測不可")
    note = f"（{passes}パス" + ("・最終トリム" if trimmed else "") + "）" if passes > 1 or trimmed else ""
    return f"{before} → {after}（目標 {t['I']:.0f} LUFS / TP {t['TP']:.0f} dB）{note}"


# ---------------------------------------------------------------- 音声だけ差し替え

def replace_audio(
    production: dict,
    voicevox_dir: Path,
    voice_dir: Path,
    project: Path,
    src_video: Path,
    out_file: Path,
    work_dir: Path,
    log: Log,
    backend: str = "core",
    engine_url: str = "http://localhost:50021",
) -> None:
    """既存mp4の映像をそのままに、辞書適用済みの再合成音声へ差し替える。
    配置は既存 timing.json（=その動画を作ったときの尺）のオフセットを維持し、
    字幕とのズレを防ぐ。"""
    timing_path = project / "src" / "timing.json"
    if not timing_path.exists():
        raise SystemExit("エラー: 既存の timing.json がありません（配置の基準が必要です）")
    old_timing = json.loads(timing_path.read_text(encoding="utf-8"))
    old_units = old_timing["units"]
    old_layout = compute_layout(production, old_units,
                                  intro_hold=float(old_timing.get("introHoldSec", 0.0)))

    # 再合成（作業ディレクトリへ。プロジェクトの timing.json は書き換えない）
    tmp_timing = work_dir / "timing-new.json"
    new_units = synthesize(production, voicevox_dir, voice_dir, work_dir / "audio", tmp_timing, log,
                           backend=backend, engine_url=engine_url)
    if len(new_units) != len(old_units):
        raise SystemExit(
            f"エラー: ユニット数が既存動画と一致しません（新 {len(new_units)} / 旧 {len(old_units)}）。"
            "production.json の narration を既存動画と揃えてください"
        )

    # 旧オフセットへ新音声を配置して1本のトラックを作る
    first_wav = work_dir / "audio" / Path(new_units[0]["file"]).name
    with wave.open(str(first_wav), "rb") as w:
        params = w.getparams()
    rate = params.framerate
    total_sec = sum(s["seconds"] for s in old_layout)
    buf = array.array("h", bytes(2 * int(total_sec * rate) + rate))
    scene_start = 0.0
    oi = 0
    for s in old_layout:
        for off in s["unit_offsets"]:
            nu = new_units[oi]
            oi += 1
            with wave.open(str(work_dir / "audio" / Path(nu["file"]).name), "rb") as w:
                raw = w.readframes(w.getnframes())
            samples = array.array("h")
            samples.frombytes(raw)
            pos = int((scene_start + off) * rate)
            for i, v in enumerate(samples):
                j = pos + i
                if j < len(buf):
                    mixed = buf[j] + v
                    buf[j] = max(-32768, min(32767, mixed))
        scene_start += s["seconds"]
    track = work_dir / "track.wav"
    with wave.open(str(track), "wb") as w:
        w.setparams(params)
        w.writeframes(buf.tobytes())

    out_file.parent.mkdir(parents=True, exist_ok=True)
    r = run_cmd(
        [tool("ffmpeg"), "-y", "-v", "error", "-i", str(src_video), "-i", str(track),
         "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
         str(out_file)],
        cwd=work_dir,
    )
    if r.returncode != 0:
        print(r.stderr[-2000:], file=sys.stderr)
        raise SystemExit("エラー: 音声差し替えに失敗しました")


# ---------------------------------------------------------------- メイン

def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="ニュース動画 制作ランナー")
    ap.add_argument("production", help="動画スクリプトJSON（production.json）のパス")
    ap.add_argument("--mode", choices=["dev", "final"], default="dev",
                    help="dev=960x540で高速確認 / final=1920x1080（既定: dev）")
    ap.add_argument("--project", type=Path, default=DEFAULT_PROJECT,
                    help=f"Remotionプロジェクトのディレクトリ（既定: {DEFAULT_PROJECT}）")
    ap.add_argument("--voicevox-dir", type=Path, default=DEFAULT_VOICEVOX,
                    help=f"VOICEVOXエンジン一式のディレクトリ（既定: {DEFAULT_VOICEVOX}）")
    ap.add_argument("--voice-dir", type=Path, default=DEFAULT_VOICE_DIR,
                    help=f"読み替え辞書一式のディレクトリ（既定: {DEFAULT_VOICE_DIR}）")
    ap.add_argument("--out", type=Path, default=None, help="出力ディレクトリ（既定: <project>/out/<id>-<mode>）")
    ap.add_argument("--scenes", default=None, help="対象シーンをカンマ区切りで限定（例: S3 / S1,S3）")
    ap.add_argument("--skip-synth", action="store_true", help="合成を省略し既存の timing.json と音声を使う")
    ap.add_argument("--force", action="store_true", help="既存のシーンmp4があっても再レンダリングする")
    ap.add_argument("--audio-only-from", type=Path, default=None,
                    help="音声だけ差し替えモード: 既存の完成mp4のパス")
    ap.add_argument("--synth", choices=["core", "http"], default="core",
                    help="合成バックエンド（既定: core）。core=voicevox_core直接（venvのpythonが必要）、"
                         "http=VOICEVOXエンジン公式HTTP API（通常のpythonで実行可、Windowsでは公式アプリが提供）")
    ap.add_argument("--engine-url", default="http://localhost:50021",
                    help="--synth http の接続先（既定: http://localhost:50021）")
    ap.add_argument("--no-loudnorm", action="store_true",
                    help="完成mp4のラウドネス正規化（-14 LUFS / TP -1dB）を省略する")
    ap.add_argument("--no-se", action="store_true",
                    help="効果音（フック/タイトル/アクセント/エンド）のミックスを省略する")
    args = ap.parse_args(argv)

    production_path = Path(args.production).resolve()
    production = json.loads(production_path.read_text(encoding="utf-8"))
    project: Path = args.project.resolve()
    log = Log()
    t_all = now()

    # --- 音声だけ差し替えモード ---
    if args.audio_only_from:
        out_file = (args.out or (RUNNER_DIR / "out" / f"{production['id']}-audio-replaced.mp4")).resolve()
        work_dir = out_file.parent / "audio-work"
        work_dir.mkdir(parents=True, exist_ok=True)
        t = now()
        replace_audio(production, args.voicevox_dir.resolve(), args.voice_dir.resolve(), project,
                      args.audio_only_from.resolve(), out_file, work_dir, log,
                      backend=args.synth, engine_url=args.engine_url)
        log.step("音声差し替え（再合成＋配置＋mux）", now() - t)
        if not args.no_loudnorm:
            t = now()
            summary = normalize_loudness(project, out_file, log)
            log.step("ラウドネス正規化", now() - t, summary)
        dur = probe_duration(out_file)
        log.step("検証（ffprobe）", 0.0, f"尺 {dur:.2f}s / 映像は stream copy")
        log.write(out_file.parent / "production-log.md", production["title"],
                   {"モード": "音声だけ差し替え", "元動画": str(args.audio_only_from), "出力": str(out_file)})
        print(f"\n完成: {out_file}")
        return 0

    # --- 通常モード ---
    out_dir = (args.out or (project / "out" / f"{production['id']}-{args.mode}")).resolve()
    scenes_dir = out_dir / "scenes"
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1) 入力JSONをプロジェクトへ配置（Remotion は src/production.json を読む）
    t = now()
    dest = project / "src" / "production.json"
    if production_path != dest:
        shutil.copyfile(production_path, dest)
    log.step("制作データ配置", now() - t, f"{production_path.name} -> src/production.json")

    # 2) 辞書適用＋合成＋尺計測
    timing_path = project / "src" / "timing.json"
    if args.skip_synth:
        units = json.loads(timing_path.read_text(encoding="utf-8"))["units"]
        log.step("合成（スキップ）", 0.0, "既存の timing.json と音声を再利用")
    else:
        t = now()
        units = synthesize(production, args.voicevox_dir.resolve(), args.voice_dir.resolve(),
                           project / "public" / "audio", timing_path, log,
                           backend=args.synth, engine_url=args.engine_url)
        log.step("辞書適用＋VOICEVOX合成＋実尺計測", now() - t, f"{len(units)}ユニット")

    # 2.5) 冒頭ホールド（効果音が終わってから発話開始）を timing.json とレイアウトへ反映
    hold = intro_hold_seconds(production, se_enabled=not args.no_se)
    tj = json.loads(timing_path.read_text(encoding="utf-8"))
    tj["introHoldSec"] = hold
    timing_path.write_text(json.dumps(tj, ensure_ascii=False, indent=1), encoding="utf-8")
    if hold > 0:
        log.note(f"冒頭ホールド: 先頭シーンの発話開始を {hold:.2f}s 後ろへ（intro 終了後に発話）")

    # 3) レイアウト予測
    layout = compute_layout(production, units, intro_hold=hold)
    expected_total = sum(s["seconds"] for s in layout)
    target_ids = args.scenes.split(",") if args.scenes else [s["id"] for s in layout]
    by_id = {s["id"]: s for s in layout}
    for tid in target_ids:
        if tid not in by_id:
            raise SystemExit(f"エラー: 未知のシーンIDです: {tid}")
    expected_target = sum(by_id[tid]["seconds"] for tid in target_ids)
    log.note(f"予測尺: 全編 {expected_total:.2f}s / 対象 {expected_target:.2f}s")

    # 4) シーン別レンダリング
    # キャッシュ再利用は署名が一致したときだけ（脚本・音声尺・冒頭ホールド・
    # テンプレ・モードのどれかが変わっていたら、そのシーンは描き直す）
    sigs_path = out_dir / "scene-sigs.json"
    try:
        sigs = json.loads(sigs_path.read_text(encoding="utf-8"))
    except Exception:
        sigs = {}
    tpl_hash = _template_hash(project)
    first_id = production["scenes"][0]["id"]
    scene_files: list[Path] = []
    for tid in target_ids:
        scene_file = scenes_dir / f"scene-{tid}.mp4"
        sig = _scene_signature(
            tpl_hash, args.mode,
            next(s for s in production["scenes"] if s["id"] == tid),
            [u for u in units if u["scene"] == tid],
            hold if tid == first_id else 0.0)
        if scene_file.exists() and not args.force and sigs.get(tid) == sig:
            log.step(f"レンダリング {tid}", 0.0, "既存ファイルを再利用（--forceで再描画）")
        else:
            elapsed = render_scene(project, tid, scene_file, args.mode, log)
            log.step(f"レンダリング {tid}（{args.mode}）", elapsed,
                     f"{by_id[tid]['frames']}フレーム")
            sigs[tid] = sig
            sigs_path.write_text(json.dumps(sigs, ensure_ascii=False, indent=1),
                                 encoding="utf-8")
        t = now()
        added = ensure_audio(project, scene_file)
        if added:
            log.step(f"無音トラック追加 {tid}", now() - t, "音声なしシーンのため")
        scene_files.append(scene_file)

    # 5) 連結
    out_file = out_dir / f"{production['id']}-{args.mode}.mp4"
    t = now()
    how = concat_scenes(project, scene_files, out_file, expected_target, log)
    log.step("連結（ffmpeg）", now() - t, how)

    # 5.2) 効果音ミックス（フック/タイトル/アクセント/エンド）
    if not args.no_se:
        t = now()
        summary = mix_sound_effects(project, out_file, production,
                                    [by_id[tid] for tid in target_ids], log)
        log.step("効果音ミックス", now() - t, summary)

    # 5.5) ラウドネス正規化（音量の均一化: -14 LUFS / TP -1dB）
    if not args.no_loudnorm:
        t = now()
        summary = normalize_loudness(project, out_file, log)
        log.step("ラウドネス正規化", now() - t, summary)

    # 6) 検証
    t = now()
    dur = probe_duration(out_file)
    has_audio = probe_has_audio(out_file)
    log.step("検証（ffprobe）", now() - t,
             f"尺 {dur:.2f}s（予測 {expected_target:.2f}s）/ 音声 {'あり' if has_audio else 'なし'}")
    if not has_audio:
        raise SystemExit("エラー: 完成mp4に音声ストリームがありません")
    if abs(dur - expected_target) > 1.5:
        raise SystemExit(f"エラー: 完成mp4の尺が予測と大きくずれています（{dur:.2f}s vs {expected_target:.2f}s）")

    log.step("総所要時間", now() - t_all)
    log.write(out_dir / "production-log.md", production["title"],
              {"モード": args.mode, "対象シーン": ",".join(target_ids), "出力": str(out_file)})
    print(f"\n完成: {out_file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
