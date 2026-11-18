"""Walks the things that keep Floor safe to use: reporting a space, Floor suspending and
restoring one, and deleting an account.

A member reports their space from the phone. Floor's own team reads it on the web at /admin,
suspends the space with a note, and later restores it. Along the way the walk looks at what a
member and the mentor each see while the space is suspended. Then a member deletes their
account in the app, the mentor deletes theirs on the web, which takes the space with it, and
someone left with no space deletes theirs from the screen that says so.

Runs on the local backend (a real Postgres with Floor's migrations), the web app's own server
routes, and the phone app's web build. Build both apps first: `checks/README.md` has the
commands. Then, from `web/`:

    python ../checks/web_safety.py

Pictures land in `checks/out/`, named `safety-*`. The script exits with an error if a check fails.
"""

from playwright.sync_api import sync_playwright

import fake_video_host
import fixtures
import local_db
import local_services
import local_supabase
from common import MOBILE, OUT, Phone, check, check_gone, check_soon, check_visible, clear_pictures, finish, open_phone, serve

BASE = local_services.WEB
PHONE_PORT = 8094
PHONE = f"http://127.0.0.1:{PHONE_PORT}"
EXPECTED_NOISE = ("Failed to load resource",)
NOTE = "Your posts promise guaranteed profits. Remove them and write to us."


def main() -> None:
    services = local_services.start()
    phone_server = serve(MOBILE / "dist-stand-in", PHONE_PORT)
    clear_pictures("safety-")

    team = fixtures.person("team@floor.example", "Floor Team One")
    local_db.run("insert into public.platform_admins (user_id) values (%s)", [team])
    kay = fixtures.person("kay@example.com", "Kay")
    space = fixtures.space(kay, "Gold Desk", "gold-desk")
    people = {}
    for name in ["Tobi", "Ada", "Bola"]:
        people[name] = fixtures.person(f"{name.lower()}@example.com", "Ada O." if name == "Ada" else name)
        fixtures.join(people[name], "gold-desk")
    local_db.as_person(kay, "select public.set_member_role(%s, %s, 'admin')", [space, people["Tobi"]])
    fixtures.vip(space, people["Bola"], 30)

    # What the accounts leave behind them: a proof Ada sent, a picture in a post, and a lesson's video.
    fixtures.proof(space, people["Ada"], "payment", "Transfer from Ada")
    proof_path = f"{space}/{people['Ada']}/receipt.png"
    post_path = f"{space}/vip/chart.jpg"
    local_supabase.files[("posts", post_path)] = (fixtures.picture("Chart", kind="JPEG"), "image/jpeg")
    local_db.run("insert into storage.objects (bucket_id, name, owner) values ('posts', %s, %s)", [post_path, kay])
    module = local_db.as_person(kay, "select public.save_module(%s, 'Basics', null) as id", [space])[0]["id"]
    lesson = local_db.as_person(kay, "select public.save_lesson(%s, 'Lesson one', null, null) as id", [module])[0]["id"]
    fake_video_host.videos["video-of-lesson-one"] = {"title": "Lesson one", "length": 1, "received": 1, "asked": 1}
    local_db.run("select public.set_lesson_video(%s, 'bunny', 'video-of-lesson-one', 'ready', 60)", [lesson])

    def status() -> str:
        return local_db.value("select status from public.spaces where id = %s", [space])

    def account_exists(email: str) -> bool:
        return local_db.value("select count(*) from auth.users where email = %s", [email]) == 1

    problems: list[str] = []
    try:
        with sync_playwright() as p:
            # ------------------------------------------------------------------ a member reports
            print("A member reports their space")
            ada = Phone(p, PHONE, "safety-member-", problems, ignore=EXPECTED_NOISE)
            ada.sign_in("ada@example.com")
            ada.button("Account. You are: Member").click()
            ada.at("/account")
            ada.button("Report this space").click()
            check("the report screen opens", ada.at("/report"))
            check_visible("it says the mentor is not told who reported", ada.text("They are never told who reported them", exact=False))
            ada.button("Send report").click()
            check_visible("a report needs a reason", ada.text("Choose what is wrong.", exact=True))
            ada.page.get_by_role("radio", name="Something else").click()
            ada.field("What happened").fill("bad")
            ada.button("Send report").click()
            check_visible("and 'something else' needs a few words", ada.text("Tell us what is wrong, in a sentence or two.", exact=True))
            ada.page.get_by_role("radio", name="Promises guaranteed profits").click()
            ada.field("What happened").fill("Says 20% a week, every week, in Monday's post.")
            ada.shot("1-report")
            ada.button("Send report").click()
            check_visible("the member is thanked, and told the mentor will not know", ada.text("Gold Desk is not told who", exact=False))
            check_soon("the report is on file for Floor", lambda: local_db.rows("select reason, status from public.reports") == [{"reason": "guaranteed_profits", "status": "open"}])
            ada.button("Done").click()
            ada.at("/account")
            ada.button("Report this space").click()
            ada.page.get_by_role("radio", name="A scam").click()
            ada.button("Send report").click()
            check_visible("a second report while the first is open is turned away kindly", ada.text("You have already reported this space. Floor is looking into it.", exact=True))

            # ------------------------------------------------------------------ Floor's page
            laptop_browser, laptop = open_phone(p, problems, ignore=EXPECTED_NOISE, laptop=True)

            def shot(name: str) -> None:
                laptop.wait_for_timeout(400)
                laptop.screenshot(path=str(OUT / f"safety-{name}.png"), full_page=True)

            def sign_in(page, email: str) -> None:
                page.get_by_label("Email", exact=True).fill(email)
                page.get_by_role("button", name="Send code", exact=True).click()
                page.get_by_label("Code", exact=True).fill(local_supabase.THE_CODE)

            print("Floor's own page")
            laptop.goto(BASE + "/admin", wait_until="networkidle")
            sign_in(laptop, "kay@example.com")
            check_visible("a mentor is told the page is not for them", laptop.get_by_role("heading", name="This page is for Floor's own team"))
            check_gone("and sees no reports", laptop.get_by_text("Promises guaranteed profits"))
            laptop.get_by_role("button", name="Sign out", exact=True).click()

            sign_in(laptop, "team@floor.example")
            check_visible("Floor's team sees the space that was reported", laptop.get_by_role("heading", name="Gold Desk"))
            check_visible("what the member chose", laptop.get_by_text("Promises guaranteed profits", exact=True))
            check_visible("what they wrote", laptop.get_by_text("Says 20% a week, every week, in Monday's post.", exact=True))
            check_visible("and the name they go by", laptop.get_by_text("Ada O. ·", exact=False))
            check("but not their email", "ada@example.com" not in laptop.content())
            check_visible("the space's size is there to judge by", laptop.get_by_text("4 members, 1 VIP · 1 open report", exact=False))
            shot("2-reports")

            print("Floor suspends the space")
            reported = laptop.locator("section.card", has=laptop.get_by_role("heading", name="Gold Desk"))
            reported.get_by_role("button", name="Suspend…").click()
            reported.get_by_role("button", name="Suspend Gold Desk").click()
            check_visible("suspending needs a note for the mentor", reported.get_by_text("Write a note for the mentor first", exact=False))
            check("and nothing happened yet", status() == "active")
            reported.get_by_label("Note to the mentor of Gold Desk").fill(NOTE)
            reported.get_by_role("button", name="Suspend Gold Desk").click()
            check_visible("the space is marked suspended", reported.get_by_text("Suspended", exact=True))
            check("and is suspended in the database", status() == "suspended")
            shot("3-suspended")

            visitor_browser, visitor = open_phone(p, problems, ignore=EXPECTED_NOISE)
            visitor.goto(BASE + "/gold-desk", wait_until="networkidle")
            check_visible("its join page says the space is not available", visitor.get_by_role("heading", name="This space isn't available"))
            visitor_browser.close()

            print("What a member sees")
            ada.page.goto(PHONE + "/", wait_until="networkidle")
            check_visible("the app says the space is closed, by name", ada.page.get_by_role("heading", name="Gold Desk is closed for now"))
            check_visible("and that Floor suspended it", ada.text("Floor has suspended this space, so nothing in it can be opened", exact=False))
            check_gone("with no way in", ada.page.get_by_role("tab", name="Feed"))
            ada.shot("2-closed")

            print("What the mentor sees")
            mentor = Phone(p, PHONE, "safety-mentor-", problems, ignore=EXPECTED_NOISE)
            mentor.sign_in("kay@example.com")
            check_visible("the mentor can still get in, and is told", mentor.text("Floor has suspended this space", exact=True))
            check_visible("with Floor's own note", mentor.text(f"Floor's note: “{NOTE}”", exact=False))
            mentor.shot("1-suspended")
            mentor.page.get_by_role("tab", name="Manage").click()
            check_visible("the note is on Manage too", mentor.text("Floor has suspended this space", exact=True))
            mentor.close()

            print("Floor restores the space and closes the report")
            reported.get_by_role("button", name="Restore").click()
            check_soon("the space is open again", lambda: status() == "active")
            reported.get_by_role("button", name="Close reports").click()
            check_visible("with the report dealt with, nothing is waiting", laptop.get_by_text("Nothing is waiting.", exact=True))
            check("the report is closed", local_db.value("select status from public.reports") == "closed")
            laptop.get_by_label("Find a space by name or link word").fill("GOLD")
            laptop.get_by_role("button", name="Search", exact=True).click()
            check_visible("a space can be found by name, with no report", laptop.get_by_text("4 members, 1 VIP · 0 open reports", exact=False))
            laptop.get_by_label("Find a space by name or link word").fill("nothing-like-this")
            laptop.get_by_role("button", name="Search", exact=True).click()
            check_visible("a search with no match says so", laptop.get_by_text("No space matches that.", exact=True))

            ada.button("Check again").click()
            check_visible("the member's app opens again", ada.page.get_by_role("tab", name="Feed"))

            # ------------------------------------------------------------------ a member deletes their account
            print("A member deletes their account in the app")
            check("the member's proof is in the file store", ("proofs", proof_path) in local_supabase.files)
            ada.button("Account. You are: Member").click()
            ada.at("/account")
            ada.button("Delete account").click()
            check("the delete screen opens", ada.at("/delete-account"))
            check_visible("it says what goes", ada.text("Your place in every space you joined, with any VIP time you have left.", exact=True))
            check_visible("and that money paid to a mentor is not Floor's to return", ada.text("Floor never held it", exact=False))
            ada.shot("3-delete")
            ada.button("Keep my account").click()
            ada.at("/account")
            check("changing your mind changes nothing", account_exists("ada@example.com"))
            ada.button("Delete account").click()
            ada.at("/delete-account")
            ada.button("Delete my account for good").click()
            check_visible("the app returns to sign-in", ada.field("Email"))
            check("the account is gone", not account_exists("ada@example.com"))
            check("and so is their place in the space", local_db.value("select count(*) from public.memberships where user_id = %s", [people["Ada"]]) == 0)
            check_soon("and the proof they uploaded", lambda: ("proofs", proof_path) not in local_supabase.files)
            check("the space itself is untouched", status() == "active")
            ada.close()

            # ------------------------------------------------------------------ the mentor deletes theirs
            print("Someone still in the space")
            bola = Phone(p, PHONE, "safety-vip-", problems, ignore=EXPECTED_NOISE)
            bola.sign_in("bola@example.com")
            check_visible("a VIP member is in the space", bola.page.get_by_role("tab", name="Feed"))

            print("The mentor deletes their account on the web")
            laptop.goto(BASE + "/account", wait_until="networkidle")
            # Floor's team member is still signed in on this browser from the admin page.
            laptop.get_by_role("button", name="Sign out", exact=True).click()
            sign_in(laptop, "kay@example.com")
            check_visible("the page says who is signed in", laptop.get_by_text("kay@example.com", exact=True))
            check_visible("and that the space goes too, and who loses it", laptop.get_by_text("Gold Desk, the space you run, with every post, lesson, video and chat in it. Its 2 members lose it.", exact=True))
            shot("4-account")
            laptop.get_by_role("button", name="Delete my account", exact=True).click()
            laptop.get_by_label('Type "Gold Desk" to confirm').fill("Gold")
            laptop.get_by_role("button", name="Delete my account for good").click()
            check_visible("the space's name has to be typed out", laptop.get_by_text("Type your space's name exactly", exact=False))
            check("and until it is, nothing is deleted", account_exists("kay@example.com") and status() == "active")
            laptop.get_by_label('Type "Gold Desk" to confirm').fill("gold desk")
            laptop.get_by_role("button", name="Delete my account for good").click()
            check_visible("the page says the account is deleted", laptop.get_by_role("heading", name="Your account is deleted"))
            check("the mentor's account is gone", not account_exists("kay@example.com"))
            check("and the space with it", local_db.value("select count(*) from public.spaces") == 0)
            check("with its lessons", local_db.value("select count(*) from public.lessons") == 0)
            check_soon("its pictures leave the file store", lambda: ("posts", post_path) not in local_supabase.files)
            check_soon("and its video leaves the video host", lambda: fake_video_host.deleted == ["video-of-lesson-one"])
            check("other people's accounts are untouched", account_exists("bola@example.com") and account_exists("tobi@example.com"))
            laptop_browser.close()

            # ------------------------------------------------------------------ deleting from the hold screen
            print("A member left with no space deletes their account")
            bola.page.goto(PHONE + "/", wait_until="networkidle")
            check_visible("the app says they are in no space now", bola.page.get_by_role("heading", name="You're not in a space yet"))
            bola.button("Delete account").click()
            check("the delete screen opens from there too", bola.at("/delete-account"))
            bola.button("Delete my account for good").click()
            check_visible("and returns to sign-in", bola.field("Email"))
            check("the account is gone", not account_exists("bola@example.com"))
            bola.close()

            check_soon("every job the deletions queued was done", lambda: local_db.value("select count(*) from private.outbox where done_at is null and kind in ('files_delete', 'video_delete')") == 0)
    finally:
        phone_server.shutdown()
        services.stop()
    finish(problems)


if __name__ == "__main__":
    main()
