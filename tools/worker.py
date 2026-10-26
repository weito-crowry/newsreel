#!/usr/bin/env python3
"""newsreel ワーカー — ジョブ自動取得＋連続処理モード

「脚本済み」の題材をジョブとして自動で掴み、既存の制作ランナー（runner.py）で
動画生成し、結果を記録するまでを繰り返す常駐型ツールです。
runner.py 本体には手を入れず、サブプロセスとして呼び出します
（通常モード＝単発生成の挙動は変わりません）。

ジョブ取得バックエンドは3種類あります（--backend）:

  sheet : Google スプレッドシート「AIニュース収集」のニュースタブをジョブキュー
          として使う。読み書きは gws CLI（/opt/hatch/bin/hatch_gws_cli）経由。
          Muse の VM など gws CLI がある環境専用。

  sheetapi : 同じシートをジョブキューとして使うが、読み書きは Google Sheets
          API を OAuth 認証で直接叩く（tools/sheets_api.py、標準ライブラリのみ）。
          キュー意味論は sheet と完全に同じで、実装だけが違う。gws CLI が無い
          環境（Tanaka の Windows ノード等）でも Muse の橋渡しなしにシートへ
          直接記録できる。初回だけ認証が要る:
            python tools/sheets_api.py auth --credentials <クライアントJSON>
          以後は --sheets-credentials <クライアントJSON> を指定して使う
          （トークンは credentials と同じフォルダの newsreel_token.json に
          自動保存され、自動更新される。再認証が要る場合はエラーで止まる）。
            - 1題材＝1グループ（N列グループID）。代表記事の行がジョブ単位。
            - D列=脚本済み かつ O列（担当ノード）が空の代表行が未処理ジョブ。
            - claim: 代表行の O列にノード名、P列に開始時刻（JST）を書き、
              数秒待って再読し、他ノードの名前に変わっていたら譲る（緩い排他）。
            - 成功: 代表行の D列=動画化済み、Q列に完了時刻、R列に
              「ノード名: 出力mp4の絶対パス」を記録。グループの他メンバー行は
              D列だけ 脚本済み→動画化済み に追随させる（脚本済み以外の行は触らない）。
            - 失敗: 代表行の R列にエラーの要旨を残し、claim（O/P列）を解放
              してキューを未取得に戻し、次のジョブへ進む（D列は脚本済みの
              まま。この起動中は再試行せず、次回起動時に再試行される）。

  dir   : 指定フォルダ（Drive 同期フォルダ想定）配下のジョブフォルダ
          （production.json を含むフォルダ）を列挙して処理し、各フォルダに
          result.json を書き出す。**シートへの反映はこのツールでは行わない**
          （Windows ノード用。シートへの橋渡しは Muse 側が result.json を
          見て行う想定。コード上の区別は SheetBackend / DirBackend クラス）。
          result.json の status が success のフォルダは処理済みとしてスキップ
          する（error のものは次回起動時に再試行される）。

素材（production.json）の置き場所:
  sheet バックエンドでは --scripts-dir（既定 ~/workspace/newsreel-scripts/scripts、
  Drive 共有フォルダの scripts）から探す。シート行との対応付けは
  (1) フォルダ名＝代表記事ID、(2) production.json の id＝代表記事ID、
  (3) エンドカード出典URLとグループ全メンバーの記事URLの一致、の順で解決する。
  フォルダ名の規約は YYYY-MM-DD_<代表記事ID>（日付プレフィックス）で、この場合は
  (2) の id 一致で解決される。
  dir バックエンドでは --jobs-dir 配下のフォルダ自体がジョブ。

生成物はノードのローカル（--outputs-dir、既定 ~/workspace/newsreel-outputs）に
置き、アップロードはしない。シートにはノード名とローカルパスだけを記録する。

設定ファイル（TOML）:
  ノード固有のパスや設定は、コードや GitHub に書かず、各ノードのローカル設定
  ファイル newsreel.toml で持つ（.gitignore 済み。書式はパッケージ直下の
  newsreel.example.toml を参照）。--config <path> で明示指定でき、省略時は
  カレントディレクトリ → パッケージ直下の順に newsreel.toml を探す。
  優先順位は CLI引数 > TOML（[worker] テーブル） > 既定値。

辞書の自動発見:
  --voice-dir が明示されていない場合、Drive 共有レイアウトの辞書があれば
  それを優先する。探す場所はバックエンドごとに、dir では
  <jobs-dir>/../voice/reading_dict.json、sheet / sheetapi では
  <scripts-dir>/../voice/reading_dict.json。パッケージ voice/ の
  適用スクリプトと Drive の辞書を組み合わせた作業用 voice dir を一時フォルダに
  自動構成して runner へ渡す（元のファイルは変更しない）。
  ※ sheetapi でこの自動発見が効かず、クローン側の古い辞書（GitHub 配布時の
  約40件）で合成して固有名詞が軒並みスペル読みになった事故を受けた修正
  （2026-10-26、gigazine-0d7871905c64 の production-log で判明）。

使い方:
  # Muse VM（sheet バックエンド、実ジョブを1件だけ dev で処理）
  python3 tools/worker.py --backend sheet --once --mode dev --node muse-vm

  # Muse VM（キューが空になるまで連続処理）
  python3 tools/worker.py --backend sheet --mode dev --node muse-vm --idle-exit

  # Windows ノード（dir バックエンド、Drive 同期フォルダを監視）
  python tools\\worker.py --backend dir --jobs-dir D:\\newsreel-scripts\\scripts ^
      --mode final --synth http --node weito-pc

  # Windows ノード（sheetapi バックエンド、シートへ直接連携。要・初回認証）
  python tools\\worker.py --backend sheetapi ^
      --sheets-credentials C:\\newsreel\\client_secret.json ^
      --mode final --synth http --node weito-pc

  # 設定ファイルを使って起動（ノード固有の設定は TOML 側に書く）
  python tools\\worker.py --config C:\\newsreel\\newsreel.toml

  # ジョブ一覧だけ見る（claim も生成もしない）
  python3 tools/worker.py --backend sheet --dry-run

Ctrl+C は段階式です:
  1回目 … 処理中のジョブは最後まで進め（生成→結果記録まで完了）、
          次のジョブは開始せずに正常終了します。待機中なら速やかに終了します。
  2回目 … ランナー子プロセス（とその子孫）ごと即座に強制終了します。
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
try:
    import tomllib  # Python 3.11+
except ModuleNotFoundError:  # Python 3.10 以下は pip install tomli で代替
    import tomli as tomllib
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sheets_api import SheetsAuthNeeded, SheetsClient, default_token_path

JST = timezone(timedelta(hours=9))
PACKAGE_DIR = Path(__file__).resolve().parent.parent
RUNNER = PACKAGE_DIR / "runner" / "runner.py"
DEFAULT_PROJECT = PACKAGE_DIR / "template"
DEFAULT_VOICE_DIR = PACKAGE_DIR / "voice"
SPREADSHEET_ID = "1F73m5bKIqvS9fFbOP1_hnvtPzFro5021S108Rgb4R3c"
SHEET_NAME = "ニュース"
DEFAULT_GWS_CLI = "/opt/hatch/bin/hatch_gws_cli"
NCOLS = 18  # A..R

# 列インデックス（0始まり）
COL_ID, COL_STATUS, COL_URL, COL_TITLE, COL_GROUP, COL_NODE, COL_START, COL_DONE, COL_OUT = (
    0, 3, 4, 8, 13, 14, 15, 16, 17,
)
STATUS_READY = "脚本済み"
STATUS_DONE = "動画化済み"


def jst_now() -> str:
    return datetime.now(JST).isoformat(timespec="seconds")


def log(msg: str) -> None:
    print(f"[{datetime.now(JST).strftime('%H:%M:%S')}] {msg}", flush=True)


def norm_url(u: str) -> str:
    u = (u or "").strip()
    u = u.split("#")[0]
    return u.rstrip("/")


# ---------------------------------------------------------------- 素材索引

class MaterialIndex:
    """scripts-dir 配下の production.json を走査し、シートのグループと対応付ける。"""

    def __init__(self, scripts_dir: Path) -> None:
        self.entries: list[dict] = []
        if not scripts_dir.is_dir():
            return
        for folder in sorted(scripts_dir.iterdir()):
            pj = folder / "production.json"
            if not folder.is_dir() or not pj.exists():
                continue
            try:
                data = json.loads(pj.read_text(encoding="utf-8"))
            except Exception:
                continue
            urls = set()
            for scene in data.get("scenes", []):
                for src in scene.get("endCard", {}).get("sources", []):
                    if src.get("url"):
                        urls.add(norm_url(src["url"]))
            self.entries.append(
                {
                    "folder": folder.name,
                    "path": pj,
                    "prod_id": data.get("id", folder.name),
                    "title": data.get("title", ""),
                    "urls": urls,
                }
            )

    def resolve(self, rep_id: str, member_urls: list[str]) -> dict | None:
        for e in self.entries:
            if e["folder"] == rep_id or e["prod_id"] == rep_id:
                return e
        wanted = {norm_url(u) for u in member_urls if u}
        for e in self.entries:
            if wanted & e["urls"]:
                return e
        return None


# ---------------------------------------------------------------- ジョブ表現

class Job:
    def __init__(self, key: str, title: str) -> None:
        self.key = key                # sheet: グループID / dir: フォルダ名
        self.title = title
        self.material: dict | None = None   # MaterialIndex のエントリ
        self.rep_row: int = 0               # sheet バックエンド用: 代表行の行番号
        self.member_rows: list[int] = []    # sheet バックエンド用: 脚本済みの他メンバー行
        self.folder_path: Path | None = None  # dir バックエンド用: ジョブフォルダ


# ---------------------------------------------------------------- sheet バックエンド

class SheetBackend:
    """gws CLI 経由でスプレッドシートを読み書きするジョブキュー。"""

    def __init__(self, gws_cli: str, spreadsheet_id: str) -> None:
        self.gws = gws_cli
        self.sid = spreadsheet_id

    def _gws(self, method_args: list[str], params: dict, body: dict | None = None) -> dict:
        cmd = [self.gws, "sheets", "spreadsheets"] + method_args + ["--params", json.dumps(params)]
        if body is not None:
            cmd += ["--json", json.dumps(body)]
        r = subprocess.run(cmd, capture_output=True, text=True)
        try:
            out = json.loads(r.stdout) if r.stdout.strip() else {}
        except json.JSONDecodeError:
            raise RuntimeError(f"gws の出力が JSON ではありません: {r.stdout[:300]} {r.stderr[:300]}")
        if isinstance(out, dict) and out.get("error"):
            raise RuntimeError(f"gws エラー: {out['error']}")
        if r.returncode != 0:
            raise RuntimeError(f"gws 失敗 (exit {r.returncode}): {r.stderr[:300]}")
        return out

    def read_rows(self) -> list[list[str]]:
        out = self._gws(
            ["values", "get"],
            {"spreadsheetId": self.sid, "range": f"{SHEET_NAME}!A1:R2000"},
        )
        rows = []
        for r in out.get("values", []):
            rows.append([str(c) for c in r] + [""] * (NCOLS - len(r)))
        return rows

    def read_row(self, rownum: int) -> list[str]:
        out = self._gws(
            ["values", "get"],
            {"spreadsheetId": self.sid, "range": f"{SHEET_NAME}!A{rownum}:R{rownum}"},
        )
        vals = out.get("values", [[]])
        r = [str(c) for c in vals[0]] if vals else []
        return r + [""] * (NCOLS - len(r))

    def batch_update(self, updates: list[tuple[str, list[list[str]]]]) -> None:
        """updates: [(range, values), ...] を batchUpdate でまとめて書く。"""
        data = [
            {"range": rng, "majorDimension": "ROWS", "values": vals}
            for rng, vals in updates
        ]
        self._gws(
            ["values", "batchUpdate"],
            {"spreadsheetId": self.sid, "valueInputOption": "RAW"},
            {"valueInputOption": "RAW", "data": data},
        )

    # ---- ジョブ操作 ----

    def list_jobs(self, index: MaterialIndex) -> list[Job]:
        rows = self.read_rows()
        groups: dict[str, list[tuple[int, list[str]]]] = {}
        for i, r in enumerate(rows[1:], start=2):  # 1行目はヘッダ
            gid = r[COL_GROUP] or r[COL_ID]
            if gid:
                groups.setdefault(gid, []).append((i, r))
        jobs: list[Job] = []
        for gid, members in groups.items():
            rep = next(((i, r) for i, r in members if r[COL_ID] == gid), None)
            if rep is None:
                continue
            ri, rr = rep
            if rr[COL_STATUS] != STATUS_READY or rr[COL_NODE].strip():
                continue
            job = Job(gid, rr[COL_TITLE])
            job.rep_row = ri
            job.member_rows = [
                i for i, r in members if i != ri and r[COL_STATUS] == STATUS_READY
            ]
            job.material = index.resolve(gid, [r[COL_URL] for _, r in members])
            jobs.append(job)
        return jobs

    def claim(self, job: Job, node: str, claim_wait: float) -> bool:
        """O/P列を書いて数秒後に再読し、自分の名前のままなら claim 成立。"""
        self.batch_update(
            [(f"{SHEET_NAME}!O{job.rep_row}:P{job.rep_row}", [[node, jst_now()]])]
        )
        if claim_wait > 0:
            time.sleep(claim_wait)
        row = self.read_row(job.rep_row)
        if row[COL_NODE] != node:
            log(f"  claim 競合: {job.key} は {row[COL_NODE] or '(空)'} が取得。譲ります")
            return False
        return True

    def record_success(self, job: Job, node: str, out_path: Path) -> None:
        updates: list[tuple[str, list[list[str]]]] = [
            (f"{SHEET_NAME}!D{job.rep_row}", [[STATUS_DONE]]),
            (f"{SHEET_NAME}!Q{job.rep_row}:R{job.rep_row}",
             [[jst_now(), f"{node}: {out_path}"]]),
        ]
        for mr in job.member_rows:
            updates.append((f"{SHEET_NAME}!D{mr}", [[STATUS_DONE]]))
        self.batch_update(updates)

    def record_failure(self, job: Job, node: str, summary: str) -> None:
        """失敗したら、R列にエラーの要旨（メッセージ）を残し、claim（O/P列）
        を解放してキューを未取得の状態に戻す。この起動中は呼び出し側の
        blocked 管理で再試行せず、次のジョブへ進む。次回起動時に再試行される。"""
        self.batch_update([
            (f"{SHEET_NAME}!R{job.rep_row}", [[f"{node}: ERROR: {summary}"]]),
            (f"{SHEET_NAME}!O{job.rep_row}:P{job.rep_row}", [["", ""]]),
        ])


class SheetApiBackend(SheetBackend):
    """SheetBackend と同じキュー意味論で、読み書きだけ Sheets API 経由にする。

    list_jobs / claim / record_* は親クラスの実装をそのまま使う（違いは
    read_rows / read_row / batch_update の3プリミティブだけ）。
    """

    def __init__(self, client: SheetsClient, spreadsheet_id: str) -> None:
        self.client = client
        self.sid = spreadsheet_id

    def read_rows(self) -> list[list[str]]:
        vals = self.client.get_values(self.sid, f"{SHEET_NAME}!A1:R2000")
        rows = []
        for r in vals:
            rows.append([str(c) for c in r] + [""] * (NCOLS - len(r)))
        return rows

    def read_row(self, rownum: int) -> list[str]:
        vals = self.client.get_values(
            self.sid, f"{SHEET_NAME}!A{rownum}:R{rownum}")
        r = [str(c) for c in vals[0]] if vals else []
        return r + [""] * (NCOLS - len(r))

    def batch_update(self, updates: list[tuple[str, list[list[str]]]]) -> None:
        """updates: [(range, values), ...] を values:batchUpdate でまとめて書く。"""
        data = [
            {"range": rng, "majorDimension": "ROWS", "values": vals}
            for rng, vals in updates
        ]
        self.client.batch_update_values(self.sid, data)


# ---------------------------------------------------------------- dir バックエンド

class DirBackend:
    """ジョブフォルダを列挙し、結果を各フォルダの result.json に書き出す。

    シートへの反映は行わない（Windows ノード用。シートへの橋渡しは Muse 側）。
    """

    def __init__(self, jobs_dir: Path) -> None:
        self.jobs_dir = jobs_dir

    def list_jobs(self) -> list[Job]:
        jobs: list[Job] = []
        if not self.jobs_dir.is_dir():
            return jobs
        for folder in sorted(self.jobs_dir.iterdir()):
            pj = folder / "production.json"
            if not folder.is_dir() or not pj.exists():
                continue
            result = folder / "result.json"
            if result.exists():
                try:
                    st = json.loads(result.read_text(encoding="utf-8")).get("status")
                except Exception:
                    st = None
                if st == "success":
                    continue  # 処理済み。再処理したい場合は result.json を消す
            try:
                data = json.loads(pj.read_text(encoding="utf-8"))
                title = data.get("title", folder.name)
                prod_id = data.get("id", folder.name)
            except Exception:
                title, prod_id = folder.name, folder.name
            job = Job(folder.name, title)
            job.folder_path = folder
            job.material = {"folder": folder.name, "path": pj, "prod_id": prod_id}
            jobs.append(job)
        return jobs

    def _write_result(self, job: Job, payload: dict) -> None:
        assert job.folder_path is not None
        (job.folder_path / "result.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8"
        )

    def record_success(self, job: Job, node: str, out_path: Path,
                       started: str) -> None:
        self._write_result(job, {
            "status": "success", "node": node, "folder": job.key,
            "started_at": started, "finished_at": jst_now(),
            "output": str(out_path),
        })

    def record_failure(self, job: Job, node: str, summary: str,
                       started: str) -> None:
        self._write_result(job, {
            "status": "error", "node": node, "folder": job.key,
            "started_at": started, "finished_at": jst_now(),
            "error": summary,
        })


# ---------------------------------------------------------------- 生成実行

class Runner:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.proc: subprocess.Popen | None = None

    def run(self, production_json: Path, prod_id: str, out_dir: Path) -> Path:
        """runner.py をサブプロセスで実行し、完成mp4のパスを返す。失敗時は例外。"""
        a = self.args
        cmd = [
            a.runner_python, str(RUNNER), str(production_json),
            "--mode", a.mode,
            "--project", str(a.project),
            "--voice-dir", str(a.voice_dir),
            "--out", str(out_dir),
            "--synth", a.synth,
        ]
        if a.synth == "http":
            cmd += ["--engine-url", a.engine_url]
        log(f"  実行: {' '.join(cmd)}")
        # Ctrl+C がランナー側へ伝わらないよう、コンソール/端末のプロセス
        # グループから切り離して起動する（1回目の Ctrl+C で処理中ジョブが
        # 巻き添えで死なないように。2回目の強制終了は force_kill で行う）。
        popen_kw: dict = {}
        if os.name == "nt":
            # 新しいプロセスグループでは CTRL_C_EVENT が無効化される
            popen_kw["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            popen_kw["start_new_session"] = True
        self.proc = subprocess.Popen(cmd, **popen_kw)
        try:
            rc = self.proc.wait()
        finally:
            self.proc = None
        if rc != 0:
            raise RuntimeError(f"runner.py が異常終了しました（exit {rc}）")
        out_file = out_dir / f"{prod_id}-{a.mode}.mp4"
        if not out_file.exists():
            raise RuntimeError(f"完成mp4が見つかりません: {out_file}")
        return out_file

    def force_kill(self) -> None:
        """ランナー子プロセスを子孫ごと強制終了する（2回目の Ctrl+C 用）。

        注意: シグナルハンドラ経由で呼ばれるため、Popen の poll()/wait() は
        使わない。メインスレッドが wait() 中だと _waitpid_lock を掴んだまま
        固まる。kill は pid に対する OS 呼び出しだけで完結させる（子が既に
        終わっていれば例外になるが、その場合は何もしなくてよい）。
        """
        proc = self.proc
        if proc is None:
            return
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                capture_output=True,
            )
        else:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                try:
                    os.kill(proc.pid, signal.SIGKILL)
                except Exception:
                    pass


def err_summary(exc: Exception, limit: int = 180) -> str:
    s = " ".join(str(exc).split())
    return s[:limit]


# ---------------------------------------------------------------- Ctrl+C 制御

class StopController:
    """Ctrl+C（SIGINT）の段階式ハンドリング。

    1回目: 停止フラグを立てるだけ（例外は投げないので、処理中ジョブの
    subprocess.wait() 等はそのまま継続する）。メインループは現在の
    ジョブを生成→結果記録まで完了させ、次のジョブを開始せずに正常
    終了する。待機中のスリープはフラグを見て速やかに抜ける。
    2回目: 強制終了フラグを立て、ウォッチドッグスレッドがランナー子
    プロセスのツリーごと強制終了する。メインスレッドは子が死んで
    wait() から戻った時点でフラグを見て記録をせずに exit し、それでも
    止まらない場合はウォッチドッグが os._exit する。
    ハンドラ内では Popen の wait()/poll() を呼ばない（メインスレッドが
    wait() 中に _waitpid_lock を保持していて固まるため）。
    """

    FORCE_EXIT_GRACE = 2.0  # ウォッチドッグが os._exit するまでの猶予（秒）

    def __init__(self) -> None:
        self.requested = False
        self.force_exiting = False
        self._presses = 0
        self._runner: Runner | None = None

    def install(self) -> None:
        signal.signal(signal.SIGINT, self._handle)

    def attach(self, runner: Runner) -> None:
        self._runner = runner

    def _handle(self, signum, frame) -> None:
        self._presses += 1
        if self._presses >= 2:
            if not self.force_exiting:
                self.force_exiting = True
                print("\nCtrl+C が2回押されました。強制終了します", flush=True)
                threading.Thread(target=self._watchdog, daemon=True,
                                 name="ctrl-c-watchdog").start()
            return
        self.requested = True
        log("Ctrl+C: 現在のジョブが終わったら停止します"
            "（もう一度 Ctrl+C を押すと強制終了します）")

    def _watchdog(self) -> None:
        if self._runner is not None:
            try:
                self._runner.force_kill()
            except Exception:
                pass
        time.sleep(self.FORCE_EXIT_GRACE)
        os._exit(130)


def sleep_or_stop(seconds: float, stop: StopController) -> bool:
    """停止フラグを見ながら待つ。フラグが立ったら True を返して早期に抜ける。"""
    deadline = time.monotonic() + max(0.0, seconds)
    while not stop.requested:
        remain = deadline - time.monotonic()
        if remain <= 0:
            return False
        time.sleep(min(remain, 0.2))
    return True


# ---------------------------------------------------------------- メイン

# ---------------------------------------------------------------- 設定ファイル（TOML）

# TOML で指定できるキー（= argparse の dest 名）と、その型の種別。
# 優先順位: CLI引数 > TOML（[worker] テーブル、無ければトップレベル） > 既定値
CONFIG_KEYS: dict[str, str] = {
    "backend": "str", "node": "str", "mode": "str",
    "scripts_dir": "path", "jobs_dir": "path", "outputs_dir": "path",
    "project": "path", "voice_dir": "path",
    "synth": "str", "engine_url": "str", "runner_python": "str",
    "gws_cli": "str", "spreadsheet_id": "str",
    "sheets_credentials": "path", "sheets_token": "path",
    "max_jobs": "int", "once": "bool", "interval": "float",
    "idle_exit": "bool", "claim_wait": "float", "only_group": "str",
    "dry_run": "bool",
}
PATH_KEYS = {k for k, v in CONFIG_KEYS.items() if v == "path"}


def _builtin_defaults() -> dict:
    return {
        "backend": "sheet",
        "node": os.environ.get("NEWSREEL_NODE") or socket.gethostname(),
        "mode": "dev",
        "scripts_dir": Path.home() / "workspace" / "newsreel-scripts" / "scripts",
        "jobs_dir": None,
        "outputs_dir": Path.home() / "workspace" / "newsreel-outputs",
        "project": DEFAULT_PROJECT,
        "voice_dir": DEFAULT_VOICE_DIR,
        "synth": "core",
        "engine_url": "http://localhost:50021",
        "runner_python": None,
        "gws_cli": DEFAULT_GWS_CLI,
        "spreadsheet_id": SPREADSHEET_ID,
        "sheets_credentials": None,
        "sheets_token": None,
        "max_jobs": 0,
        "once": False,
        "interval": 60.0,
        "idle_exit": False,
        "claim_wait": 3.0,
        "only_group": None,
        "dry_run": False,
    }


def load_config(explicit_path: Path | None) -> tuple[dict, Path | None]:
    """TOML 設定を読み、(設定dict, 使ったファイルのパス) を返す。

    探索順: --config 明示 → ./newsreel.toml → パッケージ直下の newsreel.toml。
    [worker] テーブルがあればそれを、無ければトップレベルをそのまま使う。
    未知のキーは警告だけ出して読み飛ばす。
    """
    path: Path | None = None
    if explicit_path is not None:
        if not explicit_path.is_file():
            raise SystemExit(f"エラー: 設定ファイルが見つかりません: {explicit_path}")
        path = explicit_path
    else:
        for cand in (Path.cwd() / "newsreel.toml", PACKAGE_DIR / "newsreel.toml"):
            if cand.is_file():
                path = cand
                break
    if path is None:
        return {}, None
    try:
        raw = tomllib.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        raise SystemExit(f"エラー: 設定ファイル {path} の読み込みに失敗しました: {e}")
    table = raw.get("worker", raw)
    if not isinstance(table, dict):
        raise SystemExit(f"エラー: 設定ファイル {path} の [worker] がテーブルではありません")
    cfg: dict = {}
    for key, val in table.items():
        if key in CONFIG_KEYS:
            cfg[key] = val
        else:
            print(f"警告: 設定ファイルの未知のキー '{key}' は無視します（{path}）",
                  file=sys.stderr)
    return cfg, path


def _coerce(key: str, val, from_config: bool):
    """TOML 由来の値を argparse と同じ型へ寄せる（CLI 由来はそのまま）。"""
    if not from_config or val is None:
        return val
    kind = CONFIG_KEYS[key]
    if kind == "path":
        return Path(str(val)).expanduser()
    if kind == "int":
        return int(val)
    if kind == "float":
        return float(val)
    if kind == "bool":
        return bool(val)
    return val


def parse_args(argv: list[str]) -> tuple[argparse.Namespace, dict]:
    # 第1段: --config だけを先に拾う
    pre = argparse.ArgumentParser(add_help=False)
    pre.add_argument("--config", type=Path, default=None)
    pre_args, _ = pre.parse_known_args(argv)
    cfg, cfg_path = load_config(pre_args.config)

    # 第2段: 本パース。全オプション default=SUPPRESS にし、「明示されたもの」
    # だけを取り出して TOML・既定値と合成する
    ap = argparse.ArgumentParser(
        description="newsreel ワーカー（ジョブ自動取得＋連続処理）",
        epilog="設定ファイル: --config <path> で TOML を指定（省略時は ./newsreel.toml → "
               "パッケージ直下の順に探す）。優先順位は CLI引数 > TOML > 既定値。"
               "書式は newsreel.example.toml を参照。")
    S = argparse.SUPPRESS
    ap.add_argument("--config", type=Path, default=S,
                    help="設定ファイル（TOML）のパス")
    ap.add_argument("--backend", choices=["sheet", "dir", "sheetapi"], default=S,
                    help="ジョブ取得バックエンド（既定: sheet）")
    ap.add_argument("--node", default=S,
                    help="ノード名。シートの担当ノード列に記録される（既定: 環境変数 NEWSREEL_NODE、なければホスト名）")
    ap.add_argument("--mode", choices=["dev", "final"], default=S,
                    help="生成画質（既定: dev）")
    ap.add_argument("--scripts-dir", type=Path, default=S,
                    help="sheet / sheetapi 用: production.json 素材フォルダの親（Drive 共有フォルダの scripts）")
    ap.add_argument("--jobs-dir", type=Path, default=S,
                    help="dir 用: ジョブフォルダの親（Drive同期フォルダ等）")
    ap.add_argument("--outputs-dir", type=Path, default=S,
                    help="完成mp4の出力先（ノードのローカル）")
    ap.add_argument("--project", type=Path, default=S,
                    help="Remotion テンプレートプロジェクト")
    ap.add_argument("--voice-dir", type=Path, default=S,
                    help="読み替え辞書一式（既定: パッケージ voice/。Drive 共有レイアウトの辞書があれば自動発見して優先）")
    ap.add_argument("--synth", choices=["core", "http"], default=S,
                    help="合成バックエンド（既定: core）")
    ap.add_argument("--engine-url", default=S,
                    help="--synth http の接続先")
    ap.add_argument("--runner-python", default=S,
                    help="runner.py を実行する Python（既定: core の場合は voicevox venv、http の場合は現在の Python）")
    ap.add_argument("--gws-cli", default=S,
                    help="sheet バックエンドが使う gws CLI のパス")
    ap.add_argument("--spreadsheet-id", default=S,
                    help="ジョブ管理スプレッドシートの ID")
    ap.add_argument("--sheets-credentials", type=Path, default=S,
                    help="sheetapi 用: Google Cloud Console から取得した OAuth クライアントJSONのパス")
    ap.add_argument("--sheets-token", type=Path, default=S,
                    help="sheetapi 用: トークンファイルのパス（既定: credentials と同じフォルダの newsreel_token.json）")
    ap.add_argument("--max-jobs", type=int, default=S,
                    help="処理するジョブ数の上限（0 = 無制限）")
    ap.add_argument("--once", action="store_true", default=S, help="1件だけ処理して終了")
    ap.add_argument("--interval", type=float, default=S,
                    help="キューが空のときのポーリング間隔（秒、既定: 60）")
    ap.add_argument("--idle-exit", action="store_true", default=S,
                    help="キューが空なら待たずに終了する")
    ap.add_argument("--claim-wait", type=float, default=S,
                    help="claim 書き込み後に再読するまでの待ち時間（秒、既定: 3）")
    ap.add_argument("--only-group", default=S,
                    help="このグループID（dir ではフォルダ名）のジョブだけを対象にする")
    ap.add_argument("--dry-run", action="store_true", default=S,
                    help="ジョブ一覧を表示するだけ（claim・生成・記録をしない）")
    cli = vars(ap.parse_args(argv))
    cli.pop("config", None)

    defaults = _builtin_defaults()
    merged: dict = {}
    explicit: set[str] = set()   # CLI か TOML で明示されたキー
    for key in CONFIG_KEYS:
        if key in cli:
            merged[key] = cli[key]
            explicit.add(key)
        elif key in cfg:
            merged[key] = _coerce(key, cfg[key], from_config=True)
            explicit.add(key)
        else:
            merged[key] = defaults[key]
    args = argparse.Namespace(**merged)

    for key, choices in (("backend", ("sheet", "dir", "sheetapi")),
                         ("mode", ("dev", "final")),
                         ("synth", ("core", "http"))):
        if getattr(args, key) not in choices:
            raise SystemExit(f"エラー: 設定 '{key}' の値が不正です: {getattr(args, key)!r}"
                             f"（有効値: {', '.join(choices)}）")

    if args.runner_python is None:
        venv_py = Path.home() / "workspace" / "voicevox" / "venv" / "bin" / "python"
        if os.name == "nt":
            venv_py = Path.home() / "workspace" / "voicevox" / "venv" / "Scripts" / "python.exe"
        if args.synth == "core" and venv_py.exists():
            args.runner_python = str(venv_py)
        else:
            args.runner_python = sys.executable
    return args, {"config_path": cfg_path, "explicit": explicit}


def resolve_voice_dir(args: argparse.Namespace, explicit: set[str]) -> None:
    """辞書の自動発見（全バックエンド共通）。

    --voice-dir が明示されていない場合、Drive 共有レイアウトの
    voice/reading_dict.json（newsreel/voice/reading_dict.json）があれば
    それを優先する。探す場所は、dir では <jobs-dir> の親、sheet / sheetapi
    では <scripts-dir> の親。runner は「apply_reading_dict.py と同じ
    フォルダの reading_dict.json」を読むため、パッケージ voice/ の
    スクリプト群と Drive の辞書を一時フォルダに組み合わせて作業用
    voice dir を構成する。元のファイル（パッケージ voice/ と Drive 側）は
    変更しない。
    """
    if "voice_dir" in explicit:
        return
    parents: list[Path] = []
    if args.backend == "dir" and args.jobs_dir is not None:
        parents.append(args.jobs_dir.parent)
    if args.backend in ("sheet", "sheetapi") and args.scripts_dir is not None:
        parents.append(args.scripts_dir.parent)
    drive_dict: Path | None = None
    for parent in parents:
        candidate = parent / "voice" / "reading_dict.json"
        if candidate.is_file():
            drive_dict = candidate
            break
    if drive_dict is None:
        return
    if drive_dict.resolve() == (DEFAULT_VOICE_DIR / "reading_dict.json").resolve():
        return  # 既に同じ辞書（パッケージ直下が jobs の隣にある構成など）
    work = Path(tempfile.gettempdir()) / "newsreel-voice-autodiscovered"
    work.mkdir(parents=True, exist_ok=True)
    for py in sorted(DEFAULT_VOICE_DIR.glob("*.py")):
        shutil.copy2(py, work / py.name)
    shutil.copy2(drive_dict, work / "reading_dict.json")
    args.voice_dir = work
    log(f"辞書を自動発見: {drive_dict} を優先します（作業用 voice dir: {work}）")


def main(argv: list[str]) -> int:
    args, info = parse_args(argv)
    if info["config_path"] is not None:
        log(f"設定ファイル: {info['config_path']}")
    resolve_voice_dir(args, info["explicit"])
    runner = Runner(args)
    stop = StopController()
    stop.install()
    stop.attach(runner)
    node = args.node
    log(f"newsreel worker 起動: backend={args.backend} node={node} mode={args.mode} synth={args.synth}")

    sheet: SheetBackend | None = None
    dirb: DirBackend | None = None
    index: MaterialIndex | None = None
    if args.backend in ("sheet", "sheetapi"):
        if args.backend == "sheet":
            if not Path(args.gws_cli).exists():
                raise SystemExit(f"エラー: gws CLI が見つかりません: {args.gws_cli}"
                                 "（sheet バックエンドは gws CLI のある環境専用です）")
            sheet = SheetBackend(args.gws_cli, args.spreadsheet_id)
        else:
            if args.sheets_credentials is None:
                raise SystemExit(
                    "エラー: sheetapi バックエンドでは --sheets-credentials "
                    "（Google Cloud Console から取得した OAuth クライアントJSON）が必須です")
            token_path = (args.sheets_token
                          or default_token_path(args.sheets_credentials))
            try:
                client = SheetsClient(args.sheets_credentials, token_path)
                client.access_token()  # 認証が切れていれば生成前にここで止める
            except SheetsAuthNeeded as e:
                raise SystemExit(f"エラー: {e}")
            sheet = SheetApiBackend(client, args.spreadsheet_id)
            log(f"Sheets API 連携: トークン {token_path}")
        index = MaterialIndex(args.scripts_dir)
        log(f"素材フォルダ: {args.scripts_dir}（{len(index.entries)} 件の production.json）")
    else:
        if args.jobs_dir is None:
            raise SystemExit("エラー: --backend dir では --jobs-dir が必要です")
        dirb = DirBackend(args.jobs_dir)
        log(f"ジョブフォルダ: {args.jobs_dir}")
        log(f"辞書フォルダ: {args.voice_dir}")

    def enumerate_jobs() -> list[Job]:
        if sheet is not None:
            assert index is not None
            jobs = sheet.list_jobs(index)
        else:
            assert dirb is not None
            jobs = dirb.list_jobs()
        if args.only_group:
            jobs = [j for j in jobs if j.key == args.only_group]
        return jobs

    if args.dry_run:
        jobs = enumerate_jobs()
        log(f"未処理ジョブ: {len(jobs)} 件")
        for j in jobs:
            mat = (j.material or {}).get("folder", "（素材未解決）")
            log(f"  - {j.key} | 素材: {mat} | {j.title[:60]}")
        return 0

    processed = 0
    yielded: set[str] = set()   # claim 競合したジョブ（他の候補が尽きたら再試行する）
    blocked: set[str] = set()   # 素材未解決・失敗済みのジョブ（この起動中は再試行しない）
    while True:
        if stop.requested:
            log("停止要求により終了します")
            break
        if args.once and processed >= 1:
            break
        if args.max_jobs and processed >= args.max_jobs:
            break
        try:
            jobs = [j for j in enumerate_jobs()
                    if j.key not in yielded and j.key not in blocked]
        except Exception as e:
            log(f"ジョブ列挙に失敗: {e}")
            if args.idle_exit or args.once:
                return 1
            if sleep_or_stop(args.interval, stop):
                break
            continue
        if not jobs:
            if yielded:
                yielded.clear()
                continue
            if args.idle_exit or args.once:
                log("キューは空です。終了します")
                break
            log(f"キューは空です。{args.interval:.0f}秒後に再確認します（Ctrl+Cで終了）")
            if sleep_or_stop(args.interval, stop):
                break
            continue
        if stop.requested:
            # 列挙の最中に押された場合、そのジョブは開始しない
            break

        job = jobs[0]
        if job.material is None:
            log(f"スキップ: {job.key} に対応する production.json が見つかりません"
                f"（scripts-dir を確認してください）: {job.title[:50]}")
            blocked.add(job.key)  # 無限ループ防止。この起動中は再試行しない
            continue

        started = jst_now()
        t0 = time.perf_counter()
        log(f"ジョブ開始: {job.key} | {job.title[:60]}")
        try:
            if sheet is not None:
                if not sheet.claim(job, node, args.claim_wait):
                    yielded.add(job.key)
                    continue
                log(f"  claim 完了（行 {job.rep_row}、ノード {node}）")
            if stop.force_exiting:
                # claim 中に2回目が押された。生成は開始せず即座に終了する
                return 130
            out_dir = args.outputs_dir / (job.material["folder"])
            out_file = runner.run(job.material["path"], job.material["prod_id"], out_dir)
        except Exception as e:
            if stop.force_exiting:
                # 強制終了でランナーが落とされた。失敗として記録はしない
                log("強制終了のため、記録をせずに終了します")
                return 130
            summary = err_summary(e)
            log(f"  失敗: {summary}")
            try:
                if sheet is not None:
                    sheet.record_failure(job, node, summary)
                elif dirb is not None:
                    dirb.record_failure(job, node, summary, started)
            except Exception as e2:
                log(f"  失敗の記録にも失敗: {e2}")
            processed += 1
            # 失敗したジョブはこの起動中は再試行しない（sheet では claim を
            # 解放してあるので再列挙されてしまう。dir では result.json が
            # error のジョブが再列挙され続ける）。次回起動時に再試行される
            blocked.add(job.key)
            continue

        if stop.force_exiting:
            # 生成は終わったが強制終了が優先。成功として記録はしない
            log("強制終了のため、記録をせずに終了します")
            return 130
        elapsed = time.perf_counter() - t0
        try:
            if sheet is not None:
                sheet.record_success(job, node, out_file)
            elif dirb is not None:
                dirb.record_success(job, node, out_file, started)
        except Exception as e:
            log(f"  成功の記録に失敗: {e}（動画自体は生成済み: {out_file}）")
        log(f"ジョブ完了: {job.key} → {out_file}（{elapsed:.1f}s）")
        processed += 1

    log(f"worker 終了: 処理 {processed} 件")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
