"""Walks sign-in from start to finish, checks what should be true at each step, and saves a
picture of every screen.

The app is built against a stand-in for the Supabase project (stand_in.py), so every path can
be walked without a real project or real emails: a wrong code, the right code, no space yet,
starting a space, several spaces, another phone taking over, the phone limit, a failing server.

Needs Python with Playwright and Google Chrome. From `mobile/` (bash shown; the two values
only matter while building):

    EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:8095 EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=stand-in \\
      npx expo export --platform web --output-dir dist-stand-in
    python ../checks/phone_sign_in.py

Pictures land in `checks/out/`, named `signin-*`. The script exits with an error if a check fails.
"""

from playwright.sync_api import sync_playwright

import stand_in
from common import MOBILE, OUT, check, check_visible, clear_pictures, finish, open_phone, serve
from stand_in import THE_CODE, membership, seen, world

DIST = MOBILE / "dist-stand-in"
PORT = 8094
BASE = f"http://127.0.0.1:{PORT}"
BACKGROUND = {"night": "rgb(9, 10, 18)", "dawn": "rgb(242, 240, 247)", "smoke": "rgb(13, 13, 15)"}

# The app is told to fail on purpose in places, and the browser logs each failed request.
EXPECTED_NOISE = ("Failed to load resource",)


def main() -> None:
    backend = stand_in.start(8095)
    server = serve(DIST, PORT)
    clear_pictures("signin-")

    problems: list[str] = []
    with sync_playwright() as p:
        browser, page = open_phone(p, problems, ignore=EXPECTED_NOISE)

        def shot(name: str) -> None:
            page.wait_for_timeout(450)
            page.screenshot(path=str(OUT / f"signin-{name}.png"))

        def at(path: str) -> bool:
            try:
                page.wait_for_url(lambda url: url.split("?")[0] == BASE + path, timeout=4000)
                return True
            except Exception:
                print("        still at " + page.url)
                return False

        def theme_is(name: str) -> bool:
            page.wait_for_timeout(300)
            return page.evaluate("getComputedStyle(document.body).backgroundColor") == BACKGROUND[name]

        def button(name: str):
            return page.get_by_role("button", name=name, exact=True)

        def field(label: str):
            return page.get_by_role("textbox", name=label, exact=True)

        def sign_in(email: str = "ada@example.com") -> None:
            field("Email").fill(email)
            button("Send code").click()
            at("/code")
            field("Code").fill(THE_CODE)

        print("Signed out")
        page.goto(BASE + "/", wait_until="networkidle")
        check("someone signed out is taken to sign-in", at("/sign-in"))
        shot("1-email")
        page.goto(BASE + "/manage", wait_until="networkidle")
        check("and cannot open a screen inside the app", at("/sign-in"))

        print("Email")
        field("Email").fill("not an email")
        button("Send code").click()
        check_visible("a bad address is caught before anything is sent", page.get_by_text("doesn't look right"))
        check("nothing was sent for it", seen["codes_sent_to"] == [])
        field("Email").fill("slow.down@example.com")
        button("Send code").click()
        check_visible("asking too often gets a plain message", page.get_by_text("Wait a minute"))
        shot("2-email-asked-too-often")

        print("Code")
        field("Email").fill("  Ada@Example.com ")
        button("Send code").click()
        check("a good address moves on to the code", at("/code"))
        check("the code was sent to the address, trimmed", seen["codes_sent_to"] == ["Ada@Example.com"])
        check_visible("the screen says where the code went", page.get_by_text("Ada@Example.com"))
        check("a new code cannot be asked for straight away", button("Send a new code").count() == 0)
        shot("3-code")
        field("Code").fill("000000")
        check_visible("a wrong code is explained", page.get_by_text("wrong or has run out"))
        check("a wrong code claims nothing", seen["claims"] == [])
        shot("4-code-wrong")

        print("The right code, and no space yet")
        field("Code").fill(THE_CODE)
        check_visible("the right code signs in, with no button to press", page.get_by_text("You're not in a space yet"))
        check("this phone claimed the login, once", len(seen["claims"]) == 1 and len(seen["claims"][0]) >= 16)
        check("the address shows the hold screen", at("/hold"))
        shot("5-no-space")

        button("Check again").click()
        check_visible("Check again changes nothing while they are still in no space", page.get_by_text("You're not in a space yet"))

        print("Starting a space")
        button("Start your own space").click()
        check("the way in opens the form", at("/create"))
        button("Create space").click()
        check_visible("a space needs a name", page.get_by_text("Give your space a name."))
        check_visible("and a link word", page.get_by_text("Use at least 3 letters or numbers."))
        field("Space name").fill("Kings")
        check("the link word is written from the name", field("Link word").input_value() == "kings")
        check("and the complaints about both are gone", page.get_by_text("Use at least 3 letters or numbers.").count() == 0 and page.get_by_text("Give your space a name.").count() == 0)
        page.get_by_role("radio", name="Dawn").click()
        check("tapping a theme tries it on", theme_is("dawn"))
        shot("5b-create")
        button("Create space").click()
        check_visible("the Mentor Terms must be agreed to", page.get_by_text("Agree to the Mentor Terms to go on."))
        check("nothing is created before that", seen["spaces_created"] == [])

        button("Read the Mentor Terms").click()
        check("the terms can be read first", at("/mentor-terms"))
        check_visible("they open with the rule on profits", page.get_by_text("No promised profits"))
        shot("5c-mentor-terms")
        button("Back").last.click()
        check("and reading them keeps what was typed", at("/create") and field("Space name").input_value() == "Kings")

        page.get_by_role("checkbox", name="I agree to the Mentor Terms").click()
        button("Create space").click()
        check_visible("a taken link word is explained under its box", page.get_by_text("That link word is taken. Try another."))
        field("Space name").fill("Kings FX")
        check("the link word follows the name until the mentor types their own", field("Link word").input_value() == "kings-fx")
        field("Link word").fill("Kings FX")
        check("typing is tidied into a link word", field("Link word").input_value() == "kings-fx")
        field("Space name").fill("Kings FX Academy")
        check("a link word the mentor typed is left alone", field("Link word").input_value() == "kings-fx")
        button("Create space").click()
        check_visible("the new space opens", page.get_by_role("heading", name="Kings FX Academy"))
        created = seen["spaces_created"]
        check("it was created with the name, link word and theme chosen", len(created) == 1 and (created[0]["p_name"], created[0]["p_slug"], created[0]["p_theme"]) == ("Kings FX Academy", "kings-fx", "dawn"))
        check("and with the version of the terms agreed to", created[0]["p_terms_version"] == "2026-11-17")
        check_visible("its maker is the mentor", button("Account. You are: Mentor"))
        check("in the theme they picked", theme_is("dawn"))
        check_visible("a real space starts with an empty feed", page.get_by_text("Nothing posted yet"))
        check("with no sample posts", page.get_by_text("London session").count() == 0)
        shot("6-space")
        page.get_by_role("tab", name="Manage").click()
        check_visible("and nobody waiting", page.get_by_text("No one is waiting."))
        check("with no sample requests", page.get_by_text("Ada O.").count() == 0)

        print("Space look saves to the database")
        page.get_by_role("button", name="Space look").click()
        page.get_by_role("radio", name="Smoke").click()
        button("Save look").click()
        check("saving returns to Manage", at("/manage"))
        check("the new theme was sent to the database", seen["space_changes"] == [{"id": "space-1", "name": "Kings FX Academy", "theme": "smoke"}])
        check("and is on screen", theme_is("smoke"))

        print("Account")
        page.get_by_role("button", name="Account").click()
        check("the badge in the header opens Account", at("/account"))
        check_visible("it shows who is signed in", page.get_by_text("Ada@Example.com"))
        shot("7-account")

        print("Closing and opening the app")
        page.goto(BASE + "/", wait_until="networkidle")
        check_visible("the login is kept: no sign-in the second time", page.get_by_role("heading", name="Kings FX Academy"))
        check("and the saved theme is back", theme_is("smoke"))
        check("opening the app again did not claim again", len(seen["claims"]) == 1)

        print("Another phone takes over")
        world["status"] = "not_current"
        page.goto(BASE + "/", wait_until="networkidle")
        check_visible("this phone is stopped", page.get_by_text("Signed in on another phone"))
        check("without taking the login back by itself", len(seen["claims"]) == 1)
        shot("8-elsewhere")
        page.goto(BASE + "/manage", wait_until="networkidle")
        check_visible("and cannot reach the space by its address", page.get_by_text("Signed in on another phone"))

        world["claim"] = "device_limit"
        button("Use this phone").click()
        check_visible("the phone limit is explained", page.get_by_text("can't move again yet"))
        shot("9-phone-limit")
        button("Sign out").click()
        check("signing out returns to sign-in", at("/sign-in"))
        check("and told the server", seen["sign_outs"] == 1)

        print("A failing server")
        world["claim"] = "error"
        sign_in()
        check_visible("trouble is shown, not a blank screen", page.get_by_text("Can't reach Floor"))
        check_visible("with the server's own words", page.get_by_text("The stand-in was told to fail"))
        shot("10-trouble")
        world["claim"] = "ok"
        button("Try again").click()
        check_visible("Try again gets through once the server is back", page.get_by_role("heading", name="Kings FX Academy"))

        print("Several spaces")
        world["memberships"] = [
            membership("space-1", "Kings FX Academy", theme="smoke", role="mentor"),
            membership("space-2", "Lagos Gold Room", theme="night", vip_until="2099-01-01T00:00:00Z"),
            membership("space-3", "Pips Before Bed", theme="dawn"),
        ]
        page.goto(BASE + "/", wait_until="networkidle")
        check_visible("with several spaces, the one last opened comes up", page.get_by_role("heading", name="Kings FX Academy"))
        page.get_by_role("button", name="Account").click()
        check("a mentor is not offered a second space of their own", button("Start your own space").count() == 0)
        button("Switch space").click()
        check_visible("Switch space shows the list", page.get_by_text("Choose a space"))
        shot("11-choose")
        page.get_by_role("button", name="Lagos Gold Room").click()
        check_visible("the picked space opens", page.get_by_role("heading", name="Lagos Gold Room"))
        check("in its theme", theme_is("night"))
        tabs = [t.inner_text() for t in page.get_by_role("tab").all()]
        check("a member there has no Manage tab", tabs == ["Feed", "Learn", "Chat"])
        check_visible("and sees their VIP badge", page.get_by_role("button", name="Account. You are: VIP"))
        shot("12-member-space")
        page.goto(BASE + "/", wait_until="networkidle")
        check_visible("the pick is remembered", page.get_by_role("heading", name="Lagos Gold Room"))

        page.get_by_role("button", name="Account").click()
        check_visible("Account shows when VIP ends", page.get_by_text("VIP until"))
        button("Switch space").click()
        check_visible("Switch space goes back to the list", page.get_by_text("Choose a space"))
        page.get_by_role("button", name="Pips Before Bed").click()
        check_visible("a free member is shown as Member", page.get_by_role("button", name="Account. You are: Member"))
        check("in that space's theme", theme_is("dawn"))

        browser.close()
    server.shutdown()
    backend.shutdown()
    finish(problems)


if __name__ == "__main__":
    main()
