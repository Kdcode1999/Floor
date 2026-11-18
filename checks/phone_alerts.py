"""Walks alerts: who is told when the mentor posts, and each member's own switches.

A phone gets its address for alerts from Apple or Google, which a browser cannot do, so here
each person's address is put in the database directly. Everything after that is real: the
mentor posts in the app, the database queues the alert, the app nudges Floor's server, and the
server sends through a stand-in for the notification service that keeps what it was sent.

Runs on the local backend and the web app's server routes. `checks/README.md` says how to build
both apps first. From `mobile/`:

    python ../checks/phone_alerts.py

Pictures land in `checks/out/`, named `alerts-*`. The script exits with an error if a check fails.
"""

from playwright.sync_api import sync_playwright

import fake_push
import fixtures
import local_db
import local_services
from common import MOBILE, Phone, check, check_soon, check_ticked, check_visible, clear_pictures, finish, serve

DIST = MOBILE / "dist-stand-in"
PORT = 8094
BASE = f"http://127.0.0.1:{PORT}"
EXPECTED_NOISE = ("Failed to load resource",)

KAY, TOBI, VEE, FREE, GONE = (
    "ExponentPushToken[kay]",
    "ExponentPushToken[tobi]",
    "ExponentPushToken[vee]",
    "ExponentPushToken[free]",
    "ExponentPushToken[gone-phone]",
)


def main() -> None:
    services = local_services.start()
    server = serve(DIST, PORT)
    clear_pictures("alerts-")

    kay = fixtures.person("kay@example.com", "Kay")
    space = fixtures.space(kay, "Gold Desk", "gold-desk")
    people = {}
    for email, name, days in [("tobi@example.com", "Tobi", None), ("vee@example.com", "Vee", 30), ("free@example.com", "Free", None), ("old@example.com", "Old", 30)]:
        people[name] = fixtures.person(email, name)
        fixtures.join(people[name], "gold-desk")
        if days:
            fixtures.vip(space, people[name], days)
    local_db.as_person(kay, "select public.set_member_role(%s, %s, 'admin')", [space, people["Tobi"]])
    for person, address in [(kay, KAY), (people["Tobi"], TOBI), (people["Vee"], VEE), (people["Free"], FREE), (people["Old"], GONE)]:
        local_db.as_person(person, "select public.save_push_token(%s, 'android')", [address])

    def post_setup(phone: Phone, pair: str, everyone: bool = False) -> None:
        page = phone.page
        page.goto(BASE + "/", wait_until="networkidle")
        page.get_by_role("tab", name="Manage").click()
        phone.button("New post").click()
        phone.at("/compose")
        page.get_by_role("radio", name="Trade setup", exact=True).click()
        if everyone:
            page.get_by_role("radio", name="Everyone").click()
        phone.field("Pair").fill(pair)
        page.get_by_role("radio", name="Buy").click()
        phone.field("Entry").fill("100")
        phone.field("Stop").fill("90")
        phone.field("Target 1").fill("120")
        phone.button("Post").click()
        phone.at("/")

    problems: list[str] = []
    try:
        with sync_playwright() as p:
            mentor = Phone(p, BASE, "alerts-mentor-", problems, ignore=EXPECTED_NOISE)
            mentor.sign_in("kay@example.com")

            print("A VIP setup")
            post_setup(mentor, "EURUSD")
            check_soon("the alert goes out as soon as the setup is posted", lambda: len(fake_push.to(VEE)) == 1)
            first = (fake_push.to(VEE) or [{}])[0]
            check("it names the space and says what is new", (first.get("title"), first.get("body")) == ("Gold Desk", "New setup: EURUSD · Buy"))
            check("it carries what a tap needs to open the right screen", first.get("data", {}).get("type") == "setup" and first.get("data", {}).get("space") == space)
            check("it arrives on the alerts channel, with sound", (first.get("channelId"), first.get("sound")) == ("alerts", "default"))
            check("an admin is told too", len(fake_push.to(TOBI)) == 1)
            check("the mentor, who posted it, is not", fake_push.to(KAY) == [])
            check("a free member is not told about a setup they cannot open", fake_push.to(FREE) == [])
            check_soon("a phone that no longer has the app is forgotten", lambda: local_db.value("select count(*) from public.push_tokens where token = %s", [GONE]) == 0)
            check_soon("the job is finished, with a later check on delivery queued", lambda: local_db.rows("select kind, done_at is not null as done from private.outbox order by id") == [{"kind": "alert", "done": True}, {"kind": "push_receipts", "done": False}])

            print("A setup for everyone")
            post_setup(mentor, "XAUUSD", everyone=True)
            check_soon("a free member is told about a setup that is open to them", lambda: [message["body"] for message in fake_push.to(FREE)] == ["New setup: XAUUSD · Buy"])
            check("and so is the VIP member", len(fake_push.to(VEE)) == 2)

            print("A member's own switches")
            member = Phone(p, BASE, "alerts-vip-", problems, ignore=EXPECTED_NOISE)
            page = member.page
            member.sign_in("vee@example.com")
            page.get_by_role("button", name="Account. You are: VIP").click()
            member.at("/account")
            member.button("Alerts").click()
            check("the Alerts screen opens", member.at("/alerts"))
            check_visible("it says where this phone stands", member.text("Alerts are not available in this copy of the app."))
            setups = page.get_by_role("checkbox", name="New trade setups")
            check_ticked("every kind of alert starts switched on", setups)
            member.shot("1-alerts")
            setups.click()
            check_ticked("a kind can be switched off", setups, ticked=False)
            check_soon("which is saved", lambda: local_db.value("select alert_setups from public.memberships where user_id = %s", [people["Vee"]]) is False)
            check("signing in on this phone replaced the address it had before", local_db.value("select count(*) from public.push_tokens where user_id = %s", [people["Vee"]]) == 1)

            post_setup(mentor, "GBPJPY")
            check_soon("the next setup still reaches the admin", lambda: len(fake_push.to(TOBI)) == 3)
            check("but not the member who switched setups off", len(fake_push.to(VEE)) == 2)

            print("Signing out")
            page.goto(BASE + "/", wait_until="networkidle")
            page.get_by_role("button", name="Account. You are: VIP").click()
            member.at("/account")
            member.button("Sign out").click()
            check_visible("the member is signed out", member.field("Email"))
            check_soon("and their phone will get no more alerts", lambda: local_db.value("select count(*) from public.push_tokens where user_id = %s", [people["Vee"]]) == 0)

            mentor.close()
            member.close()
    finally:
        server.shutdown()
        services.stop()
    finish(problems)


if __name__ == "__main__":
    main()
