"""Shared by the walk-throughs in this folder: a tiny web server for the app's web build, a
phone-sized Chrome, and the pass/fail bookkeeping."""

import http.server
import os
import pathlib
import subprocess
import sys
import threading
import time
import urllib.request

from playwright.sync_api import Locator, Playwright, expect

ROOT = pathlib.Path(__file__).resolve().parent.parent
MOBILE = ROOT / "mobile"
WEB = ROOT / "web"
OUT = ROOT / "checks" / "out"

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


def check_count(what: str, locator: Locator, count: int) -> None:
    """Passes once there are exactly this many of the element. Waits a moment first."""
    try:
        expect(locator).to_have_count(count, timeout=4000)
        check(what, True)
    except AssertionError:
        check(what, False)


def check_gone(what: str, locator: Locator) -> None:
    check_count(what, locator, 0)


def check_ticked(what: str, locator: Locator, ticked: bool = True) -> None:
    """Passes once a checkbox is ticked (or, with ticked=False, not ticked)."""
    try:
        expect(locator).to_have_attribute("aria-checked", "true" if ticked else "false", timeout=4000)
        check(what, True)
    except AssertionError:
        check(what, False)


def check_soon(what: str, test, seconds: float = 5) -> None:
    """Passes once `test()` is true. For things that settle a moment after the screen changes,
    such as a row the app has just asked the database to change."""
    end = time.time() + seconds
    while time.time() < end:
        if test():
            return check(what, True)
        time.sleep(0.2)
    check(what, bool(test()))


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


def open_phone(p: Playwright, problems: list[str], ignore: tuple[str, ...] = (), laptop: bool = False):
    """Opens Chrome at phone size, or at laptop size for the pages a mentor uses on one.
    Browser errors and warnings are collected into `problems`."""
    # Chrome refuses to start as root without this. It only happens on build machines.
    args = ["--no-sandbox"] if hasattr(os, "geteuid") and os.geteuid() == 0 else []
    browser = p.chromium.launch(channel="chrome", args=args)
    if laptop:
        page = browser.new_context(viewport={"width": 1280, "height": 800}).new_page()
    else:
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


class Phone:
    """One person's phone: Chrome at phone size, and the few moves every walk-through makes."""

    def __init__(self, p: Playwright, base: str, prefix: str, problems: list[str], ignore: tuple[str, ...] = ()):
        self.browser, self.page = open_phone(p, problems, ignore)
        self.base = base
        self.prefix = prefix

    def shot(self, name: str) -> None:
        self.page.wait_for_timeout(450)
        self.page.screenshot(path=str(OUT / f"{self.prefix}{name}.png"))

    def at(self, path: str) -> bool:
        """True once the app is on this screen."""
        try:
            self.page.wait_for_url(lambda url: url.split("?")[0] == self.base + path, timeout=4000)
            return True
        except Exception:
            print("        still at " + self.page.url)
            return False

    def button(self, name: str, exact: bool = True) -> Locator:
        return self.page.get_by_role("button", name=name, exact=exact)

    def field(self, label: str) -> Locator:
        return self.page.get_by_role("textbox", name=label, exact=True)

    def text(self, words: str, exact: bool = False) -> Locator:
        return self.page.get_by_text(words, exact=exact)

    def sign_in(self, email: str, code: str = "123456") -> None:
        """Signs in with the emailed code and waits until the app has let the person in."""
        self.page.goto(self.base + "/", wait_until="networkidle")
        self.field("Email").fill(email)
        self.button("Send code").click()
        self.at("/code")
        self.field("Code").fill(code)
        self.page.wait_for_url(lambda url: "/code" not in url and "/sign-in" not in url, timeout=8000)
        self.page.wait_for_load_state("networkidle")

    def close(self) -> None:
        self.browser.close()


def start_web(port: int, settings: dict[str, str] | None = None) -> subprocess.Popen:
    """Starts the web app's production build, with the server's own settings for this run.

    The build has to exist already: the top of each script says how to make it. The settings
    whose names start with NEXT_PUBLIC_ are fixed when it is built. The rest are read here.
    """
    if not (WEB / ".next" / "BUILD_ID").is_file():
        sys.exit("No web build. See the top of this script for the command that makes it.")

    def answering() -> bool:
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=1)
            return True
        except Exception:
            return False

    if answering():
        sys.exit(f"Something is already answering on port {port}. Stop it first: it may be an older build.")
    # Started with node itself, so stopping it stops the server and not just a wrapper around it.
    web = subprocess.Popen(
        ["node", "node_modules/next/dist/bin/next", "start", "-p", str(port)],
        cwd=WEB, env={**os.environ, **(settings or {})}, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT,
    )
    for _ in range(60):
        if answering():
            return web
        time.sleep(0.5)
    web.terminate()
    sys.exit("The web app did not start.")


def stop_web(web: subprocess.Popen) -> None:
    web.terminate()
    web.wait()
