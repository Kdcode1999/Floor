"""Shared by the walk-throughs in this folder: a tiny web server for the app's web build, a
phone-sized Chrome, and the pass/fail bookkeeping."""

import http.server
import os
import pathlib
import sys
import threading

from playwright.sync_api import Locator, Playwright, expect

MOBILE = pathlib.Path(__file__).resolve().parent.parent
OUT = MOBILE / "checks" / "out"

failures: list[str] = []


def check(what: str, ok: bool) -> None:
    print(("  ok    " if ok else "  FAIL  ") + what)
    if not ok:
        failures.append(what)


def check_visible(what: str, locator: Locator) -> None:
    """Passes once the element is on screen. Waits a moment for the app to catch up first."""
    try:
        expect(locator).to_be_visible(timeout=4000)
        check(what, True)
    except AssertionError:
        check(what, False)


def finish(problems: list[str]) -> None:
    """Reports browser errors, then ends the run with a pass or a fail."""
    check("the browser reported no errors or warnings", not problems)
    for line in dict.fromkeys(problems):
        print("        " + line[:300])
    print(f"\nPictures: {OUT}")
    if failures:
        sys.exit(f"{len(failures)} check(s) failed.")
    print("All checks passed.")


def serve(dist: pathlib.Path, port: int) -> http.server.ThreadingHTTPServer:
    """Serves a web build. Any address that is not a file gets index.html, as a phone app has no pages."""

    class SinglePage(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(dist), **kwargs)

        def translate_path(self, path):
            clean = path.split("?", 1)[0].split("#", 1)[0].strip("/")
            target = dist / clean
            return str(target if clean and target.is_file() else dist / "index.html")

        def log_message(self, *args):
            pass

    if not (dist / "index.html").is_file():
        sys.exit(f"No web build in {dist.name}/. See the top of this script for the command that makes it.")
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), SinglePage)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def open_phone(p: Playwright, problems: list[str], ignore: tuple[str, ...] = ()):
    """Opens Chrome at phone size. Browser errors and warnings are collected into `problems`."""
    # Chrome refuses to start as root without this. It only happens on build machines.
    args = ["--no-sandbox"] if hasattr(os, "geteuid") and os.geteuid() == 0 else []
    browser = p.chromium.launch(channel="chrome", args=args)
    page = browser.new_context(
        viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True
    ).new_page()

    def on_console(message):
        if message.type in ("error", "warning") and not any(text in message.text for text in ignore):
            problems.append(f"{message.type}: {message.text}")

    page.on("console", on_console)
    page.on("pageerror", lambda error: problems.append(f"error: {error}"))
    return browser, page


def clear_pictures(prefix: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob(f"{prefix}*.png"):
        old.unlink()
