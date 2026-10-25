#!/usr/bin/env python3
"""worker.py の Ctrl+C 段階式ハンドリングの自動テスト（Linux 用）。

実ランナーの代わりに「数秒スリープして mp4 を置くスタブ」を
--runner-python で差し込み、dir バックエンドで以下を確認する:

  1. 処理中に SIGINT 1回 → 処理中ジョブは完了・記録され、
     次のジョブは開始されず、ワーカーは正常終了（exit 0）する
  2. 処理中に SIGINT 2回 → ワーカーが速やかに強制終了（exit 130）し、
     スタブ子プロセスとその子（孫）も残らない
  3. 待機中（キュー空）に SIGINT → 速やかに正常終了する
  4. 回帰: シグナル無しの連続処理 / --once / --dry-run

実行: python3 tools/test_worker_signals.py （全ケース PASS で exit 0）
"""
from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent
WORKER = TOOLS_DIR / "worker.py"

STUB_RUNNER = r"""#!/usr/bin/env python3
import json, os, subprocess, sys, time
from pathlib import Path

prod = Path(sys.argv[2])
out_dir = Path(sys.argv[sys.argv.index("--out") + 1])
mode = sys.argv[sys.argv.index("--mode") + 1]
data = json.loads(prod.read_text(encoding="utf-8"))
marks = Path(os.environ["STUB_DIR"])
grandchild = subprocess.Popen(["sleep", "120"])
(marks / f"started-{data['id']}").write_text(f"{os.getpid()} {grandchild.pid}")
try:
    time.sleep(float(os.environ.get("STUB_SLEEP", "5")))
finally:
    grandchild.terminate()  # 正常終了時は孫を始末する（強制終了時はツリーキルの対象）
out_dir.mkdir(parents=True, exist_ok=True)
(out_dir / f"{data['id']}-{mode}.mp4").write_bytes(b"stub")
(marks / f"finished-{data['id']}").write_text("done")
"""


def wait_for(pred, timeout: float, what: str) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if pred():
            return
        time.sleep(0.1)
    raise AssertionError(f"タイムアウト: {what}")


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    stat = Path(f"/proc/{pid}/stat")
    if stat.exists():
        try:
            if stat.read_text().rsplit(")", 1)[1].split()[0] == "Z":
                return False  # ゾンビは実質死亡
        except Exception:
            pass
    return True


class Playground:
    def __init__(self, job_ids: list[str]) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="newsreel-sigtest-"))
        self.jobs_dir = self.root / "jobs"
        self.outputs_dir = self.root / "outputs"
        self.marks = self.root / "marks"
        self.marks.mkdir(parents=True)
        for jid in job_ids:
            folder = self.jobs_dir / jid
            folder.mkdir(parents=True)
            (folder / "production.json").write_text(
                json.dumps({"id": jid, "title": f"テスト {jid}"}),
                encoding="utf-8")
        self.stub = self.root / "stub_runner.py"
        self.stub.write_text(STUB_RUNNER, encoding="utf-8")
        self.stub.chmod(0o755)
        self.log_path = self.root / "worker.log"

    def start_worker(self, stub_sleep: str, extra: list[str] | None = None,
                     ) -> subprocess.Popen:
        env = dict(os.environ, STUB_DIR=str(self.marks), STUB_SLEEP=stub_sleep)
        cmd = [sys.executable, str(WORKER), "--backend", "dir",
               "--jobs-dir", str(self.jobs_dir),
               "--outputs-dir", str(self.outputs_dir),
               "--runner-python", str(self.stub),
               "--node", "test-node"] + (extra or [])
        self.log_file = open(self.log_path, "wb")
        return subprocess.Popen(cmd, stdout=self.log_file,
                                stderr=subprocess.STDOUT, env=env)

    def log_text(self) -> str:
        try:
            return self.log_path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            return ""

    def result(self, jid: str) -> dict | None:
        p = self.jobs_dir / jid / "result.json"
        if not p.exists():
            return None
        return json.loads(p.read_text(encoding="utf-8"))

    def stub_pids(self, jid: str) -> tuple[int, int]:
        txt = (self.marks / f"started-{jid}").read_text()
        a, b = txt.split()
        return int(a), int(b)


def cleanup(p: subprocess.Popen | None) -> None:
    if p and p.poll() is None:
        p.kill()
        p.wait(timeout=5)


def test1_graceful_finish() -> None:
    pg = Playground(["job-a", "job-b"])
    w = pg.start_worker("6")
    try:
        wait_for(lambda: (pg.marks / "started-job-a").exists(), 10,
                 "job-a のスタブ開始")
        time.sleep(0.5)
        os.kill(w.pid, signal.SIGINT)
        rc = w.wait(timeout=20)
        assert rc == 0, f"exit code が 0 でない: {rc}\n{pg.log_text()}"
        assert pg.result("job-a", ) is not None and \
            pg.result("job-a")["status"] == "success", \
            f"job-a が success で記録されていない: {pg.log_text()}"
        assert not (pg.marks / "started-job-b").exists(), \
            "2件目が開始されてしまった"
        assert pg.result("job-b") is None, "2件目に result.json がある"
        assert "現在のジョブが終わったら停止します" in pg.log_text(), \
            "1回目の案内メッセージが無い"
    finally:
        cleanup(w)


def test2_force_kill() -> None:
    pg = Playground(["job-a", "job-b"])
    w = pg.start_worker("60")
    try:
        wait_for(lambda: (pg.marks / "started-job-a").exists(), 10,
                 "job-a のスタブ開始")
        stub_pid, grand_pid = pg.stub_pids("job-a")
        os.kill(w.pid, signal.SIGINT)
        time.sleep(0.4)
        t0 = time.monotonic()
        os.kill(w.pid, signal.SIGINT)
        rc = w.wait(timeout=10)
        elapsed = time.monotonic() - t0
        assert rc == 130, f"exit code が 130 でない: {rc}\n{pg.log_text()}"
        assert elapsed < 5, f"強制終了に時間がかかりすぎ: {elapsed:.1f}s"
        wait_for(lambda: not pid_alive(stub_pid), 3, "スタブの終了")
        wait_for(lambda: not pid_alive(grand_pid), 3, "スタブ孫プロセスの終了")
        assert pg.result("job-a") is None, \
            "強制終了なのに result.json が書かれている"
    finally:
        cleanup(w)


def test3_idle_sigint() -> None:
    pg = Playground([])  # キュー空
    w = pg.start_worker("1")
    try:
        wait_for(lambda: "キューは空です" in pg.log_text(), 10, "待機状態")
        t0 = time.monotonic()
        os.kill(w.pid, signal.SIGINT)
        rc = w.wait(timeout=8)
        elapsed = time.monotonic() - t0
        assert rc == 0, f"exit code が 0 でない: {rc}\n{pg.log_text()}"
        assert elapsed < 5, f"待機中の停止が遅い: {elapsed:.1f}s"
    finally:
        cleanup(w)


def test4_regression() -> None:
    # 連続処理（--idle-exit）: 2件とも成功して exit 0
    pg = Playground(["job-a", "job-b"])
    w = pg.start_worker("0.3", ["--idle-exit"])
    try:
        rc = w.wait(timeout=30)
        assert rc == 0, f"連続処理の exit code: {rc}\n{pg.log_text()}"
        assert pg.result("job-a")["status"] == "success"
        assert pg.result("job-b")["status"] == "success"
    finally:
        cleanup(w)

    # --once: 1件だけ
    pg = Playground(["job-a", "job-b"])
    w = pg.start_worker("0.3", ["--once"])
    try:
        rc = w.wait(timeout=30)
        assert rc == 0, f"--once の exit code: {rc}\n{pg.log_text()}"
        assert pg.result("job-a")["status"] == "success"
        assert pg.result("job-b") is None
    finally:
        cleanup(w)

    # --dry-run: 列挙のみ。result.json は作られない
    pg = Playground(["job-a", "job-b"])
    w = pg.start_worker("0.3", ["--dry-run"])
    try:
        rc = w.wait(timeout=30)
        assert rc == 0, f"--dry-run の exit code: {rc}\n{pg.log_text()}"
        assert "未処理ジョブ: 2 件" in pg.log_text(), pg.log_text()
        assert pg.result("job-a") is None and pg.result("job-b") is None
    finally:
        cleanup(w)


def main() -> int:
    tests = [
        ("1. SIGINT 1回: 処理中ジョブ完了・次を開始せず正常終了",
         test1_graceful_finish),
        ("2. SIGINT 2回: 即・強制終了し子ツリーも残らない", test2_force_kill),
        ("3. 待機中に SIGINT: 速やかに正常終了", test3_idle_sigint),
        ("4. 回帰: 連続処理 / --once / --dry-run", test4_regression),
    ]
    failed = 0
    for name, fn in tests:
        t0 = time.monotonic()
        try:
            fn()
            print(f"PASS {name}（{time.monotonic() - t0:.1f}s）")
        except Exception as e:
            failed += 1
            print(f"FAIL {name}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} PASS")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
