"""A stand-in for the Supabase project, for sign_in.py.

It answers the few requests the app makes while signing in: send a code, check a code, the two
login functions (claim_session and session_status), the person's memberships, and saving a
space's look. A walk-through tells it how to answer through `world` and reads what the app
sent from `seen`.

It checks nothing itself. The real rules live in the database and are tested in
web/supabase/tests. This only lets the app's own screens be walked without a real project.
"""

import base64
import http.server
import json
import threading
import time
import urllib.parse

THE_CODE = "123456"
USER_ID = "00000000-0000-4000-8000-0000000000aa"

# How the stand-in answers. A walk-through changes these between steps.
world = {
    "claim": "ok",  # "ok", "device_limit", or "error" for a failing server
    "status": "ok",  # "ok" or "not_current"
    "memberships": [],  # rows as the app asks for them
}

# What the app sent, for the walk-through to check.
seen = {"codes_sent_to": [], "claims": [], "space_changes": [], "sign_outs": 0}


def _part(value: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b"=").decode()


def _session(email: str) -> dict:
    now = int(time.time())
    claims = {
        "sub": USER_ID,
        "aud": "authenticated",
        "role": "authenticated",
        "email": email,
        "session_id": "00000000-0000-4000-8000-0000000000bb",
        "iat": now,
        "exp": now + 3600,
    }
    return {
        "access_token": f"{_part({'alg': 'HS256', 'typ': 'JWT'})}.{_part(claims)}.stand-in",
        "token_type": "bearer",
        "expires_in": 3600,
        "expires_at": now + 3600,
        "refresh_token": "stand-in-refresh",
        "user": {
            "id": USER_ID,
            "aud": "authenticated",
            "role": "authenticated",
            "email": email,
            "email_confirmed_at": "2026-11-17T00:00:00Z",
            "app_metadata": {"provider": "email", "providers": ["email"]},
            "user_metadata": {},
            "created_at": "2026-11-17T00:00:00Z",
            "updated_at": "2026-11-17T00:00:00Z",
        },
    }


class StandIn(http.server.BaseHTTPRequestHandler):
    email = "ada@example.com"

    def _reply(self, status: int, body=None) -> None:
        data = b"" if body is None else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Expose-Headers", "*")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(length) or b"{}")

    def _auth_error(self, status: int, code: str, message: str) -> None:
        self._reply(status, {"code": status, "error_code": code, "msg": message})

    def do_OPTIONS(self):
        self._reply(204)

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == "/rest/v1/memberships":
            return self._reply(200, world["memberships"])
        if url.path == "/auth/v1/user":
            return self._reply(200, _session(StandIn.email)["user"])
        self._reply(404, {"message": f"The stand-in does not know {url.path}"})

    def do_PATCH(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == "/rest/v1/spaces":
            space_id = urllib.parse.parse_qs(url.query).get("id", ["eq."])[0].removeprefix("eq.")
            changes = self._body()
            seen["space_changes"].append({"id": space_id, **changes})
            for row in world["memberships"]:
                if row["space"]["id"] == space_id:
                    row["space"].update(changes)
            return self._reply(200, [{"id": space_id}])
        self._reply(404, {"message": f"The stand-in does not know {url.path}"})

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        body = self._body()

        if url.path == "/auth/v1/otp":
            if body.get("email") == "slow.down@example.com":
                return self._auth_error(429, "over_email_send_rate_limit", "Email rate limit exceeded")
            seen["codes_sent_to"].append(body.get("email"))
            return self._reply(200, {})

        if url.path == "/auth/v1/verify":
            if body.get("token") != THE_CODE:
                return self._auth_error(403, "otp_expired", "Token has expired or is invalid")
            StandIn.email = body.get("email", StandIn.email)
            return self._reply(200, _session(StandIn.email))

        if url.path == "/auth/v1/token":
            return self._reply(200, _session(StandIn.email))

        if url.path == "/auth/v1/logout":
            seen["sign_outs"] += 1
            return self._reply(204)

        if url.path == "/rest/v1/rpc/claim_session":
            seen["claims"].append(body.get("p_device_id"))
            if world["claim"] == "error":
                return self._reply(500, {"code": "XX000", "message": "The stand-in was told to fail", "details": None, "hint": None})
            if world["claim"] == "ok":
                world["status"] = "ok"
            return self._reply(200, world["claim"])

        if url.path == "/rest/v1/rpc/session_status":
            return self._reply(200, world["status"])

        self._reply(404, {"message": f"The stand-in does not know {url.path}"})

    def log_message(self, *args):
        pass


def start(port: int) -> http.server.ThreadingHTTPServer:
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), StandIn)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def membership(space_id: str, name: str, theme: str = "night", role: str = "member", vip_until=None) -> dict:
    """One row of the app's memberships request."""
    return {"role": role, "vip_until": vip_until, "space": {"id": space_id, "name": name, "theme": theme}}
