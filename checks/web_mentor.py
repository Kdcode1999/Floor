"""Walks the mentor's laptop page: signing in, building a course, uploading a lesson's video
and publishing it.

Runs on the local backend (a real Postgres with Floor's migrations), the web app's own server
routes, and a stand-in for the video host that checks every signature the way the real one does.

Needs Python with Playwright, psycopg and Pillow, Google Chrome, PostgreSQL and ffmpeg.
Build the web app first (bash shown; the values only matter while building):

    cd web
    NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8095 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=stand-in \\
      NEXT_PUBLIC_SITE_URL=http://127.0.0.1:8096 npx next build
    python ../checks/web_mentor.py

Pictures land in `checks/out/`, named `webmentor-*`. The script exits with an error if a check fails.
"""

from playwright.sync_api import sync_playwright

import fake_video_host
import fixtures
import local_db
import local_supabase
from common import OUT, check, check_gone, check_soon, check_visible, clear_pictures, finish, open_phone, start_web, stop_web
from phone_learn import SERVER_SETTINGS

BASE = "http://127.0.0.1:8096"
EXPECTED_NOISE = ("Failed to load resource",)


def main() -> None:
    backend = local_supabase.start(8095)
    film, pieces = fixtures.film()
    host = fake_video_host.start(8097, pieces, fixtures.picture("Lesson", size=(640, 360), kind="JPEG"))
    web = start_web(8096, SERVER_SETTINGS)
    clear_pictures("webmentor-")

    kay = fixtures.person("kay@example.com", "Kay")
    space = fixtures.space(kay, "Gold Desk", "gold-desk", theme="smoke")
    ada = fixtures.person("ada@example.com", "Ada O.")
    fixtures.join(ada, "gold-desk")

    def lessons() -> list[dict]:
        return local_db.rows("select * from public.lessons where space_id = %s order by created_at", [space])

    problems: list[str] = []
    try:
        with sync_playwright() as p:
            browser, page = open_phone(p, problems, ignore=EXPECTED_NOISE, laptop=True)

            def shot(name: str) -> None:
                page.wait_for_timeout(400)
                page.screenshot(path=str(OUT / f"webmentor-{name}.png"), full_page=True)

            def button(name: str):
                return page.get_by_role("button", name=name, exact=True)

            def sign_in(email: str) -> None:
                page.get_by_label("Email", exact=True).fill(email)
                button("Send code").click()
                page.get_by_label("Code", exact=True).fill(local_supabase.THE_CODE)

            print("Signing in")
            page.goto(BASE + "/mentor", wait_until="networkidle")
            check_visible("the page asks for sign-in", page.get_by_role("heading", name="Sign in"))
            page.get_by_label("Email", exact=True).fill("nobody@example.com")
            button("Send code").click()
            check_visible("an email with no account is turned away, and none is created", page.get_by_text("No account uses that email", exact=False))
            check("no account was made for it", local_db.value("select count(*) from auth.users where email = 'nobody@example.com'") == 0)
            shot("1-sign-in")

            sign_in("ada@example.com")
            check_visible("a member is told the page is not for them", page.get_by_role("heading", name="You don't run a space"))
            button("Sign out").click()
            check_visible("signing out returns to sign-in", page.get_by_role("heading", name="Sign in"))

            sign_in("kay@example.com")
            check_visible("the mentor lands in their space", page.get_by_role("heading", name="Gold Desk"))
            check("in the space's own theme", page.evaluate("getComputedStyle(document.querySelector('.space')).backgroundColor") == "rgb(13, 13, 15)")
            check("the laptop did not take the account's one login from the phone", local_db.value("select active_session_id from public.account_security where user_id = %s", [kay]) is None)

            print("Building the course")
            page.get_by_label("New module", exact=True).fill("The basics")
            button("Add module").click()
            check_visible("a module is added", page.get_by_role("heading", name="The basics"))
            button("Add a lesson to The basics").click()
            button("Save lesson").click()
            check_visible("a lesson needs a title", page.get_by_text("Give the lesson a title."))
            page.get_by_label("Lesson title", exact=True).fill("Reading a chart")
            page.get_by_label("Notes", exact=True).fill("Candles, timeframes and what the wicks tell you.")
            button("Save lesson").click()
            check_visible("the lesson is listed as a draft with no video", page.get_by_text("Draft · No video"))
            check_soon("and is in the database", lambda: [(row["title"], row["video_status"]) for row in lessons()] == [("Reading a chart", "none")])
            shot("2-course")

            print("Uploading the video")
            source = OUT / "webmentor-film-source.mp4"
            source.write_bytes(film)
            page.get_by_label("Video file for Reading a chart").set_input_files(str(source))
            check_visible("the upload finishes and the video is being prepared", page.get_by_text("Draft · Video is being prepared"))
            video_id = lessons()[0]["video_id"]
            sent = fake_video_host.videos.get(video_id, {})
            check("the whole file reached the video host", sent.get("received") == len(film))
            check("publishing waits for the video", button("Publish Reading a chart").is_disabled())
            shot("3-preparing")
            try:
                page.get_by_text("Draft · Video ready · 12 sec").wait_for(timeout=20000)
                check("the page notices when the video is ready", True)
            except Exception:
                check("the page notices when the video is ready", False)
            button("Publish Reading a chart").click()
            check_visible("then the lesson can be published", page.get_by_text("Published · Video ready · 12 sec"))
            check_soon("and is published in the database", lambda: lessons()[0]["published_at"] is not None)
            check_soon("an alert for VIP members was queued and taken by the server", lambda: local_db.value("select count(*) from private.outbox where kind = 'alert' and attempts > 0") == 1)
            shot("4-published")

            print("Replacing and unpublishing")
            page.get_by_label("Video file for Reading a chart").set_input_files(str(source))
            check_visible("replacing the video takes the lesson back to a draft", page.get_by_text("Draft · Video is being prepared"))
            check_soon("the old video is removed from the host", lambda: video_id in fake_video_host.deleted)
            try:
                page.get_by_text("Draft · Video ready · 12 sec").wait_for(timeout=20000)
                check("the new video becomes ready", True)
            except Exception:
                check("the new video becomes ready", False)
            button("Publish Reading a chart").click()
            check_visible("and the lesson is published again", page.get_by_text("Published · Video ready · 12 sec"))
            button("Take Reading a chart back to a draft").click()
            check_visible("a lesson can be unpublished", page.get_by_text("Draft · Video ready · 12 sec"))
            check_gone("with no stray errors on the page", page.get_by_role("alert").filter(has_text="."))

            browser.close()
    finally:
        stop_web(web)
        host.shutdown()
        backend.shutdown()
    finish(problems)


if __name__ == "__main__":
    main()
