#!/usr/bin/env python3
"""Google Sheets API クライアント（OAuth 認証、標準ライブラリのみ）

worker.py の sheetapi バックエンドが使う、Sheets API の薄いラッパーです。
gws CLI が無い環境（Tanaka の Windows ノード等）でも、シートのジョブキューを
直接読み書きできるようにするために用意しました。

認証は OAuth 2.0 の installed-app（ループバック）フロー:
  1. Google Cloud Console で作成した Desktop アプリ用クライアントJSON
     （"installed" 形式 / "web" 形式の両方に対応）を読み込む
  2. 認可URLをブラウザで開き、http://localhost:<空きポート> のローカル
     HTTPサーバーで code を受ける
  3. code をトークンに交換し、refresh_token 含めトークンファイル（JSON）に保存
  4. 以後の呼び出しは refresh_token で access_token を自動更新する

スコープは Google Sheets（spreadsheets）のみ。

単体実行（初回認証）:
  python tools/sheets_api.py auth --credentials <client.json> [--token <token.json>]

  --token を省略すると、credentials と同じフォルダの newsreel_token.json に
  保存します。認証情報（client_secret*.json）とトークン（newsreel_token.json）
  は秘密情報です。.gitignore 済みですが、共有フォルダには置かないでください。

検証用にエンドポイントを差し替える環境変数（通常は不要）:
  NEWSREEL_OAUTH_TOKEN_URL  … トークンエンドポイント
  NEWSREEL_SHEETS_API_BASE  … Sheets API のベースURL
"""
from __future__ import annotations

import argparse
import http.server
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = os.environ.get(
    "NEWSREEL_OAUTH_TOKEN_URL", "https://oauth2.googleapis.com/token")
API_BASE = os.environ.get(
    "NEWSREEL_SHEETS_API_BASE", "https://sheets.googleapis.com/v4")
SCOPE = "https://www.googleapis.com/auth/spreadsheets"
DEFAULT_TOKEN_NAME = "newsreel_token.json"
EXPIRY_MARGIN_SEC = 60  # access_token の期限切れ判定マージン
MAX_RETRIES = 3         # 429 / 5xx のリトライ回数（控えめに）


class SheetsApiError(RuntimeError):
    """Sheets API 呼び出し全般のエラー。"""


class SheetsAuthNeeded(SheetsApiError):
    """トークンが無い / 失効していて、再認証が必要な状態。

    この例外が出たら生成処理は始めず、auth コマンドの実行を促すこと。
    """


# ---------------------------------------------------------------- 認証情報

def load_client_config(credentials_path: Path) -> dict:
    """クライアントJSONを読み、{"client_id", "client_secret"} を返す。

    Google Cloud Console からダウンロードした JSON は "installed" 形式
    （デスクトップアプリ）か "web" 形式のどちらかで、そのキー配下に
    client_id / client_secret が入っている。
    """
    if not credentials_path.is_file():
        raise SheetsAuthNeeded(
            f"認証情報JSONが見つかりません: {credentials_path}\n"
            "Google Cloud Console で OAuth クライアント（デスクトップアプリ）を"
            "作成し、JSON をダウンロードして --sheets-credentials で指定してください")
    try:
        raw = json.loads(credentials_path.read_text(encoding="utf-8"))
    except Exception as e:
        raise SheetsApiError(f"認証情報JSONの読み込みに失敗しました: {credentials_path}: {e}")
    cfg = raw.get("installed") or raw.get("web") or raw
    if not cfg.get("client_id") or not cfg.get("client_secret"):
        raise SheetsApiError(
            f"認証情報JSONに client_id / client_secret がありません: {credentials_path}")
    return {"client_id": cfg["client_id"], "client_secret": cfg["client_secret"]}


def default_token_path(credentials_path: Path) -> Path:
    """トークンファイルの既定パス（credentials と同じフォルダ）。"""
    return credentials_path.parent / DEFAULT_TOKEN_NAME


def _post_form(url: str, form: dict) -> dict:
    data = urllib.parse.urlencode(form).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "Content-Type": "application/x-www-form-urlencoded",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:500]
        raise SheetsApiError(f"トークンエンドポイントがエラーを返しました ({e.code}): {body}")


# ---------------------------------------------------------------- 初回認証

class _CallbackHandler(http.server.BaseHTTPRequestHandler):
    """ループバック redirect の code を受けるだけの簡易ハンドラ。"""

    code: str | None = None
    error: str | None = None

    def do_GET(self) -> None:  # noqa: N802 (BaseHTTPRequestHandler の規約)
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        if q.get("code"):
            _CallbackHandler.code = q["code"][0]
            msg = "認証が完了しました。このタブを閉じてターミナルに戻ってください。"
        else:
            _CallbackHandler.error = (q.get("error") or ["unknown"])[0]
            msg = f"認証が失敗しました: {_CallbackHandler.error}"
        body = f"<html><body><p>{msg}</p></body></html>".encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args) -> None:  # ログを黙らせる
        pass


def run_auth_flow(credentials_path: Path, token_path: Path) -> Path:
    """ブラウザで認可を受け、トークンファイルを保存する。保存先パスを返す。"""
    client = load_client_config(credentials_path)
    server = http.server.HTTPServer(("127.0.0.1", 0), _CallbackHandler)
    port = server.server_address[1]
    redirect_uri = f"http://localhost:{port}/"
    params = {
        "client_id": client["client_id"],
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",   # refresh_token を得る
        "prompt": "consent",        # 再認証時にも refresh_token を確実に得る
    }
    url = AUTH_URL + "?" + urllib.parse.urlencode(params)
    print("ブラウザで認証ページを開きます。開かない場合は次のURLを直接開いてください:")
    print(url)
    webbrowser.open(url)
    try:
        while _CallbackHandler.code is None and _CallbackHandler.error is None:
            server.handle_request()
    finally:
        server.server_close()
    if _CallbackHandler.error:
        raise SheetsApiError(f"認可が拒否/失敗しました: {_CallbackHandler.error}")
    token = _post_form(TOKEN_URL, {
        "code": _CallbackHandler.code,
        "client_id": client["client_id"],
        "client_secret": client["client_secret"],
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    })
    if not token.get("refresh_token"):
        raise SheetsApiError(
            "refresh_token が発行されませんでした。Google アカウントの認可画面で"
            "このアプリへの許可を一度取り消してから、再度認証してください")
    _save_token(token_path, token)
    print(f"トークンを保存しました: {token_path}")
    return token_path


def _save_token(token_path: Path, token: dict) -> None:
    data = dict(token)
    if "expires_in" in data:
        data["expires_at"] = int(time.time()) + int(data["expires_in"])
    token_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


# ---------------------------------------------------------------- クライアント

class SheetsClient:
    """refresh_token で access_token を自動更新しながら Sheets API を叩く。"""

    def __init__(self, credentials_path: Path, token_path: Path | None = None,
                 api_base: str = API_BASE, token_url: str = TOKEN_URL) -> None:
        self.credentials_path = credentials_path
        self.token_path = token_path or default_token_path(credentials_path)
        self.api_base = api_base.rstrip("/")
        self.token_url = token_url
        self._client = load_client_config(credentials_path)
        self._token = self._load_token()
        self._access_token: str | None = None
        self._access_expires_at = 0.0

    def _auth_hint(self) -> str:
        return ("認証が必要です。次のコマンドを1回実行してください:\n"
                f"  python tools/sheets_api.py auth --credentials {self.credentials_path}"
                f" --token {self.token_path}")

    def _load_token(self) -> dict:
        if not self.token_path.is_file():
            raise SheetsAuthNeeded(
                f"トークンファイルが見つかりません: {self.token_path}\n" + self._auth_hint())
        try:
            return json.loads(self.token_path.read_text(encoding="utf-8"))
        except Exception as e:
            raise SheetsAuthNeeded(
                f"トークンファイルが読めません: {self.token_path}: {e}\n" + self._auth_hint())

    def access_token(self) -> str:
        """有効な access_token を返す（期限切れなら refresh を試みる）。"""
        if self._access_token and time.time() < self._access_expires_at - EXPIRY_MARGIN_SEC:
            return self._access_token
        saved = self._token.get("access_token")
        saved_exp = float(self._token.get("expires_at", 0))
        if saved and time.time() < saved_exp - EXPIRY_MARGIN_SEC:
            self._access_token = saved
            self._access_expires_at = saved_exp
            return saved
        refresh = self._token.get("refresh_token")
        if not refresh:
            raise SheetsAuthNeeded(
                "トークンに refresh_token がありません。\n" + self._auth_hint())
        try:
            resp = _post_form(self.token_url, {
                "client_id": self._client["client_id"],
                "client_secret": self._client["client_secret"],
                "refresh_token": refresh,
                "grant_type": "refresh_token",
            })
        except SheetsApiError as e:
            # invalid_grant 等はトークン失効。再認証を促す
            raise SheetsAuthNeeded(
                f"トークンの更新に失敗しました（失効している可能性があります）: {e}\n"
                + self._auth_hint())
        if not resp.get("access_token"):
            raise SheetsAuthNeeded(
                "トークンの更新応答に access_token がありません。\n" + self._auth_hint())
        self._token["access_token"] = resp["access_token"]
        if resp.get("refresh_token"):
            self._token["refresh_token"] = resp["refresh_token"]
        _save_token(self.token_path, self._token | {
            "expires_in": int(resp.get("expires_in", 3600))})
        self._token = json.loads(self.token_path.read_text(encoding="utf-8"))
        self._access_token = self._token["access_token"]
        self._access_expires_at = float(self._token.get("expires_at", 0))
        return self._access_token

    # ---- REST 呼び出し ----

    def _request(self, method: str, path: str,
                 body: dict | None = None, query: dict | None = None) -> dict:
        qs = urllib.parse.urlencode(query) if query else ""
        url = f"{self.api_base}{path}" + (f"?{qs}" if qs else "")
        data = json.dumps(body).encode("utf-8") if body is not None else None
        last_err: Exception | None = None
        for attempt in range(MAX_RETRIES + 1):
            req = urllib.request.Request(url, data=data, method=method, headers={
                "Authorization": f"Bearer {self.access_token()}",
                "Content-Type": "application/json",
            })
            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    raw = resp.read().decode("utf-8")
                    return json.loads(raw) if raw.strip() else {}
            except urllib.error.HTTPError as e:
                detail = e.read().decode("utf-8", "replace")[:500]
                if e.code in (429, 500, 502, 503) and attempt < MAX_RETRIES:
                    last_err = SheetsApiError(f"{e.code}: {detail}")
                    time.sleep(2 ** attempt)
                    continue
                if e.code in (401, 403):
                    raise SheetsAuthNeeded(
                        f"Sheets API が認証/権限エラーを返しました ({e.code}): {detail}\n"
                        + self._auth_hint())
                raise SheetsApiError(f"Sheets API エラー ({e.code}): {detail}")
            except urllib.error.URLError as e:
                if attempt < MAX_RETRIES:
                    last_err = e
                    time.sleep(2 ** attempt)
                    continue
                raise SheetsApiError(f"Sheets API へ接続できません: {e}")
        raise SheetsApiError(f"Sheets API 呼び出しがリトライ上限に達しました: {last_err}")

    def get_values(self, spreadsheet_id: str, rng: str) -> list[list[str]]:
        path = (f"/spreadsheets/{urllib.parse.quote(spreadsheet_id, safe='')}"
                f"/values/{urllib.parse.quote(rng, safe='')}")
        out = self._request("GET", path)
        return [[str(c) for c in row] for row in out.get("values", [])]

    def update_values(self, spreadsheet_id: str, rng: str,
                      values: list[list[str]]) -> dict:
        path = (f"/spreadsheets/{urllib.parse.quote(spreadsheet_id, safe='')}"
                f"/values/{urllib.parse.quote(rng, safe='')}")
        return self._request("PUT", path,
                             {"range": rng, "majorDimension": "ROWS", "values": values},
                             query={"valueInputOption": "RAW"})

    def batch_update_values(self, spreadsheet_id: str,
                            data: list[dict], value_input_option: str = "RAW") -> dict:
        path = (f"/spreadsheets/{urllib.parse.quote(spreadsheet_id, safe='')}"
                "/values:batchUpdate")
        return self._request("POST", path, {
            "valueInputOption": value_input_option,
            "data": [{"range": d["range"], "majorDimension": "ROWS",
                      "values": d["values"]} for d in data],
        })


# ---------------------------------------------------------------- CLI

def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="newsreel 用 Sheets API クライアント")
    sub = ap.add_subparsers(dest="cmd", required=True)
    auth = sub.add_parser("auth", help="初回認証（ブラウザで認可してトークンを保存）")
    auth.add_argument("--credentials", type=Path, required=True,
                      help="Google Cloud Console からダウンロードしたクライアントJSON")
    auth.add_argument("--token", type=Path, default=None,
                      help="トークンの保存先（既定: credentials と同じフォルダの "
                           "newsreel_token.json）")
    args = ap.parse_args(argv)
    if args.cmd == "auth":
        token_path = args.token or default_token_path(args.credentials)
        run_auth_flow(args.credentials, token_path)
        # 疎通確認: 発行されたトークンで access_token が得られることだけ確認
        client = SheetsClient(args.credentials, token_path)
        client.access_token()
        print("認証OK。このトークンで Sheets API を利用できます。")
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
