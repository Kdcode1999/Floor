"""A real Postgres for the walk-throughs, with Floor's database in it.

The walk-throughs that use this run the apps against the real tables, rules and functions, the
same SQL that goes to the Supabase project. Postgres has to be installed on the machine: the
server programs (initdb, pg_ctl) are looked for in the usual places.

    import local_db
    local_db.fresh()                      # a new, empty Floor database
    local_db.run("update ...", [..])      # as the database's owner, past every rule
    rows = local_db.rows("select ...")    # a list of dicts
    local_db.as_person(user_id, "select public.join_space(%s)", ["kings"])   # under the rules
"""

import glob
import json
import os
import pathlib
import shutil
import subprocess
import sys
import uuid

import psycopg
from psycopg.rows import dict_row

ROOT = pathlib.Path(__file__).resolve().parent.parent
SUPABASE = ROOT / "web" / "supabase"
HOME = pathlib.Path("/tmp/floor-checks-postgres")
PORT = 5544
NAME = "floor_checks"

_started = False


def _program(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    for folder in sorted(glob.glob("/usr/lib/postgresql/*/bin"), reverse=True) + ["/opt/homebrew/bin", "/usr/local/bin"]:
        candidate = pathlib.Path(folder) / name
        if candidate.is_file():
            return str(candidate)
    sys.exit(f"Postgres is not installed: {name} was not found. Install PostgreSQL 15 or newer to run this walk-through.")


def _as_postgres(command: list[str]) -> list[str]:
    """Postgres refuses to run as root, which only build machines are. There it runs as "postgres"."""
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        return ["runuser", "-u", "postgres", "--", *command]
    return command


def dsn(database: str = NAME) -> str:
    return f"host=127.0.0.1 port={PORT} user=postgres dbname={database}"


def start() -> None:
    """Starts the server if it is not running. The first run creates it, which takes a few seconds."""
    global _started
    if _started:
        return
    data = HOME / "data"
    if not (data / "PG_VERSION").is_file():
        HOME.mkdir(parents=True, exist_ok=True)
        if hasattr(os, "geteuid") and os.geteuid() == 0:
            shutil.chown(HOME, "postgres", "postgres")
        subprocess.run(
            _as_postgres([_program("initdb"), "-D", str(data), "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C.UTF-8"]),
            check=True, capture_output=True,
        )
    running = subprocess.run(_as_postgres([_program("pg_ctl"), "-D", str(data), "status"]), capture_output=True)
    if running.returncode != 0:
        options = f"-p {PORT} -c listen_addresses=127.0.0.1 -c unix_socket_directories={HOME} -c fsync=off -c timezone=UTC"
        subprocess.run(
            _as_postgres([_program("pg_ctl"), "-D", str(data), "-o", options, "-l", str(HOME / "server.log"), "-w", "start"]),
            check=True, capture_output=True,
        )
    _started = True


def fresh() -> None:
    """Throws the walk-through database away and builds it again from the migrations."""
    start()
    with psycopg.connect(dsn("postgres"), autocommit=True) as conn:
        conn.execute(f"drop database if exists {NAME} with (force)")
        conn.execute(f"create database {NAME}")
    files = [SUPABASE / "tests" / "supabase_stub.sql", *sorted((SUPABASE / "migrations").glob("*.sql"))]
    with psycopg.connect(dsn(), autocommit=True) as conn:
        for file in files:
            try:
                conn.execute(file.read_text())
            except psycopg.Error as error:
                sys.exit(f"{file.name} did not apply: {error}")


def run(sql: str, params: list | None = None) -> None:
    with psycopg.connect(dsn(), autocommit=True) as conn:
        conn.execute(sql, params)


def rows(sql: str, params: list | None = None) -> list[dict]:
    with psycopg.connect(dsn(), autocommit=True, row_factory=dict_row) as conn:
        return conn.execute(sql, params).fetchall()


def value(sql: str, params: list | None = None):
    """The first column of the first row, or None."""
    found = rows(sql, params)
    return next(iter(found[0].values())) if found else None


def as_person(user_id: str, sql: str, params: list | None = None, session: str | None = None) -> list[dict]:
    """Runs one statement as a signed-in person, under the database's rules, as the API would.

    Without `session` this is a login of its own, which is enough for setting things up. What a
    person may read is tied to the one phone they are signed in on: use `as_login` for that.
    """
    claims = {"sub": user_id, "role": "authenticated", "session_id": session or str(uuid.uuid4())}
    with psycopg.connect(dsn(), row_factory=dict_row) as conn:
        conn.execute("select set_config('request.jwt.claims', %s, true)", [json.dumps(claims)])
        conn.execute("set local role authenticated")
        cursor = conn.execute(sql, params)
        return cursor.fetchall() if cursor.description else []


def as_login(user_id: str, sql: str, params: list | None = None) -> list[dict]:
    """Runs one statement as a person, with the login their phone holds. This is what someone
    could do by talking to the database directly instead of through the app."""
    session = value("select active_session_id from public.account_security where user_id = %s", [user_id])
    return as_person(user_id, sql, params, str(session))


def stop() -> None:
    subprocess.run(_as_postgres([_program("pg_ctl"), "-D", str(HOME / "data"), "-m", "fast", "stop"]), capture_output=True)
