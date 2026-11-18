"""Walks getting VIP inside the phone app: a free member reads the mentor's price and how to pay,
sends a screenshot of the transfer as proof, finds it waiting, has a declined one explained, and
uses an invite code that turns VIP on at once.

Runs on the local backend (local_supabase.py): a real Postgres with Floor's migrations, so the
rules met are the real ones, and each step is checked in the database too.

Needs Python with Playwright, psycopg and Pillow, Google Chrome, and PostgreSQL installed.
From `mobile/` (bash shown; the values only matter while building):

    EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:8095 EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=stand-in \\
      EXPO_PUBLIC_SITE_URL=http://127.0.0.1:8096 npx expo export --platform web --output-dir dist-stand-in
    python ../checks/phone_vip.py

Pictures land in `checks/out/`, named `vip-*`. The script exits with an error if a check fails.
"""

import re
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

import fixtures
import local_db
import local_supabase
from common import MOBILE, Phone, check, check_gone, check_visible, clear_pictures, finish, serve

DIST = MOBILE / "dist-stand-in"
PORT = 8094
BASE = f"http://127.0.0.1:{PORT}"

# Refusals are part of the walk, and the browser logs each one.
EXPECTED_NOISE = ("Failed to load resource",)


def main() -> None:
    backend = local_supabase.start(8095)
    server = serve(DIST, PORT)
    clear_pictures("vip-")

    kay = fixtures.person("kay@example.com", "Kay")
    space = fixtures.space(kay, "Gold Desk", "gold-desk")
    zed = fixtures.person("zed@example.com", "Zed")
    fixtures.join(zed, "gold-desk")
    local_db.run("update public.spaces set vip_price_cents = 2500000, vip_currency = 'NGN', vip_days = 30, broker_name = 'Exness' where id = %s", [space])
    local_db.run(
        "update public.space_settings set payment_instructions = %s, broker_link = 'https://one.exness.link/a/gold', broker_vip_days = 60 where space_id = %s",
        ["Bank: Example Bank\nAccount: 0123456789\nUSDT (TRC20): TExampleAddress", space],
    )
    local_db.run("insert into public.invite_codes (space_id, code, days, created_by) values (%s, 'GOLD14', 14, %s)", [space, kay])
    # An earlier broker proof the mentor turned down.
    declined = fixtures.proof(space, zed, "broker", "Account 1234", name="old.png")
    local_db.run("update public.access_requests set status = 'declined', decline_reason = 'That account was not opened through my link' where id = %s", [declined])

    def requests(kind: str) -> list[dict]:
        return local_db.rows("select * from public.access_requests where space_id = %s and user_id = %s and kind = %s order by created_at", [space, zed, kind])

    problems: list[str] = []
    shot = tempfile.mkdtemp()
    with sync_playwright() as p:
        phone = Phone(p, BASE, "vip-", problems, ignore=EXPECTED_NOISE)
        page = phone.page

        print("Finding the way to VIP")
        phone.sign_in("zed@example.com")
        page.get_by_role("button", name=re.compile("^Account\\. You are: ")).click()
        phone.button("Get VIP").click()
        check("Get VIP opens from the Account screen", phone.at("/vip"))
        check_visible("it says what VIP opens", phone.text("VIP opens every setup and post", exact=False))
        check_visible("and the mentor's price", phone.text("₦25,000 for 30 days"))
        check_visible("and how to pay them", phone.text("USDT (TRC20): TExampleAddress", exact=False))
        check_visible("that they are paid directly", phone.text("Floor never holds your money", exact=False))
        check_visible("a broker proof that was turned down is explained", phone.text("Your last one was not accepted: That account was not opened through my link", exact=False))
        phone.shot("1-ways-in")

        print("Sending proof of a transfer")
        phone.button("Send for approval", exact=True).first.click()
        check_visible("a proof is needed first", phone.text("Choose a screenshot or photo first."))
        receipt = Path(shot) / "transfer.png"
        receipt.write_bytes(fixtures.picture("Transfer 25,000", size=(900, 1600)))
        with page.expect_file_chooser() as chooser:
            phone.button("Choose a screenshot of the payment").click()
        chooser.value.set_files(str(receipt))
        check_visible("the chosen screenshot is shown", page.get_by_role("img", name="The proof you chose"))
        phone.field("Note for your mentor").fill("Transfer from Zed, 25,000")
        phone.button("Send for approval", exact=True).first.click()
        check_visible("it is sent and waiting", phone.text("Waiting for Gold Desk to check it", exact=False), 8)
        sent = requests("payment")
        check("the request is in the mentor's queue", len(sent) == 1 and sent[0]["status"] == "pending" and sent[0]["note"] == "Transfer from Zed, 25,000")
        path = sent[0]["proof_path"] if sent else ""
        check("its proof is in the member's own folder", path.startswith(f"{space}/{zed}/"))
        stored = local_supabase.files.get(("proofs", path))
        check("as a JPEG picture", bool(stored) and stored[1] == "image/jpeg")
        phone.shot("2-sent")

        print("An invite code")
        phone.field("Invite code").fill("nope1")
        phone.button("Use code").click()
        check_visible("a wrong code is refused", phone.text("That code doesn't work. Check it with your mentor."))
        phone.field("Invite code").fill("gold14")
        phone.button("Use code").click()
        check_visible("the right one turns VIP on", phone.text("The code worked. Your VIP is on."), 8)
        vip = local_db.value("select vip_until > now() + interval '13 days' from public.memberships where space_id = %s and user_id = %s", [space, zed])
        check("for the code's 14 days", vip is True)
        check_visible("the screen says so", phone.text("You're VIP until", exact=False), 10)
        phone.shot("3-vip")
        phone.button("Back").click()
        check_visible("the Account screen offers more VIP time", phone.button("Add more VIP time"), 10)
        page.goto(BASE + "/", wait_until="networkidle")
        check_visible("and the badge says VIP", phone.button("Account. You are: VIP"), 10)
        check_gone("a mentor's code is not offered to the mentor", phone.text("Have an invite code?"))
        phone.close()

        print("The mentor")
        mentor = Phone(p, BASE, "vip-mentor-", problems, ignore=EXPECTED_NOISE)
        mentor.sign_in("kay@example.com")
        mentor.page.goto(BASE + "/vip", wait_until="networkidle")
        check("the mentor has no Get VIP screen", mentor.page.url.rstrip("/") == BASE)
        mentor.close()

    server.shutdown()
    backend.shutdown()
    finish(problems)


if __name__ == "__main__":
    main()
