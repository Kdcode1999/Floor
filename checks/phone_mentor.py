"""Walks the mentor's tools in the phone app: the approval queue, price and payment, invite
codes, members, and the space's logo.

This one runs on the local backend (local_supabase.py): a real Postgres with Floor's migrations,
so every rule the screens meet is the real one, and each step is checked in the database too.

Needs Python with Playwright, psycopg and Pillow, Google Chrome, and PostgreSQL installed.
From `mobile/` (bash shown; the values only matter while building):

    EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:8095 EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=stand-in \\
      EXPO_PUBLIC_SITE_URL=http://127.0.0.1:8096 npx expo export --platform web --output-dir dist-stand-in
    python ../checks/phone_mentor.py

Pictures land in `checks/out/`, named `mentor-*`. The script exits with an error if a check fails.
"""

from playwright.sync_api import sync_playwright

import fixtures
import local_db
import local_supabase
from common import MOBILE, OUT, Phone, check, check_count, check_gone, check_visible, clear_pictures, finish, serve

DIST = MOBILE / "dist-stand-in"
PORT = 8094
BASE = f"http://127.0.0.1:{PORT}"

# Refusals are part of the walk, and the browser logs each one.
EXPECTED_NOISE = ("Failed to load resource",)


def main() -> None:
    backend = local_supabase.start(8095)
    server = serve(DIST, PORT)
    clear_pictures("mentor-")

    kay = fixtures.person("kay@example.com", "Kay")
    space = fixtures.space(kay, "Gold Desk", "gold-desk")
    people = {}
    for email, name in [("ada@example.com", "Ada O."), ("sam@example.com", "Sam K."), ("tobi@example.com", "Tobi"),
                        ("zed@example.com", "Zed"), ("uche@example.com", "Uche"), ("bisi@example.com", "Bisi")]:
        people[name] = fixtures.person(email, name)
        fixtures.join(people[name], "gold-desk")
    fixtures.vip(space, people["Zed"], 2.5)
    fixtures.vip(space, people["Bisi"], 40)
    fixtures.vip(space, people["Uche"], -3)
    ada_request = fixtures.proof(space, people["Ada O."], "payment", "Paid by transfer, 25,000")
    sam_request = fixtures.proof(space, people["Sam K."], "broker", "Account ID 4830 2291")
    fixtures.proof(space, people["Tobi"], "payment", "USDT, see screenshot")
    fixtures.proof(space, people["Uche"], "payment", "Renewal")

    def member(name: str) -> dict:
        return local_db.rows("select role, status, vip_until, vip_until > now() as vip from public.memberships where space_id = %s and user_id = %s", [space, people[name]])[0]

    problems: list[str] = []
    with sync_playwright() as p:
        phone = Phone(p, BASE, "mentor-", problems, ignore=EXPECTED_NOISE)
        page = phone.page

        def reopen(tab: str) -> None:
            """Opens the app afresh, as after closing it, and goes to a tab."""
            page.goto(BASE + "/", wait_until="networkidle")
            page.get_by_role("tab", name=tab).click()

        print("The queue")
        phone.sign_in("kay@example.com")
        check_visible("the mentor lands in their space", phone.text("Gold Desk").first)
        page.get_by_role("tab", name="Manage").click()
        check("Manage opens", phone.at("/manage"))
        check_visible("the queue starts with whoever has waited longest", phone.text("Ada O."))
        check_visible("and says what kind of proof it is", phone.text("Payment proof").first)
        check_visible("what the member wrote is shown", phone.text("Paid by transfer, 25,000"))
        check_visible("and what approving gives", phone.text("Approving gives 30 days of VIP").first)
        check("only the first three are on Mentor home", phone.button("Approve").count() == 3)
        check_visible("with a way to the rest", phone.button("See all 4"))
        phone.shot("1-queue")

        phone.button("See what they sent").first.click()
        check("the proof opens", phone.at("/manage/proof"))
        check_visible("under the member's name", phone.text("From Ada O."))
        picture = page.get_by_role("img", name="The proof Ada O. sent")
        check_visible("and the picture is shown", picture)
        page.wait_for_timeout(600)
        check("the picture really loaded", page.evaluate("Array.from(document.images).some((image) => image.naturalWidth === 600)"))
        phone.shot("2-proof")
        phone.button("Back").first.click()
        phone.at("/manage")

        phone.button("Approve").first.click()
        check_gone("approving takes the request off the list", phone.text("Paid by transfer, 25,000"))
        check("Ada is VIP in the database", member("Ada O.")["vip"])
        check("her request is marked approved, by the mentor", local_db.rows("select status, decided_by::text from public.access_requests where id = %s", [ada_request]) == [{"status": "approved", "decided_by": kay}])

        phone.button("Decline").first.click()
        reason = phone.field("Why? The member sees this")
        check_visible("declining asks why", reason)
        reason.fill("The account is not under my link")
        phone.shot("3-decline")
        phone.button("Decline").first.click()
        check_visible("and takes the request off the list", phone.button("Approve").nth(1))
        page.wait_for_timeout(400)
        check("Sam's request is declined with the reason", local_db.rows("select status, decline_reason from public.access_requests where id = %s", [sam_request]) == [{"status": "declined", "decline_reason": "The account is not under my link"}])
        check("and Sam is still free", not member("Sam K.")["vip"])

        print("The whole queue")
        fixtures.proof(space, people["Bisi"], "broker", "Opened yesterday")
        fixtures.proof(space, people["Sam K."], "payment", "Paying instead", name="second.png")
        reopen("Manage")
        phone.button("See all 4").click()
        check("the full queue opens", phone.at("/manage/requests"))
        check_count("with everyone in it", phone.button("Approve"), 4)
        phone.shot("4-all-requests")
        # Someone else answers a request first: an admin on another phone.
        local_db.as_person(kay, "select public.approve_request(%s)", [local_db.value("select id from public.access_requests where status = 'pending' order by created_at limit 1")])
        phone.button("Approve").first.click()
        check_visible("a request someone else already answered says so", phone.text("Someone has already answered this request."))
        phone.button("Back to Manage").click()
        phone.at("/manage")

        print("Price and payment")
        phone.button("Price and payment", exact=False).click()
        check("the form opens", phone.at("/manage/setup"))
        check_visible("the join link is built from the web address", phone.text("http://127.0.0.1:8096/gold-desk"))
        check_visible("with no price yet, the page says none is shown", phone.text("No price is shown on your join page."))
        phone.field("Price").fill("abc")
        phone.field("Payment link").fill("paystack.com/pay/gold")
        phone.button("Save").click()
        check_visible("a price that is not a number is caught", phone.text("Type an amount, like 25000."))
        check_visible("and a link without https", phone.text("Start the link with https://"))
        phone.shot("5-setup-problems")
        phone.field("Price").fill("25,000")
        page.get_by_role("radio", name="NGN").click()
        page.get_by_role("radio", name="90 days").first.click()
        check_visible("the form shows what the join page will say", phone.text("₦25,000 for 90 days", exact=False))
        phone.field("One line about your space").fill("London session, every weekday")
        phone.field("Payment details").fill("Bank: Example Bank\nAccount: 0123456789")
        phone.field("Payment link").fill("https://paystack.com/pay/gold")
        phone.field("Broker's name").fill("Exness")
        phone.field("Your broker link").fill("https://one.exness.link/a/gold")
        phone.field("Days of VIP for a broker account").fill("60")
        phone.shot("6-setup-filled")
        phone.button("Save").click()
        check("saving returns to Manage", phone.at("/manage"))
        saved = local_db.rows("select tagline, vip_price_cents, vip_currency, vip_days, broker_name from public.spaces where id = %s", [space])[0]
        check("the price, money, length, line and broker are in the database", saved == {"tagline": "London session, every weekday", "vip_price_cents": 2500000, "vip_currency": "NGN", "vip_days": 90, "broker_name": "Exness"})
        kept = local_db.rows("select payment_link, payment_instructions, broker_link, broker_vip_days from public.space_settings where space_id = %s", [space])[0]
        check("and so is how to pay", kept == {"payment_link": "https://paystack.com/pay/gold", "payment_instructions": "Bank: Example Bank\nAccount: 0123456789", "broker_link": "https://one.exness.link/a/gold", "broker_vip_days": 60})
        phone.button("Price and payment", exact=False).click()
        check("opening the form again shows what was saved", phone.field("Price").input_value() == "25000" and phone.field("Days of VIP for a broker account").input_value() == "60")
        phone.button("Back to Manage").click()
        phone.at("/manage")

        print("Invite codes")
        phone.button("Invite codes", exact=False).click()
        check("the codes screen opens", phone.at("/manage/codes"))
        page.get_by_role("radio", name="7 days").click()
        phone.field("How many people can use it").fill("five")
        phone.button("Make a code").click()
        check_visible("a limit that is not a number is caught", phone.text("Type a number, or leave it empty for no limit."))
        phone.field("How many people can use it").fill("5")
        phone.button("Make a code").click()
        check_visible("a new code appears, unused", phone.text("7 days of VIP · Used 0 of 5"))
        made = local_db.rows("select code, days, max_uses, revoked from public.invite_codes where space_id = %s", [space])
        check("it is in the database as asked", len(made) == 1 and made[0]["days"] == 7 and made[0]["max_uses"] == 5)
        check_visible("the code itself is on screen", phone.text(made[0]["code"], exact=True))
        phone.shot("7-codes")
        # A member uses it on the join page.
        local_db.as_person(people["Tobi"], "select public.redeem_invite(%s, %s)", [made[0]["code"], space])
        reopen("Manage")
        phone.button("Invite codes", exact=False).click()
        check_visible("a use shows up", phone.text("7 days of VIP · Used 1 of 5"))
        phone.button("Switch off").click()
        check_visible("a code can be switched off", phone.text("Switched off · Used 1 of 5"))
        check("and is off in the database", local_db.value("select revoked from public.invite_codes where space_id = %s", [space]) is True)
        check("a switched-off code offers nothing more to do", phone.button("Copy").count() == 0)
        phone.button("Back to Manage").click()
        phone.at("/manage")

        print("Members")
        phone.button("Members. Who is VIP and who is expiring").click()
        check("Members opens", phone.at("/manage/members"))
        check_visible("the space's people are counted", phone.text("7 members · 4 VIP · 1 ending soon"))
        rows = page.get_by_role("button").filter(has_text="·").or_(page.get_by_role("button").filter(has_text="VIP")).all_inner_texts()
        names = [text.split("\n")[0] for text in page.locator('[role="button"][aria-label*=". "]').all_inner_texts() if "\n" in text]
        del rows
        check("whoever is about to run out comes first, then VIP, the mentor and free members", names[:1] == ["Zed"] and names.index("Kay") > names.index("Bisi") and names.index("Sam K.") > names.index("Kay"))
        check_visible("someone about to run out is told apart", phone.text("VIP ends in 3 days"))
        check_visible("someone whose VIP ended is shown as free again", phone.text("Free · VIP ended", exact=False))
        phone.shot("8-members")
        phone.field("Find someone").fill("sam")
        check_visible("typing a name finds the person", page.get_by_role("button", name="Sam K.", exact=False))
        page.wait_for_timeout(600)
        check("and hides the rest", page.get_by_role("button", name="Zed", exact=False).count() == 0)

        page.get_by_role("button", name="Sam K.", exact=False).click()
        check("a member opens", phone.at("/manage/member"))
        check_visible("showing where they stand", page.get_by_role("heading", name="Free", exact=True))
        page.get_by_role("radio", name="30 days").click()
        phone.button("Give 30 days of VIP").click()
        check_visible("VIP can be given by hand", page.get_by_role("heading", name="VIP until", exact=False))
        check("and is in the database", member("Sam K.")["vip"])
        phone.shot("9-member")
        phone.button("End VIP now").click()
        check_visible("VIP can be ended", page.get_by_role("heading", name="Free · VIP ended", exact=False))
        check("and is ended in the database", not member("Sam K.")["vip"])
        phone.button("Make admin").click()
        check_visible("the mentor can make an admin", phone.button("Remove as admin"))
        check_count("who is then shown as one", page.get_by_role("heading", name="Admin", exact=True), 2)
        check("in the database too", member("Sam K.")["role"] == "admin")
        phone.button("Remove as admin").click()
        check_visible("and take it back", phone.button("Make admin"))
        phone.button("Remove from the space").click()
        check_visible("a member can be removed", page.get_by_role("heading", name="Removed", exact=True))
        check("which bans them in the database", member("Sam K.")["status"] == "banned")
        check("and leaves nothing else to do but let them back", phone.button("Make admin").count() == 0 and phone.button("Give 30 days of VIP").count() == 0)
        phone.shot("10-removed")
        phone.button("Let them back in").click()
        check_visible("and let back in, as a free member", page.get_by_role("heading", name="Free", exact=True))
        check("active again in the database", member("Sam K.")["status"] == "active")
        phone.button("Back to Members").click()
        phone.at("/manage/members")
        phone.button("Back to Manage").click()
        phone.at("/manage")

        print("The logo")
        phone.button("Space look", exact=False).click()
        check("Space look opens", phone.at("/manage/look"))
        check_visible("a space with no logo offers to add one", phone.button("Add logo"))
        logo = OUT / "mentor-logo-source.png"
        logo.write_bytes(fixtures.picture("GD", colour="#b8860b", size=(900, 600)))
        with page.expect_file_chooser() as chooser:
            phone.button("Add logo").click()
        chooser.value.set_files(str(logo))
        check_visible("the picked picture is shown before saving", phone.button("Change logo"))
        check("nothing is uploaded before saving", local_supabase.files.keys().isdisjoint({key for key in local_supabase.files if key[0] == "logos"}))
        phone.shot("11-logo-picked")
        phone.button("Save look").click()
        check("saving returns to Manage", phone.at("/manage"))
        path = local_db.value("select logo_path from public.spaces where id = %s", [space])
        check("the logo's place is saved, inside the space's own folder", bool(path) and path.startswith(space + "/") and path.endswith(".jpg"))
        stored = local_supabase.files.get(("logos", path or ""))
        check("the file is in the logos store, as a JPEG", bool(stored) and stored[1] == "image/jpeg")
        if stored:
            import io

            from PIL import Image

            size = Image.open(io.BytesIO(stored[0])).size
            check("cropped to a square and no bigger than 512 across", size[0] == size[1] and size[0] <= 512)
        page.wait_for_timeout(500)
        check("the header shows the logo", page.evaluate("Array.from(document.images).some((image) => image.src.includes('/object/public/logos/') && image.naturalWidth > 0)"))
        phone.shot("12-logo-saved")

        phone.close()

    server.shutdown()
    backend.shutdown()
    finish(problems)


if __name__ == "__main__":
    main()
