"""Walks Learn and Protection in the phone app, as the mentor, a VIP member and a free member.

The mentor builds a course, uploads a lesson's video and publishes it. The VIP member watches
it with their name over the video, and their progress is kept. The free member sees the course
locked. The mentor then switches a protection off, and deletes a lesson.

Runs on the local backend (a real Postgres with Floor's migrations), the web app's own server
routes, and a stand-in for the video host that checks every signature the way the real one does.

Needs Python with Playwright, psycopg and Pillow, Google Chrome, PostgreSQL and ffmpeg.
Build both apps first (bash shown; the values only matter while building):

    cd web
    NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8095 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=stand-in \\
      NEXT_PUBLIC_SITE_URL=http://127.0.0.1:8096 npx next build
    cd ../mobile
    EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:8095 EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=stand-in \\
      EXPO_PUBLIC_SITE_URL=http://127.0.0.1:8096 npx expo export --platform web --output-dir dist-stand-in
    python ../checks/phone_learn.py

Pictures land in `checks/out/`, named `learn-*`. The script exits with an error if a check fails.
"""

import re

from playwright.sync_api import sync_playwright

import fake_video_host
import fixtures
import local_db
import local_services
from common import MOBILE, OUT, Phone, check, check_count, check_gone, check_soon, check_ticked, check_visible, clear_pictures, finish, serve

DIST = MOBILE / "dist-stand-in"
PORT = 8094
BASE = f"http://127.0.0.1:{PORT}"
EXPECTED_NOISE = ("Failed to load resource",)


def main() -> None:
    services = local_services.start()
    film = services.film
    server = serve(DIST, PORT)
    clear_pictures("learn-")

    kay = fixtures.person("kay@example.com", "Kay")
    space = fixtures.space(kay, "Gold Desk", "gold-desk")
    vee = fixtures.person("vee@example.com", "Vee")
    free = fixtures.person("free@example.com", "Free")
    for person in (vee, free):
        fixtures.join(person, "gold-desk")
    fixtures.vip(space, vee, 30)

    def lessons(where: str = "true") -> list[dict]:
        return local_db.rows(f"select * from public.lessons where space_id = %s and {where} order by position", [space])

    problems: list[str] = []
    try:
        with sync_playwright() as p:
            mentor = Phone(p, BASE, "learn-mentor-", problems, ignore=EXPECTED_NOISE)
            page = mentor.page

            print("Building the course")
            mentor.sign_in("kay@example.com")
            page.get_by_role("tab", name="Learn").click()
            check_visible("a new space has no lessons", mentor.text("No lessons yet"))
            mentor.button("Edit the course").click()
            check("the course builder opens", mentor.at("/manage/learn"))
            check_visible("and says where to start", mentor.text("A course is made of modules", exact=False))
            mentor.field("New module").fill("The basics")
            mentor.button("Add module").click()
            check_visible("a module is added", page.get_by_role("heading", name="The basics"))
            mentor.field("New module").fill("Risk")
            mentor.button("Add module").click()
            check_visible("and another", page.get_by_role("heading", name="Risk"))
            mentor.shot("1-course-empty")

            mentor.button("Add a lesson").first.click()
            check("a new lesson opens", mentor.at("/manage/lesson"))
            mentor.button("Save and add the video").click()
            check_visible("a lesson needs a title", mentor.text("Give the lesson a title."))
            mentor.field("Title").fill("Reading a chart")
            mentor.field("Notes").fill("Candles, timeframes and what the wicks tell you. Homework: mark three swing highs on EURUSD.")
            mentor.button("Save and add the video").click()
            check_visible("once saved, the video can be added", mentor.button("Choose a video"))
            check("the lesson is in the database, as a draft", [(row["title"], row["published_at"], row["video_status"]) for row in lessons()] == [("Reading a chart", None, "none")])
            mentor.button("Publish").click()
            check_visible("a lesson with words but no video can be published as a reading lesson", page.get_by_role("heading", name="Published"))
            mentor.button("Take back to a draft").click()
            check_visible("and taken back", page.get_by_role("heading", name="Draft"))

            print("Uploading the video")
            source = OUT / "learn-film-source.mp4"
            source.write_bytes(film)
            with page.expect_file_chooser() as chooser:
                mentor.button("Choose a video").click()
            chooser.value.set_files(str(source))
            check_visible("the upload finishes and the host starts preparing the video", mentor.text("Video is being prepared"))
            video_id = lessons()[0]["video_id"]
            sent = fake_video_host.videos.get(video_id, {})
            check("the whole file reached the video host, in pieces, with a valid ticket", sent.get("received") == len(film) and sent.get("length") == len(film))
            check_soon("the lesson knows its video is being prepared", lambda: lessons()[0]["video_status"] == "processing")
            mentor.shot("2-video-preparing")
            mentor.button("Publish").click()
            check_visible("a lesson cannot be published before its video is ready", mentor.text("The video is not ready yet", exact=False))
            try:
                mentor.text("Video ready · 12 sec").wait_for(timeout=15000)
                check("the app notices when the video is ready", True)
            except Exception:
                check("the app notices when the video is ready", False)
            check("and so does the database, with the video's length", (lessons()[0]["video_status"], lessons()[0]["duration_seconds"]) == ("ready", 12))
            mentor.button("Publish").click()
            check_visible("then it publishes", page.get_by_role("heading", name="Published"))
            check("an alert is queued for VIP members", local_db.value("select count(*) from private.outbox where kind = 'alert' and payload ->> 'type' = 'lesson'") >= 1)
            mentor.shot("3-lesson-published")

            print("More lessons, and their order")
            mentor.button("Back to the course").click()
            mentor.at("/manage/learn")
            mentor.button("Add a lesson").first.click()
            mentor.field("Title").fill("What a pip is")
            mentor.field("Notes").fill("A pip is the fourth decimal place on most pairs.")
            mentor.button("Save and add the video").click()
            mentor.button("Publish").click()
            check_visible("a second lesson is published", page.get_by_role("heading", name="Published"))
            mentor.button("Back to the course").click()
            mentor.at("/manage/learn")
            mentor.button("Add a lesson").nth(1).click()
            mentor.field("Title").fill("Position size")
            mentor.button("Save and add the video").click()
            check_visible("a third is saved", mentor.button("Choose a video"))
            mentor.button("Publish").click()
            check_visible("an empty lesson cannot be published", mentor.text("Add a video or some words before publishing."))
            mentor.button("Back to the course").click()
            mentor.at("/manage/learn")
            mentor.button("Move What a pip is up").click()
            page.wait_for_timeout(600)
            check("lessons can be put in order", [row["title"] for row in lessons("module_id = (select id from public.modules where title = 'The basics')")] == ["What a pip is", "Reading a chart"])
            mentor.button("Move Risk up").click()
            page.wait_for_timeout(600)
            check("and so can modules", [row["title"] for row in local_db.rows("select title from public.modules order by position")] == ["Risk", "The basics"])
            mentor.button("Move Risk down").click()
            page.wait_for_timeout(600)
            mentor.shot("4-course")

            print("A VIP member learns")
            vip_phone = Phone(p, BASE, "learn-vip-", problems, ignore=EXPECTED_NOISE)
            view = vip_phone.page
            vip_phone.sign_in("vee@example.com")
            check_visible("the new lessons are in the Feed", view.get_by_role("button", name="New lesson: Reading a chart", exact=False))
            view.get_by_role("tab", name="Learn").click()
            check_visible("the course shows its modules", view.get_by_role("heading", name="The basics"))
            check_gone("but not a draft", vip_phone.text("Position size"))
            check_gone("nor a module with nothing to open", view.get_by_role("heading", name="Risk"))
            check_visible("with the member's progress", vip_phone.text("0 of 2 done").first)
            vip_phone.shot("1-learn")
            lesson_row = view.get_by_role("button", name=re.compile(r"^Reading a chart\. "))
            lesson_row.click()
            check("a lesson opens", vip_phone.at("/lesson"))
            check_visible("with the mentor's notes", vip_phone.text("Candles, timeframes", exact=False))
            video = view.locator("video")
            check_count("and its video", video, 1)
            address = video.get_attribute("src") or ""
            check("at an address signed for this video alone", f"/bcdn_token=HS256-" in address and f"/{video_id}/playlist.m3u8" in address)
            check_visible("the member's name and email sit over the video", vip_phone.text("Vee · vee@example.com"))
            view.evaluate("const v = document.querySelector('video'); v.muted = true; v.play();")
            try:
                view.wait_for_function("document.querySelector('video').currentTime > 1.5", timeout=15000)
                check("the video plays: the player followed the playlist to its pieces", True)
            except Exception:
                check("the video plays: the player followed the playlist to its pieces", False)
            vip_phone.shot("2-lesson-playing")
            view.get_by_role("checkbox", name="Data saver").click()
            check_count("data saver can be switched on, and the video carries on", view.locator("video"), 1)
            view.evaluate("const v = document.querySelector('video'); v.muted = true; v.currentTime = 10; v.play();")
            try:
                vip_phone.text("12 sec · Done").wait_for(timeout=20000)
                check("watching to the end marks the lesson done", True)
            except Exception:
                check("watching to the end marks the lesson done", False)
            progress = local_db.rows("select seconds, completed_at from public.lesson_progress where user_id = %s", [vee])
            check("and the database keeps it", len(progress) == 1 and progress[0]["completed_at"] is not None)
            vip_phone.button("Next: What a pip is", exact=False).click() if vip_phone.button("Next: What a pip is", exact=False).count() else None
            check_gone("after the last lesson there is no next one", vip_phone.button("Next:", exact=False))

            view.goto(BASE + "/", wait_until="networkidle")
            view.get_by_role("tab", name="Learn").click()
            check_visible("the course shows what is done", vip_phone.text("1 of 2 done").first)
            view.get_by_role("button", name=re.compile(r"^What a pip is\. ")).click()
            vip_phone.at("/lesson")
            check_visible("a reading lesson shows its words", vip_phone.text("A pip is the fourth decimal place on most pairs."))
            check_visible("and the way to the next lesson", vip_phone.button("Next: Reading a chart"))
            vip_phone.button("Mark as done").click()
            check_gone("it can be marked done", vip_phone.button("Mark as done"))
            view.wait_for_timeout(500)
            check("both lessons are done in the database", local_db.value("select count(*) from public.lesson_progress where user_id = %s and completed_at is not null", [vee]) == 2)
            vip_phone.shot("3-reading-lesson")

            print("A free member looks")
            free_phone = Phone(p, BASE, "learn-free-", problems, ignore=EXPECTED_NOISE)
            look = free_phone.page
            free_phone.sign_in("free@example.com")
            check_visible("the Feed shows that a lesson was added, locked", free_phone.text("New lesson: Reading a chart"))
            look.get_by_role("tab", name="Learn").click()
            check_visible("the course is shown as for VIP", free_phone.text("Lessons are for VIP members"))
            locked = look.get_by_role("button", name="Reading a chart. For VIP members")
            check_visible("with each lesson's title", locked)
            check("and no way in", locked.is_disabled())
            check("the lessons table gives a free member nothing", local_db.as_person(free, "select id from public.lessons") == [])
            free_phone.shot("1-learn-locked")

            print("Protection")
            page.goto(BASE + "/", wait_until="networkidle")
            page.get_by_role("tab", name="Manage").click()
            mentor.button("Protection. Logins, screenshots and paid video").click()
            check("Protection opens", mentor.at("/manage/protection"))
            check_visible("it says what is always on", mentor.text("One login at a time"))
            name_switch = page.get_by_role("checkbox", name="Show the viewer's name on paid video")
            capture_switch = page.get_by_role("checkbox", name="Block screenshots and screen recording")
            check_ticked("the name on video starts switched on", name_switch)
            check_ticked("and so does blocking screenshots", capture_switch)
            mentor.shot("5-protection")
            name_switch.click()
            page.wait_for_timeout(500)
            check("the mentor can switch the name on video off", local_db.value("select watermark from public.space_settings where space_id = %s", [space]) is False)
            view.goto(BASE + "/", wait_until="networkidle")
            view.get_by_role("tab", name="Learn").click()
            view.get_by_role("button", name=re.compile(r"^Reading a chart\. ")).click()
            check_count("the member's video still plays", view.locator("video"), 1)
            check_gone("now without their name over it", vip_phone.text("Vee · vee@example.com"))

            print("Deleting a lesson")
            page.goto(BASE + "/", wait_until="networkidle")
            page.get_by_role("tab", name="Manage").click()
            mentor.button("Add lesson").click()
            mentor.at("/manage/learn")
            mentor.button("Edit Reading a chart").click()
            mentor.at("/manage/lesson")
            mentor.button("Delete this lesson").click()
            mentor.button("Yes, delete").click()
            check("deleting returns to the course", mentor.at("/manage/learn"))
            check_gone("without the lesson", mentor.button("Edit Reading a chart"))
            page.wait_for_timeout(1500)
            check("its video is removed from the video host", video_id in fake_video_host.deleted)
            check("and the job that did it is finished", local_db.value("select count(*) from private.outbox where kind = 'video_delete' and done_at is not null and last_error is null") == 1)

            for phone in (mentor, vip_phone, free_phone):
                phone.close()
    finally:
        server.shutdown()
        services.stop()
    finish(problems)


if __name__ == "__main__":
    main()
