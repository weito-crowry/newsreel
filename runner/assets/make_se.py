#!/usr/bin/env python3
"""ニュース動画用 効果音アセットの生成スクリプト（外部素材を使わず合成する）。

生成先: 同じフォルダの se/*.wav（48kHz / 16bit / ステレオ）。
ニュース用途として控えめな4種だけを用意する:
  hook.wav   … フックシーン冒頭の低い一撃（サイン波のピッチダウン＋短いノイズ）
  whoosh.wav … タイトルシーンの柔らかい風切り音（ノイズのスイープ）
  accent.wav … アクセントテロップ出現時の小さなピン（高音サインの減衰）
  end.wav    … エンドカードの穏やかな締め（3音の和音の減衰）
各ファイルはピークをそろえて書き出し、最終的な音量バランスは runner の
ミックス時のゲイン（SE_PLAN）で決める。再生成しても同じ音になるよう乱数は固定。
"""
import math
import random
import struct
import wave
from pathlib import Path

SR = 48000
OUT = Path(__file__).parent / "se"


def write_wav(name: str, samples: list[float], peak_db: float) -> None:
    peak = max(abs(s) for s in samples) or 1.0
    gain = (10 ** (peak_db / 20.0)) / peak
    frames = b"".join(
        struct.pack("<hh", int(max(-1.0, min(1.0, s * gain)) * 32767),
                    int(max(-1.0, min(1.0, s * gain)) * 32767))
        for s in samples
    )
    with wave.open(str(OUT / name), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(frames)
    print(f"{name}: {len(samples) / SR:.2f}s peak {peak_db} dBFS")


def hook() -> list[float]:
    dur, n = 0.55, int(SR * 0.55)
    out = []
    phase = 0.0
    rnd = random.Random(42)
    for i in range(n):
        t = i / SR
        f = 48 + (130 - 48) * math.exp(-t * 9)          # 130Hz -> 48Hz
        phase += 2 * math.pi * f / SR
        env = (1 - math.exp(-t * 400)) * math.exp(-t * 7)
        thump = math.sin(phase) * env
        noise = (rnd.random() * 2 - 1) * math.exp(-t * 45) * 0.35
        out.append(thump + noise)
    return out


def whoosh() -> list[float]:
    dur, n = 0.5, int(SR * 0.5)
    rnd = random.Random(7)
    raw = [rnd.random() * 2 - 1 for _ in range(n)]
    out = []
    # 可変の移動平均（窓を狭めていく＝だんだん明るくなる）で簡易スイープにする
    for i in range(n):
        t = i / SR
        win = max(2, int(60 * (1 - t / dur) + 4))
        seg = raw[max(0, i - win):i + 1]
        v = sum(seg) / len(seg)
        env = math.sin(math.pi * min(1.0, t / dur)) ** 2
        out.append(v * env * 2.2)
    return out


def accent() -> list[float]:
    dur, n = 0.30, int(SR * 0.30)
    out = []
    for i in range(n):
        t = i / SR
        env = math.exp(-t * 16)
        v = (math.sin(2 * math.pi * 1318.5 * t)
             + 0.45 * math.sin(2 * math.pi * 2637.0 * t)) * env
        out.append(v * 0.8)
    return out


def end() -> list[float]:
    dur, n = 0.9, int(SR * 0.9)
    out = []
    notes = [(523.25, 0.50), (783.99, 0.32), (1046.50, 0.22)]
    for i in range(n):
        t = i / SR
        env = (1 - math.exp(-t * 60)) * math.exp(-t * 4.2)
        out.append(sum(g * math.sin(2 * math.pi * f * t) for f, g in notes) * env)
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    write_wav("hook.wav", hook(), -3.0)
    write_wav("whoosh.wav", whoosh(), -5.0)
    write_wav("accent.wav", accent(), -7.0)
    write_wav("end.wav", end(), -7.0)


if __name__ == "__main__":
    main()
