"""A stand-in for the Supabase project, for the walk-throughs in this folder.

It answers the requests the phone app and the web app make: sending and checking a sign-in
code, the login functions, a person's spaces and memberships, joining, invite codes, proof
uploads and requests, and saving a space's look. A walk-through tells it how to answer through
`world` and reads what the apps sent from `seen`. There is one test person.

It checks nothing itself. The real rules live in the database and are tested in
web/supabase/tests. This only lets the apps' own screens be walked without a real project.
"""

import base64
import datetime
import http.server
import json
import threading
import time
import urllib.parse
from quiet import QuietServer

THE_CODE = "123456"
USER_ID = "00000000-0000-4000-8000-0000000000aa"


def fresh_world() -> dict:
    return {
        "claim": "ok",  # claim_session answers "ok" or "device_limit", or fails on "error"
        "status": "ok",  # session_status answers "ok" or "not_current"
        "spaces": {},  # id -> what anyone may know about a space
        "memberships": [],  # the test person's memberships: space_id, role, status, vip_until
        "settings": {},  # space id -> how to pay and prove a broker account
        "requests": [],  # the test person's requests for VIP
        "invites": {},  # code -> {"space_id", "days"}
        "taken_slugs": ["kings"],  # link words another space already has
        "preview": {},  # link word -> the newest posts a visitor may see
        "display_name": "Member",
    }


def fresh_seen() -> dict:
    return {
        "codes_sent_to": [],
        "claims": [],
        "space_changes": [],
        "spaces_created": [],
        "joins": [],
        "uploads": [],
        "requests_sent": [],
        "sign_outs": 0,
    }


# How the stand-in answers. A walk-through changes these between steps.
world = fresh_world()
# What the apps sent, for the walk-through to check.
seen = fresh_seen()


def reset() -> None:
    world.clear()
    world.update(fresh_world())
    seen.clear()
    seen.update(fresh_seen())


def space(space_id: str, name: str, theme: str = "night", slug: str | None = None, **more) -> dict:
    """Adds a space to the stand-in and returns it."""
    row = {
        "id": space_id,
        "slug": slug or space_id,
        "name": name,
        "tagline": None,
        "theme": theme,
        "logo_path": None,
        "status": "active",
        "vip_price_cents": None,
        "vip_currency": None,
        "vip_days": 30,
        "broker_name": None,
        **more,
    }
    world["spaces"][space_id] = row
    return row


def membership(space_id: str, name: str, theme: str = "night", role: str = "member", vip_until=None) -> dict:
    """One membership of the test person. Adds the space too if the stand-in does not know it."""
    if space_id not in world["spaces"]:
        space(space_id, name, theme)
    return {"space_id": space_id, "role": role, "status": "active", "vip_until": vip_until}


def days_from_now(count: int) -> str:
    then = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=count)
    return then.isoformat()


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


def _mine(space_id: str) -> dict | None:
    return next((row for row in world["memberships"] if row["space_id"] == space_id), None)


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

    def _raw(self) -> bytes:
        return self.rfile.read(int(self.headers.get("Content-Length") or 0))

    def _body(self) -> dict:
        return json.loads(self._raw() or b"{}")

    def _auth_error(self, status: int, code: str, message: str) -> None:
        self._reply(status, {"code": status, "error_code": code, "msg": message})

    def _refuse(self, message: str) -> None:
        """A refusal in the words a database function raises."""
        self._reply(400, {"code": "P0001", "message": message, "details": None, "hint": None})

    def _unknown(self, path: str) -> None:
        self._reply(404, {"message": f"The stand-in does not know {path}"})

    def do_OPTIONS(self):
        self._reply(204)

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        query = {key: values[0] for key, values in urllib.parse.parse_qs(url.query).items()}
        wanted = lambda key: query.get(key, "").removeprefix("eq.")  # noqa: E731

        if url.path == "/rest/v1/spaces":
            rows = [row for row in world["spaces"].values() if row["slug"] == wanted("slug") and row["status"] == "active"]
            return self._reply(200, rows)

        if url.path == "/rest/v1/memberships":  # the web app: the person's place in one space
            mine = _mine(wanted("space_id"))
            return self._reply(200, [{key: mine[key] for key in ("role", "status", "vip_until")}] if mine else [])

        if url.path == "/rest/v1/profiles":
            return self._reply(200, [{"display_name": world["display_name"]}])

        if url.path == "/rest/v1/space_settings":
            mine = _mine(wanted("space_id"))
            found = world["settings"].get(wanted("space_id"))
            return self._reply(200, [found] if mine and found else [])

        if url.path == "/rest/v1/access_requests":
            rows = [row for row in world["requests"] if row["space_id"] == wanted("space_id")]
            return self._reply(200, sorted(rows, key=lambda row: row["created_at"], reverse=True))

        if url.path == "/auth/v1/user":
            return self._reply(200, _session(StandIn.email)["user"])
        self._unknown(url.path)

    def do_PATCH(self):
        url = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(url.query)

        if url.path == "/rest/v1/spaces":
            space_id = query.get("id", ["eq."])[0].removeprefix("eq.")
            changes = self._body()
            seen["space_changes"].append({"id": space_id, **changes})
            world["spaces"].get(space_id, {}).update(changes)
            return self._reply(200, [{"id": space_id}])

        if url.path == "/rest/v1/profiles":
            name = self._body().get("display_name", "")
            if name.strip().lower() in ("admin", "mentor", "floor", "support"):
                return self._reply(400, {"code": "23514", "message": 'new row violates check constraint "profiles_display_name_reserved"', "details": None, "hint": None})
            world["display_name"] = name
            return self._reply(204)
        self._unknown(url.path)

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)

        if url.path.startswith("/storage/v1/object/proofs/"):
            self._raw()
            path = urllib.parse.unquote(url.path.removeprefix("/storage/v1/object/proofs/"))
            seen["uploads"].append(path)
            return self._reply(200, {"Key": f"proofs/{path}", "Id": "stand-in-file"})

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

        if url.path == "/rest/v1/rpc/my_spaces":  # the phone app: every space the person is in
            rows = []
            for row in world["memberships"]:
                found = world["spaces"].get(row["space_id"])
                if row["status"] == "active" and found:
                    rows.append({
                        **{key: found[key] for key in ("id", "slug", "name", "theme", "logo_path", "status")},
                        "role": row["role"], "vip_until": row["vip_until"],
                        "block_capture": True, "watermark": True, "display_name": world["display_name"],
                    })
            return self._reply(200, rows)

        # A space in these walk-throughs has an empty Feed and nobody in the mentor's queue.
        if url.path in ("/rest/v1/rpc/list_requests", "/rest/v1/rpc/feed"):
            return self._reply(200, [])

        if url.path == "/rest/v1/rpc/space_preview":
            return self._reply(200, world["preview"].get(body.get("p_slug"), []))

        if url.path == "/rest/v1/rpc/create_space":
            # The same refusals, in the same words, as create_space in the database.
            if body.get("p_slug") in world["taken_slugs"]:
                return self._refuse("slug_taken")
            if not body.get("p_terms_version"):
                return self._refuse("terms_required")
            seen["spaces_created"].append(body)
            space_id = f"space-{len(seen['spaces_created'])}"
            space(space_id, body["p_name"], theme=body["p_theme"], slug=body["p_slug"])
            world["memberships"].append(membership(space_id, body["p_name"], role="mentor"))
            return self._reply(200, space_id)

        if url.path == "/rest/v1/rpc/join_space":
            found = next((row for row in world["spaces"].values() if row["slug"] == body.get("p_slug")), None)
            if not found:
                return self._refuse("space_unavailable")
            mine = _mine(found["id"])
            if mine and mine["status"] == "banned":
                return self._refuse("banned")
            seen["joins"].append(body.get("p_slug"))
            if not mine:
                world["memberships"].append({"space_id": found["id"], "role": "member", "status": "active", "vip_until": None})
            return self._reply(200, found["id"])

        if url.path == "/rest/v1/rpc/redeem_invite":
            invite = world["invites"].get((body.get("p_code") or "").strip().upper())
            if not invite or (body.get("p_space") and invite["space_id"] != body["p_space"]):
                return self._refuse("invite_invalid")
            if invite.get("used"):
                return self._refuse("invite_already_used")
            invite["used"] = True
            mine = _mine(invite["space_id"])
            if not mine:
                mine = {"space_id": invite["space_id"], "role": "member", "status": "active", "vip_until": None}
                world["memberships"].append(mine)
            mine["vip_until"] = days_from_now(invite["days"])
            return self._reply(200, {"space_id": invite["space_id"], "vip_until": mine["vip_until"]})

        if url.path == "/rest/v1/rpc/request_access":
            pending = [row for row in world["requests"] if row["kind"] == body.get("p_kind") and row["status"] == "pending"]
            if pending:
                return self._refuse("already_pending")
            seen["requests_sent"].append(body)
            world["requests"].append({
                "space_id": body.get("p_space"),
                "kind": body.get("p_kind"),
                "status": "pending",
                "decline_reason": None,
                "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            })
            return self._reply(200, "request-" + str(len(world["requests"])))

        self._unknown(url.path)

    def log_message(self, *args):
        pass


def start(port: int) -> http.server.ThreadingHTTPServer:
    server = QuietServer(("127.0.0.1", port), StandIn)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
