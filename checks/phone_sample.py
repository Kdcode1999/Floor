"""Walks the phone app the way a mentor would, checks what should be true at each step, and
saves a picture of every screen.

It drives the app's web build in Chrome at phone size. It is how screens are checked before a
push. It does not replace looking at the app on a real phone.

It covers the app as it runs with no backend: the sample space, seen as its mentor. Sign-in is
walked by phone_sign_in.py.

Needs Python with Playwright (`pip install playwright`) and Google Chrome. From `mobile/`, with
no .env file in the way:

    npx expo export --platform web
    python ../checks/phone_sample.py

Pictures land in `checks/out/`. The script exits with an error if any check fails.
"""

from playwright.sync_api import sync_playwright

from common import MOBILE, OUT, check, check_visible, clear_pictures, finish, open_phone, serve

DIST = MOBILE / "dist"
PORT = 8090
BASE = f"http://127.0.0.1:{PORT}"

# The colour behind every screen, per theme. From src/theme/themes.ts.
BACKGROUND = {"night": "rgb(9, 10, 18)", "dawn": "rgb(242, 240, 247)", "smoke": "rgb(13, 13, 15)"}


def main() -> None:
    server = serve(DIST, PORT)
    clear_pictures("night-")
    clear_pictures("dawn-")
    clear_pictures("smoke-")

    problems: list[str] = []
    with sync_playwright() as p:
        browser, page = open_phone(p, problems)

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
            check_visible(f"{theme}: Chat shows the two groups a space starts with", page.get_by_role("button", name="VIP room. For VIP members."))
            check_visible(f"{theme}: and says more can be added", page.get_by_text("Every space starts with these two groups.", exact=False))
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
        check_visible("declining asks why first", page.get_by_role("textbox", name="Why? The member sees this"))
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
    finish(problems)


if __name__ == "__main__":
    main()
