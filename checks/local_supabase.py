"""Supabase's web API in front of a real Postgres, for the walk-throughs in this folder.

The apps talk to this exactly as they talk to a Supabase project. Behind it is a real Postgres
with Floor's migrations applied (local_db.py), so every table, rule and function the apps touch
is the real one. Only Supabase's own services are stood in for:

- Sign-in: any email, and the code is always THE_CODE. A first sign-in creates the account, which
  fires the same new-account trigger as on Supabase.
- The table API: reads, inserts, updates and deletes with plain filters, and calls to database
  functions. Each request runs as the signed-in person, under the database's own rules.
- Files: kept in memory. Whether a person may add, read or remove a file is decided by the same
  storage rules as on Supabase.

It is strict on purpose. A request that goes beyond plain columns and plain filters is refused
with a message saying so, which keeps the apps on the well-trodden part of the API. Reads that
need two tables belong in a database function.
"""

import base64
import datetime
import email.parser
import email.policy
import http.server
import json
import re
import secrets
import threading
import time
import urllib.parse
import uuid

import psycopg
from psycopg import sql
from psycopg.rows import dict_row

import local_db

THE_CODE = "123456"
SERVICE_KEY = "local-secret-key"

NAME = re.compile(r"^[a-z_][a-z0-9_]*$")
OPERATORS = {"eq": "=", "neq": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<=", "like": "like", "ilike": "ilike"}
RESERVED = {"select", "order", "limit", "offset", "on_conflict", "columns"}

# The files people uploaded: (bucket, path) -> (bytes, content type).
files: dict[tuple[str, str], tuple[bytes, str]] = {}
# Refresh tokens handed out: token -> (user id, session id).
logins: dict[str, tuple[str, str]] = {}
# Emails a code was sent to, for a walk-through to check.
codes_sent_to: list[str] = []
# One-time addresses for private files: token -> (bucket, path).
signed: dict[str, tuple[str, str]] = {}


class Refused(Exception):
    def __init__(self, status: int, body: dict):
        super().__init__(body.get("message", ""))
        self.status = status
        self.body = body


def _b64(value: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b"=").decode()


def _unb64(part: str) -> dict:
    return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))


def _token(user_id: str, session_id: str, email_address: str) -> str:
    now = int(time.time())
    claims = {
        "sub": user_id, "aud": "authenticated", "role": "authenticated", "email": email_address,
        "session_id": session_id, "iat": now, "exp": now + 3600,
    }
    return f"{_b64({'alg': 'HS256', 'typ': 'JWT'})}.{_b64(claims)}.local"


def _user(row: dict) -> dict:
    stamp = row["created_at"].isoformat()
    return {
        "id": str(row["id"]), "aud": "authenticated", "role": "authenticated", "email": row["email"],
        "email_confirmed_at": stamp, "app_metadata": {"provider": "email", "providers": ["email"]},
        "user_metadata": row["raw_user_meta_data"], "created_at": stamp, "updated_at": stamp,
    }


def _session(row: dict, session_id: str) -> dict:
    refresh = secrets.token_urlsafe(16)
    logins[refresh] = (str(row["id"]), session_id)
    now = int(time.time())
    return {
        "access_token": _token(str(row["id"]), session_id, row["email"]), "token_type": "bearer",
        "expires_in": 3600, "expires_at": now + 3600, "refresh_token": refresh, "user": _user(row),
    }


def account(email_address: str, name: str | None = None) -> str:
    """Finds the account for an email, creating it as a first sign-in would. Returns its id."""
    found = local_db.value("select id from auth.users where email = %s", [email_address])
    if found:
        return str(found)
    meta = json.dumps({"display_name": name} if name else {})
    return str(local_db.value("insert into auth.users (email, raw_user_meta_data) values (%s, %s::jsonb) returning id", [email_address, meta]))


def _status_for(state: str | None, anonymous: bool) -> int:
    """The HTTP status PostgREST gives each kind of database error."""
    state = state or "XX000"
    if state in ("23503", "23505"):
        return 409
    if state == "42501":
        return 401 if anonymous else 403
    if state in ("42883", "42P01"):
        return 404
    if state == "P0001":
        return 400
    if state[:2] in ("08", "53"):
        return 503
    if state[:2] in ("25", "2D", "38", "39", "3B", "40", "55", "57", "58", "F0", "HV", "P0", "XX"):
        return 500
    return 400


class Api(http.server.BaseHTTPRequestHandler):
    # --- plumbing -----------------------------------------------------------------------------

    def _send(self, status: int, data: bytes = b"", kind: str = "application/json", headers: dict | None = None) -> None:
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Expose-Headers", "*")
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        for key, text in (headers or {}).items():
            self.send_header(key, text)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def _reply(self, status: int, body=None, headers: dict | None = None) -> None:
        self._send(status, b"" if body is None else json.dumps(body, default=str).encode(), headers=headers)

    def _raw(self) -> bytes:
        return self.rfile.read(int(self.headers.get("Content-Length") or 0))

    def _json(self):
        raw = self._raw()
        return json.loads(raw) if raw else {}

    def _claims(self) -> dict | None:
        """Who is asking. None for the public. The service key gets a role that passes every rule."""
        bearer = self.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if bearer == SERVICE_KEY or self.headers.get("apikey") == SERVICE_KEY and not bearer:
            return {"role": "service_role"}
        parts = bearer.split(".")
        if len(parts) != 3:
            return None
        try:
            claims = _unb64(parts[1])
        except ValueError:
            return None
        return claims if claims.get("role") == "authenticated" else None

    def _database(self, claims: dict | None):
        """A transaction that runs as the person asking, the way the API on Supabase does."""
        conn = psycopg.connect(local_db.dsn(), row_factory=dict_row)
        role = (claims or {}).get("role", "anon")
        conn.execute("select set_config('request.jwt.claims', %s, true)", [json.dumps(claims or {})])
        conn.execute(sql.SQL("set local role {}").format(sql.Identifier(role)))
        return conn

    def _handle(self) -> None:
        url = urllib.parse.urlparse(self.path)
        try:
            if url.path.startswith("/auth/v1/"):
                self._auth(url)
            elif url.path.startswith("/rest/v1/rpc/"):
                self._function(url)
            elif url.path.startswith("/rest/v1/"):
                self._table(url)
            elif url.path.startswith("/storage/v1/"):
                self._storage(url)
            else:
                self._reply(404, {"message": f"The local backend does not know {url.path}"})
        except Refused as refusal:
            self._reply(refusal.status, refusal.body)
        except psycopg.Error as error:
            diag = error.diag
            body = {"code": diag.sqlstate, "message": diag.message_primary, "details": diag.message_detail, "hint": diag.message_hint}
            self._reply(_status_for(diag.sqlstate, self._claims() is None), body)

    def do_OPTIONS(self):
        self._send(204)

    do_GET = do_HEAD = do_POST = do_PATCH = do_PUT = do_DELETE = _handle

    def log_message(self, *args):
        pass

    # --- sign-in ------------------------------------------------------------------------------

    def _auth(self, url) -> None:
        path = url.path.removeprefix("/auth/v1")
        if path == "/otp":
            codes_sent_to.append(self._json().get("email", ""))
            return self._reply(200, {})
        if path == "/verify":
            body = self._json()
            if body.get("token") != THE_CODE:
                return self._reply(403, {"code": 403, "error_code": "otp_expired", "msg": "Token has expired or is invalid"})
            user_id = account(body["email"])
            row = local_db.rows("select * from auth.users where id = %s", [user_id])[0]
            return self._reply(200, _session(row, str(uuid.uuid4())))
        if path == "/token":
            known = logins.pop(self._json().get("refresh_token", ""), None)
            found = local_db.rows("select * from auth.users where id = %s", [known[0]]) if known else []
            if not found:
                return self._reply(400, {"code": 400, "error_code": "refresh_token_not_found", "msg": "Invalid Refresh Token: Refresh Token Not Found"})
            return self._reply(200, _session(found[0], known[1]))
        if path == "/user":
            claims = self._claims() or {}
            found = local_db.rows("select * from auth.users where id = %s", [claims.get("sub")]) if claims.get("sub") else []
            if not found:
                return self._reply(403, {"code": 403, "error_code": "bad_jwt", "msg": "invalid claim: missing sub claim"})
            return self._reply(200, _user(found[0]))
        if path == "/logout":
            self._raw()
            return self._reply(204)
        if path.startswith("/admin/users/") and self.command == "DELETE":
            if (self._claims() or {}).get("role") != "service_role":
                return self._reply(403, {"code": 403, "error_code": "not_admin", "msg": "User not allowed"})
            local_db.run("delete from auth.users where id = %s", [path.removeprefix("/admin/users/")])
            return self._reply(200, {})
        self._reply(404, {"message": f"The local backend does not know {url.path}"})

    # --- tables -------------------------------------------------------------------------------

    def _columns(self, text: str | None) -> sql.Composable:
        if not text or text == "*":
            return sql.SQL("*")
        names = [part.strip() for part in text.split(",")]
        for name in names:
            if not NAME.match(name):
                raise Refused(400, {"code": "LOCAL", "message": f'The local backend reads plain columns only, and "{name}" is not one. A read that needs two tables belongs in a database function.', "details": None, "hint": None})
        return sql.SQL(", ").join(sql.Identifier(name) for name in names)

    def _where(self, query: list[tuple[str, str]], table: str) -> tuple[sql.Composable, list]:
        tests: list[sql.Composable] = []
        params: list = []
        for key, text in query:
            if key in RESERVED:
                continue
            if not NAME.match(key):
                raise Refused(400, {"code": "LOCAL", "message": f'The local backend does plain filters only, and "{key}" is not one.', "details": None, "hint": None})
            column = sql.Identifier("public", table, key)
            negate = text.startswith("not.")
            if negate:
                text = text.removeprefix("not.")
            operator, _, operand = text.partition(".")
            if operator in OPERATORS:
                if operator in ("like", "ilike"):
                    operand = operand.replace("*", "%")
                test = sql.SQL("{} {} %s").format(column, sql.SQL(OPERATORS[operator]))
                params.append(operand)
            elif operator == "is" and operand in ("null", "true", "false"):
                test = sql.SQL("{} is {}").format(column, sql.SQL(operand))
            elif operator == "in" and operand.startswith("(") and operand.endswith(")"):
                items = [item.strip().strip('"') for item in operand[1:-1].split(",") if item.strip()]
                if not items:
                    test = sql.SQL("false")
                else:
                    test = sql.SQL("{} in ({})").format(column, sql.SQL(", ").join(sql.Placeholder() for _ in items))
                    params.extend(items)
            else:
                raise Refused(400, {"code": "LOCAL", "message": f'The local backend does not do the filter "{key}={text}".', "details": None, "hint": None})
            tests.append(sql.SQL("not ({})").format(test) if negate else test)
        return (sql.SQL(" where ") + sql.SQL(" and ").join(tests) if tests else sql.SQL("")), params

    def _order(self, text: str | None) -> sql.Composable:
        if not text:
            return sql.SQL("")
        parts = []
        for item in text.split(","):
            name, *marks = item.split(".")
            if not NAME.match(name) or any(mark not in ("asc", "desc", "nullsfirst", "nullslast") for mark in marks):
                raise Refused(400, {"code": "LOCAL", "message": f'The local backend does not do the order "{item}".', "details": None, "hint": None})
            words = " ".join({"asc": "asc", "desc": "desc", "nullsfirst": "nulls first", "nullslast": "nulls last"}[mark] for mark in marks)
            parts.append(sql.SQL("{} {}").format(sql.Identifier(name), sql.SQL(words)))
        return sql.SQL(" order by ") + sql.SQL(", ").join(parts)

    def _table(self, url) -> None:
        name = url.path.removeprefix("/rest/v1/")
        if not NAME.match(name):
            raise Refused(404, {"code": "PGRST205", "message": f"Could not find the table 'public.{name}' in the schema cache", "details": None, "hint": None})
        table = sql.Identifier("public", name)
        query = urllib.parse.parse_qsl(url.query, keep_blank_values=True)
        asked = dict(query)
        prefer = self.headers.get("Prefer", "")
        wants_rows = self.command in ("GET", "HEAD") or "return=representation" in prefer
        columns = self._columns(asked.get("select"))
        where, params = self._where(query, name)
        claims = self._claims()

        with self._database(claims) as conn:
            if self.command in ("GET", "HEAD"):
                tail = self._order(asked.get("order"))
                if "limit" in asked:
                    tail += sql.SQL(" limit {}").format(sql.Literal(int(asked["limit"])))
                if "offset" in asked:
                    tail += sql.SQL(" offset {}").format(sql.Literal(int(asked["offset"])))
                statement = sql.SQL("select {} from {}{}{}").format(columns, table, where, tail)
            elif self.command == "POST":
                body = self._json()
                records = body if isinstance(body, list) else [body]
                keys = list(records[0].keys()) if records else []
                if not keys or any(not NAME.match(key) for key in keys):
                    raise Refused(400, {"code": "LOCAL", "message": "The local backend needs plain column names to insert.", "details": None, "hint": None})
                names = sql.SQL(", ").join(sql.Identifier(key) for key in keys)
                statement = sql.SQL("insert into {} ({}) select {} from json_populate_recordset(null::{}, %s::json)").format(table, names, names, table)
                params = [json.dumps(records)]
                if "resolution=merge-duplicates" in prefer or "resolution=ignore-duplicates" in prefer:
                    target = sql.SQL(", ").join(sql.Identifier(part) for part in asked.get("on_conflict", "").split(",") if NAME.match(part))
                    if "ignore-duplicates" in prefer:
                        statement += sql.SQL(" on conflict ({}) do nothing").format(target)
                    else:
                        updates = sql.SQL(", ").join(sql.SQL("{} = excluded.{}").format(sql.Identifier(key), sql.Identifier(key)) for key in keys)
                        statement += sql.SQL(" on conflict ({}) do update set {}").format(target, updates)
            elif self.command == "PATCH":
                body = self._json()
                keys = list(body.keys())
                if not keys or any(not NAME.match(key) for key in keys):
                    raise Refused(400, {"code": "LOCAL", "message": "The local backend needs plain column names to update.", "details": None, "hint": None})
                updates = sql.SQL(", ").join(sql.SQL("{} = _new.{}").format(sql.Identifier(key), sql.Identifier(key)) for key in keys)
                statement = sql.SQL("update {} set {} from json_populate_record(null::{}, %s::json) _new{}").format(table, updates, table, where)
                params = [json.dumps(body), *params]
            elif self.command == "DELETE":
                statement = sql.SQL("delete from {}{}").format(table, where)
            else:
                raise Refused(405, {"code": "LOCAL", "message": "Method not allowed", "details": None, "hint": None})

            if self.command not in ("GET", "HEAD"):
                statement += sql.SQL(" returning {}").format(self._returning(asked.get("select"), name) if wants_rows else sql.SQL("1"))
            if wants_rows:
                wrapped = sql.SQL("with _rows as ({}) select coalesce(json_agg(_rows), '[]'::json)::text as body, count(*) as total from _rows").format(statement)
                found = conn.execute(wrapped, params).fetchone()
                body_text, total = found["body"], found["total"]
            else:
                conn.execute(statement, params)
                body_text, total = "", 0

        headers = {}
        if "count=exact" in prefer:
            headers["Content-Range"] = f"0-{max(total - 1, 0)}/{total}" if total else "*/0"
        if not wants_rows:
            return self._send(201 if self.command == "POST" else 204, headers=headers)
        if "vnd.pgrst.object" in self.headers.get("Accept", ""):
            listed = json.loads(body_text)
            if len(listed) != 1:
                raise Refused(406, {"code": "PGRST116", "message": "JSON object requested, multiple (or no) rows returned", "details": f"The result contains {len(listed)} rows", "hint": None})
            body_text = json.dumps(listed[0])
        self._send(201 if self.command == "POST" else 200, body_text.encode(), headers=headers)

    def _returning(self, text: str | None, table: str) -> sql.Composable:
        if not text or text == "*":
            return sql.SQL("{}.*").format(sql.Identifier("public", table))
        self._columns(text)
        return sql.SQL(", ").join(sql.Identifier("public", table, part.strip()) for part in text.split(","))

    # --- database functions -------------------------------------------------------------------

    def _function(self, url) -> None:
        name = url.path.removeprefix("/rest/v1/rpc/")
        args = self._json() if self.command == "POST" else dict(urllib.parse.parse_qsl(url.query))
        if not NAME.match(name) or any(not NAME.match(key) for key in args):
            raise Refused(404, {"code": "PGRST202", "message": f"Could not find the function public.{name} in the schema cache", "details": None, "hint": None})
        found = local_db.rows(
            """
            select p.proretset, p.pronargs, p.pronargdefaults, p.proargnames, t.typtype,
                   p.prorettype::regtype::text as returns, p.proargmodes is not null as has_table,
                   (select coalesce(array_agg(format_type(u.t, null) order by u.n), '{}')
                      from unnest(p.proargtypes) with ordinality u(t, n)) as types
              from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
              join pg_type t on t.oid = p.prorettype
             where n.nspname = 'public' and p.proname = %s
            """,
            [name],
        )
        if len(found) != 1:
            raise Refused(404, {"code": "PGRST202", "message": f"Could not find the function public.{name} in the schema cache", "details": None, "hint": None})
        proc = found[0]
        names = (proc["proargnames"] or [])[: proc["pronargs"]]
        required = names[: proc["pronargs"] - proc["pronargdefaults"]]
        if any(key not in names for key in args) or any(key not in args for key in required):
            given = ", ".join(sorted(args)) or "no arguments"
            raise Refused(404, {"code": "PGRST202", "message": f"Could not find the function public.{name}({given}) in the schema cache", "details": None, "hint": None})

        called = sql.SQL("{}({})").format(
            sql.Identifier("public", name),
            sql.SQL(", ").join(sql.SQL("{} => _args.{}").format(sql.Identifier(key), sql.Identifier(key)) for key in args),
        )
        if args:
            typed = sql.SQL(", ").join(sql.SQL("{} {}").format(sql.Identifier(key), sql.SQL(proc["types"][names.index(key)])) for key in args)
            source = sql.SQL("json_to_record(%s::json) as _args({})").format(typed)
            params = [json.dumps(args)]
        else:
            source, params = sql.SQL("(select 1) _args"), []

        with self._database(self._claims()) as conn:
            if proc["returns"] == "void":
                conn.execute(sql.SQL("select {} from {}").format(called, source), params)
                return self._send(204)
            if proc["proretset"]:
                statement = sql.SQL("select coalesce(json_agg(_out), '[]'::json)::text as body from {}, lateral {} _out").format(source, called)
            elif proc["typtype"] == "c" or proc["has_table"]:
                statement = sql.SQL("select row_to_json(_out)::text as body from {}, lateral {} _out").format(source, called)
            else:
                statement = sql.SQL("select to_json({})::text as body from {}").format(called, source)
            body = conn.execute(statement, params).fetchone()["body"]
        self._send(200, (body or "null").encode())

    # --- files --------------------------------------------------------------------------------

    def _file_error(self, status: int, error: str, message: str) -> None:
        self._reply(400 if status == 403 else status, {"statusCode": str(status), "error": error, "message": message})

    def _upload_body(self) -> tuple[bytes, str]:
        """The file in an upload. Browsers send it inside a form, a phone sends the bytes alone."""
        raw = self._raw()
        kind = self.headers.get("Content-Type", "application/octet-stream")
        if not kind.startswith("multipart/form-data"):
            return raw, kind.split(";")[0]
        message = email.parser.BytesParser(policy=email.policy.HTTP).parsebytes(b"Content-Type: " + kind.encode() + b"\r\n\r\n" + raw)
        for part in message.iter_parts():
            if part.get_filename() is not None:
                return part.get_payload(decode=True), part.get_content_type()
        raise Refused(400, {"statusCode": "400", "error": "invalid_request", "message": "No file in the upload"})

    def _storage(self, url) -> None:
        path = urllib.parse.unquote(url.path.removeprefix("/storage/v1/object/"))
        claims = self._claims()

        if path.startswith("public/") and self.command in ("GET", "HEAD"):
            bucket, _, name = path.removeprefix("public/").partition("/")
            is_public = local_db.value("select public from storage.buckets where id = %s", [bucket])
            stored = files.get((bucket, name)) if is_public else None
            return self._send(200, stored[0], stored[1]) if stored else self._file_error(404, "not_found", "Object not found")

        if path.startswith("sign/") and self.command in ("GET", "HEAD"):
            token = dict(urllib.parse.parse_qsl(url.query)).get("token", "")
            stored = files.get(signed.get(token, ("", "")))
            return self._send(200, stored[0], stored[1]) if stored else self._file_error(400, "InvalidJWT", "The signed address is not valid")

        if path.startswith("sign/") and self.command == "POST":
            bucket, _, name = path.removeprefix("sign/").partition("/")
            self._raw()
            with self._database(claims) as conn:
                seen = conn.execute("select 1 from storage.objects where bucket_id = %s and name = %s", [bucket, name]).fetchone()
            if not seen:
                return self._file_error(404, "not_found", "Object not found")
            token = secrets.token_urlsafe(12)
            signed[token] = (bucket, name)
            return self._reply(200, {"signedURL": f"/object/sign/{bucket}/{urllib.parse.quote(name)}?token={token}"})

        if self.command == "DELETE":
            bucket = path.strip("/")
            names = self._json().get("prefixes", [])
            with self._database(claims) as conn:
                gone = conn.execute("delete from storage.objects where bucket_id = %s and name = any(%s) returning name", [bucket, names]).fetchall()
            for row in gone:
                files.pop((bucket, row["name"]), None)
            return self._reply(200, [{"bucket_id": bucket, "name": row["name"]} for row in gone])

        if self.command in ("POST", "PUT"):
            bucket, _, name = path.partition("/")
            data, kind = self._upload_body()
            rules = local_db.rows("select file_size_limit, allowed_mime_types from storage.buckets where id = %s", [bucket])
            if not rules:
                return self._file_error(404, "Bucket not found", "Bucket not found")
            if rules[0]["file_size_limit"] and len(data) > rules[0]["file_size_limit"]:
                return self._file_error(413, "Payload too large", "The object exceeded the maximum allowed size")
            if rules[0]["allowed_mime_types"] and kind not in rules[0]["allowed_mime_types"]:
                return self._file_error(415, "invalid_mime_type", f"mime type {kind} is not supported")
            replace = self.headers.get("x-upsert") == "true" or self.command == "PUT"
            try:
                with self._database(claims) as conn:
                    statement = "insert into storage.objects (bucket_id, name, owner) values (%s, %s, %s)"
                    if replace:
                        statement += " on conflict (bucket_id, name) do update set owner = excluded.owner"
                    conn.execute(statement, [bucket, name, (claims or {}).get("sub")])
            except psycopg.errors.UniqueViolation:
                return self._file_error(409, "Duplicate", "The resource already exists")
            except psycopg.Error:
                return self._file_error(403, "Unauthorized", "new row violates row-level security policy")
            files[(bucket, name)] = (data, kind)
            return self._reply(200, {"Key": f"{bucket}/{name}", "Id": str(uuid.uuid4())})

        if path.startswith("authenticated/") and self.command in ("GET", "HEAD"):
            bucket, _, name = path.removeprefix("authenticated/").partition("/")
            with self._database(claims) as conn:
                seen = conn.execute("select 1 from storage.objects where bucket_id = %s and name = %s", [bucket, name]).fetchone()
            stored = files.get((bucket, name)) if seen else None
            return self._send(200, stored[0], stored[1]) if stored else self._file_error(404, "not_found", "Object not found")

        self._reply(404, {"message": f"The local backend does not know {url.path}"})


def start(port: int) -> http.server.ThreadingHTTPServer:
    """A new, empty Floor database with Supabase's API in front of it."""
    local_db.fresh()
    files.clear()
    logins.clear()
    signed.clear()
    codes_sent_to.clear()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Api)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)
