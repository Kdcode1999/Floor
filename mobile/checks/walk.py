"""Walks the phone app the way a mentor would, checks what should be true at each step, and
saves a picture of every screen.

It drives the app's web build in Chrome at phone size. It is how screens are checked before a
push. It does not replace looking at the app on a real phone.

Needs Python with Playwright (`pip install playwright`) and Google Chrome. From `mobile/`:

    npx expo export --platform web
    python checks/walk.py

Pictures land in `checks/out/`. The script exits with an error if any check fails.
"""

import http.server
import os
import pathlib
import sys
import threading

from playwright.sync_api import Locator, expect, sync_playwright

MOBILE = pathlib.Path(__file__).resolve().parent.parent
DIST = MOBILE / "dist"
OUT = MOBILE / "checks" / "out"
PORT = 8090
BASE = f"http://127.0.0.1:{PORT}"

# The colour behind every screen, per theme. From src/theme/themes.ts.
BACKGROUND = {"night": "rgb(9, 10, 18)", "dawn": "rgb(242, 240, 247)", "smoke": "rgb(13, 13, 15)"}

failures: list[str] = []


def check(what: str, ok: bool) -> None:
    print(("  ok    " if ok else "  FAIL  ") + what)
    if not ok:
        failures.append(what)


def check_visible(what: str, locator: Locator) -> None:
    """Passes once the element is on screen. Waits a moment for the app to catch up first."""
    try:
        expect(locator).to_be_visible(timeout=3000)
        check(what, True)
    except AssertionError:
        check(what, False)


class SinglePage(http.server.SimpleHTTPRequestHandler):
    """Serves the export. Any address that is not a file gets index.html, as a phone app has no pages."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0].strip("/")
        target = DIST / clean
        return str(target if clean and target.is_file() else DIST / "index.html")

    def log_message(self, *args):
        pass


def main() -> None:
    if not (DIST / "index.html").is_file():
        sys.exit("No web build found. Run `npx expo export --platform web` in mobile/ first.")
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.png"):
        old.unlink()

    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), SinglePage)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    problems: list[str] = []
    with sync_playwright() as p:
        # Chrome refuses to start as root without this. It only happens on build machines.
        args = ["--no-sandbox"] if hasattr(os, "geteuid") and os.geteuid() == 0 else []
        browser = p.chromium.launch(channel="chrome", args=args)
        page = browser.new_context(
            viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True
        ).new_page()
        page.on(
            "console",
            lambda m: problems.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None,
        )
        page.on("pageerror", lambda e: problems.append(f"error: {e}"))

        def shot(name: str) -> None:
            page.wait_for_timeout(450)
            page.screenshot(path=str(OUT / f"{name}.png"))

        def tab(label: str) -> None:
            page.get_by_role("tab", name=label).click()

        def theme_is(name: str) -> bool:
            page.wait_for_timeout(250)
            return page.evaluate("getComputedStyle(document.body).backgroundColor") == BACKGROUND[name]

        def arrives_at(path: str) -> bool:
            try:
                page.wait_for_url(BASE + path, timeout=3000)
                return True
            except Exception:
                print("        still at " + page.url)
                return False

        def tour(theme: str) -> None:
            tab("Feed")
            page.mouse.move(195, 500)
            page.mouse.wheel(0, -3000)
            shot(f"{theme}-1-feed")
            page.mouse.wheel(0, 3000)
            shot(f"{theme}-2-feed-scrolled")
            # The last line of the last card must end up above the floating navigation.
            last = page.get_by_text("189.90").bounding_box()
            nav = page.get_by_role("tablist").bounding_box()
            check(f"{theme}: the feed scrolls clear of the navigation", last["y"] + last["height"] < nav["y"])
            tab("Learn")
            check_visible(f"{theme}: Learn shows its empty state", page.get_by_text("No lessons yet"))
            shot(f"{theme}-3-learn")
            tab("Chat")
            check_visible(f"{theme}: Chat shows its empty state", page.get_by_text("No groups yet"))
            shot(f"{theme}-4-chat")
            tab("Manage")
            shot(f"{theme}-5-manage")

        print("Start")
        page.goto(BASE + "/", wait_until="networkidle")
        page.wait_for_timeout(800)
        tabs = [t.inner_text() for t in page.get_by_role("tab").all()]
        check("a mentor sees Feed, Learn, Chat and Manage", tabs == ["Feed", "Learn", "Chat", "Manage"])
        check("the app opens in Night", theme_is("night"))
        tour("night")
        check("two requests are waiting", page.get_by_role("button", name="Approve").count() == 2)

        print("Space look: try a theme on, then leave without saving")
        page.get_by_role("button", name="Space look").click()
        shot("night-6-look")
        check("Save look is off until something changes", page.get_by_role("button", name="Save look").is_disabled())
        page.get_by_role("radio", name="Dawn").click()
        check("tapping Dawn shows Dawn across the app", theme_is("dawn"))
        check("Save look is on after a change", page.get_by_role("button", name="Save look").is_enabled())
        shot("dawn-0-look-tried-on")
        page.get_by_role("button", name="Back to Manage").click()
        check("the back button returns to Manage", arrives_at("/manage"))
        check("leaving without saving puts Night back", theme_is("night"))

        print("Space look: rename, pick Dawn, save")
        page.get_by_role("button", name="Space look").click()
        page.get_by_label("Space name").fill("Kings FX Academy")
        page.get_by_role("radio", name="Dawn").click()
        shot("dawn-6-look")
        page.get_by_role("button", name="Save look").click()
        check("saving returns to Manage", arrives_at("/manage"))
        check("the saved theme is Dawn", theme_is("dawn"))
        check_visible("the new name is in the header", page.get_by_role("heading", name="Kings FX Academy").first)
        tour("dawn")

        print("Requests")
        page.get_by_role("button", name="Approve").first.click()
        page.get_by_role("button", name="Decline").first.click()
        check_visible("the queue empties", page.get_by_text("No one is waiting."))
        shot("dawn-7-manage-queue-empty")

        print("Smoke")
        page.get_by_role("button", name="Space look").click()
        page.get_by_role("radio", name="Smoke").click()
        shot("smoke-6-look")
        page.get_by_role("button", name="Save look").click()
        check("the saved theme is Smoke", theme_is("smoke"))
        tour("smoke")

        browser.close()
    server.shutdown()

    check("the browser reported no errors or warnings", not problems)
    for line in dict.fromkeys(problems):
        print("        " + line[:300])

    print(f"\nPictures: {OUT}")
    if failures:
        sys.exit(f"{len(failures)} check(s) failed.")
    print("All checks passed.")


if __name__ == "__main__":
    main()
