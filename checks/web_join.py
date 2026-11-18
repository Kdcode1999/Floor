"""Walks a space's join page on the web from start to finish, checks what should be true at each
step, and saves a picture of every screen.

The web app is built against the stand-in for Supabase (stand_in.py), so the whole path can be
walked without a real project: the link preview, signing in, joining, an invite code, sending
proof of payment, approval, a declined proof, the mentor's own view, and a banned member.

Needs Python with Playwright and Google Chrome. From `web/` (bash shown):

    NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8095 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=stand-in \\
      NEXT_PUBLIC_SITE_URL=http://127.0.0.1:8096 npx next build
    python ../checks/web_join.py

Pictures land in `checks/out/`, named `web-*`. The script exits with an error if a check fails.
"""

import pathlib
import subprocess
import tempfile
import time
import urllib.request

from playwright.sync_api import sync_playwright

import stand_in
from common import OUT, WEB, check, check_visible, clear_pictures, finish, open_phone
from stand_in import THE_CODE, USER_ID, days_from_now, seen, space, world

PORT = 8096
BASE = f"http://127.0.0.1:{PORT}"
BACKGROUND = {"night": "rgb(9, 10, 18)", "dawn": "rgb(242, 240, 247)", "smoke": "rgb(13, 13, 15)"}
EXPECTED_NOISE = ("Failed to load resource",)

# The smallest PNG there is: one clear pixel. Stands in for a payment screenshot.
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c6360000002000001e221bc330000000049454e44ae426082"
)


def answering() -> bool:
    try:
        urllib.request.urlopen(BASE + "/", timeout=1)
        return True
    except Exception:
        return False


def start_web() -> subprocess.Popen:
    if not (WEB / ".next" / "BUILD_ID").is_file():
        raise SystemExit("No web build. See the top of this script for the command that makes it.")
    if answering():
        raise SystemExit(f"Something is already answering on port {PORT}. Stop it first: it may be an old build.")
    # Run Next itself, not through npx, so stopping this process stops the server.
    server = subprocess.Popen(
        ["node", "node_modules/next/dist/bin/next", "start", "-p", str(PORT)],
        cwd=WEB,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(60):
        if answering():
            return server
        time.sleep(0.5)
    server.terminate()
    raise SystemExit("The web app did not start.")


def main() -> None:
    backend = stand_in.start(8095)
    space(
        "space-1",
        "Kings FX Academy",
        theme="dawn",
        slug="kings-fx",
        tagline="London session, every weekday.",
        vip_price_cents=2_500_000,
        vip_currency="NGN",
        broker_name="Acme Markets",
    )
    world["settings"]["space-1"] = {
        "payment_link": "https://pay.example/kings",
        "payment_instructions": "Bank: Example Bank\nAccount: 0123456789\nName: Kings FX",
        "broker_link": "https://broker.example/open?ref=kings",
        "broker_vip_days": 60,
    }
    world["preview"]["kings-fx"] = [
        {"kind": "setup", "locked": True, "title": None, "pair": "EURUSD", "snippet": None, "created_at": stand_in.days_from_now(-0.1)},
        {"kind": "post", "locked": False, "title": "Why I skipped gold today", "pair": None, "snippet": "The spread was too wide before the news.", "created_at": stand_in.days_from_now(-1.2)},
    ]
    world["invites"]["GOLD2026"] = {"space_id": "space-1", "days": 14}
    space("space-2", "Other Room", slug="other-room")
    world["invites"]["OTHER123"] = {"space_id": "space-2", "days": 30}

    web = start_web()
    clear_pictures("web-")
    proof = pathlib.Path(tempfile.mkdtemp()) / "My Receipt.png"
    proof.write_bytes(PNG)

    problems: list[str] = []
    try:
        with sync_playwright() as p:
            browser, page = open_phone(p, problems, ignore=EXPECTED_NOISE)

            def shot(name: str) -> None:
                page.wait_for_timeout(400)
                page.screenshot(path=str(OUT / f"web-{name}.png"), full_page=True)

            def button(name: str):
                return page.get_by_role("button", name=name, exact=True)

            def field(label: str):
                return page.get_by_label(label, exact=True)

            def look() -> str:
                return page.evaluate("getComputedStyle(document.querySelector('.space')).backgroundColor")

            print("A link that leads nowhere")
            page.goto(BASE + "/no-such-space", wait_until="networkidle")
            check_visible("says the space is not available", page.get_by_text("This space isn't available"))

            print("The join page, before signing in")
            page.goto(BASE + "/kings-fx", wait_until="networkidle")
            check_visible("shows the space's name", page.get_by_role("heading", name="Kings FX Academy", exact=True))
            check_visible("and its tagline", page.get_by_text("London session, every weekday."))
            check_visible("and its price", page.get_by_text("25,000 for 30 days"))
            check("in the space's own theme", look() == BACKGROUND["dawn"])
            check("a shared link carries the space's name", page.title() == "Kings FX Academy · Floor")
            preview = page.locator('meta[property="og:title"]').get_attribute("content")
            check("and a preview for chat apps", preview == "Kings FX Academy on Floor")
            check("how to pay is not shown to a visitor", page.get_by_text("0123456789").count() == 0)
            check_visible("the newest posts are previewed", page.get_by_role("heading", name="Latest in Kings FX Academy"))
            check_visible("a free post with its opening words", page.get_by_text("The spread was too wide before the news."))
            check_visible("a VIP setup as locked, by its pair alone", page.get_by_text("EURUSD setup"))
            check_visible("each marked free or VIP, with its age", page.get_by_text("VIP · 2 hours ago"))
            shot("1-intro")

            print("Signing in")
            button("Join Kings FX Academy").click()
            field("Email").fill("nope")
            button("Send code").click()
            check_visible("a bad address is caught", page.get_by_text("doesn't look right"))
            field("Email").fill("ada@example.com")
            button("Send code").click()
            check_visible("the code step says where the code went", page.get_by_text("ada@example.com"))
            check("the code was sent", seen["codes_sent_to"] == ["ada@example.com"])
            shot("2-code")
            field("Code").fill("000000")
            check_visible("a wrong code is explained", page.get_by_text("wrong or has run out"))
            field("Code").fill(THE_CODE)

            print("Joining")
            check_visible("the right code joins them and asks their name", page.get_by_text("What should we call you?"))
            check("they joined this space, once", seen["joins"] == ["kings-fx"])
            shot("3-name")
            field("Your name").fill("Admin")
            button("Continue").click()
            check_visible("a name kept for staff is refused", page.get_by_text("The mentor and admins get a badge instead.", exact=False))
            field("Your name").fill("Ada O.")
            button("Continue").click()
            check_visible("with a name they are in, as a free member", page.get_by_text("Free member"))
            check("the name was saved", world["display_name"] == "Ada O.")
            check_visible("now they see how to pay", page.get_by_text("0123456789"))
            check_visible("and the broker offer, with its days", page.get_by_text("60 days of VIP"))
            check_visible("and who the broker is", page.get_by_text("Acme Markets"))
            check_visible("and are told which email to use in the app", page.get_by_text("sign in with ada@example.com"))
            shot("4-member")

            print("Invite code")
            field("Invite code").fill("other123")
            button("Use code").click()
            check_visible("another space's code does not work here", page.get_by_text("That code doesn't work"))
            check("and joined them nowhere else", all(row["space_id"] == "space-1" for row in world["memberships"]))
            field("Invite code").fill("gold2026")
            button("Use code").click()
            check_visible("this space's code gives VIP at once", page.get_by_text("You're VIP until"))
            shot("5-vip")

            print("Proof of payment")
            page.locator("#proof-payment").set_input_files(str(proof))
            page.locator("#note-payment").fill("Paid by transfer, name Ada O.")
            page.locator("form").filter(has=page.locator("#proof-payment")).get_by_role("button", name="Send for approval").click()
            check_visible("a sent proof shows as waiting", page.get_by_text("Waiting for Kings FX Academy to check it."))
            check("the file went under their own folder in the space", len(seen["uploads"]) == 1 and seen["uploads"][0].startswith(f"space-1/{USER_ID}/") and seen["uploads"][0].endswith("-my-receipt.png"))
            sent = seen["requests_sent"]
            check("the request names the file, the kind and the note", len(sent) == 1 and (sent[0]["p_kind"], sent[0]["p_proof_path"], sent[0]["p_note"]) == ("payment", seen["uploads"][0], "Paid by transfer, name Ada O."))
            check("a second proof cannot be sent while one waits", page.locator("#proof-payment").count() == 0)
            shot("6-waiting")

            print("The mentor answers")
            world["requests"][0]["status"] = "declined"
            world["requests"][0]["decline_reason"] = "The screenshot is cut off"
            page.goto(BASE + "/kings-fx", wait_until="networkidle")
            check_visible("a declined proof says why", page.get_by_text("The screenshot is cut off"))
            check("and can be sent again", page.locator("#proof-payment").count() == 1)
            check_visible("coming back needs no second sign-in", page.get_by_text("You're VIP until"))
            shot("7-declined")

            print("The mentor's own view")
            world["memberships"][0]["role"] = "mentor"
            page.goto(BASE + "/kings-fx", wait_until="networkidle")
            check_visible("the mentor sees their link to share", page.get_by_text("http://127.0.0.1:8096/kings-fx"))
            shot("8-mentor")

            print("A banned member")
            world["memberships"][0].update(role="member", status="banned")
            page.goto(BASE + "/kings-fx", wait_until="networkidle")
            check_visible("is told they cannot join", page.get_by_text("You can't join this space"))
            button("Sign out").click()
            check_visible("signing out goes back to the start", button("Join Kings FX Academy"))

            browser.close()
    finally:
        web.terminate()
        web.wait(timeout=10)
        backend.shutdown()
    finish(problems)


if __name__ == "__main__":
    main()
