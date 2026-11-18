"""Walks card payments from end to end.

The mentor connects their own card processor on the laptop page. Members then pay on the join
page, on the processor's page, and get VIP by themselves. The walk also covers what happens
when things do not go to plan: a wrong key, a member who backs out, one who pays and never
comes back, a forged webhook, and a payment of less than the price.

Runs on the local backend (a real Postgres with Floor's migrations), the web app's own server
routes, and stand-ins for both card processors that hold Floor to the processors' own rules.
The last part opens the phone app as the mentor, to see the payments there.

Build both apps first: `checks/README.md` has the commands. Then, from `web/`:

    python ../checks/web_pay.py

Pictures land in `checks/out/`, named `pay-*`. The script exits with an error if a check fails.
"""

import urllib.request

from playwright.sync_api import sync_playwright

import fake_processors
import fake_push
import fixtures
import local_db
import local_services
import local_supabase
from common import MOBILE, OUT, Phone, check, check_gone, check_soon, check_visible, clear_pictures, finish, open_phone, serve

BASE = local_services.WEB
PHONE_PORT = 8094
PHONE = f"http://127.0.0.1:{PHONE_PORT}"
PAY = f"http://127.0.0.1:{local_services.PAY_PORT}"
EXPECTED_NOISE = ("Failed to load resource",)

PAYSTACK_KEY = fake_processors.KEYS["paystack"]
FLUTTERWAVE_KEY = fake_processors.KEYS["flutterwave"]
KAY_PHONE, TOBI_PHONE = "ExponentPushToken[kay]", "ExponentPushToken[tobi]"


def main() -> None:
    services = local_services.start()
    phone_server = serve(MOBILE / "dist-stand-in", PHONE_PORT)
    clear_pictures("pay-")

    kay = fixtures.person("kay@example.com", "Kay")
    space = fixtures.space(kay, "Gold Desk", "gold-desk")
    people = {}
    for name in ["Tobi", "Ada", "Bola", "Cee", "Dan", "Eve"]:
        people[name] = fixtures.person(f"{name.lower()}@example.com", "Ada O." if name == "Ada" else name)
        fixtures.join(people[name], "gold-desk")
    local_db.as_person(kay, "select public.set_member_role(%s, %s, 'admin')", [space, people["Tobi"]])
    local_db.as_person(kay, "select public.save_push_token(%s, 'android')", [KAY_PHONE])
    local_db.as_person(people["Tobi"], "select public.save_push_token(%s, 'android')", [TOBI_PHONE])

    def vip_days(name: str) -> float | None:
        """How many days of VIP the member has left, or None."""
        left = local_db.value(
            "select extract(epoch from vip_until - now()) / 86400 from public.memberships where space_id = %s and user_id = %s",
            [space, people[name]],
        )
        return None if left is None else float(left)

    def about(days: float | None, expected: float) -> bool:
        return days is not None and abs(days - expected) < 0.01

    def payments(name: str) -> list[dict]:
        return local_db.rows("select reference, status, provider, amount_cents, currency, days from public.payments where user_id = %s order by created_at", [people[name]])

    hook = {name: f"{BASE}/api/pay/hook/{name}/{space}" for name in ("paystack", "flutterwave")}
    problems: list[str] = []
    try:
        with sync_playwright() as p:
            # ------------------------------------------------------------------ the mentor connects
            laptop_browser, laptop = open_phone(p, problems, ignore=EXPECTED_NOISE, laptop=True)

            def shot(page, name: str) -> None:
                page.wait_for_timeout(400)
                page.screenshot(path=str(OUT / f"pay-{name}.png"), full_page=True)

            def sign_in(page, email: str) -> None:
                page.get_by_label("Email", exact=True).fill(email)
                page.get_by_role("button", name="Send code", exact=True).click()
                page.get_by_label("Code", exact=True).fill(local_supabase.THE_CODE)

            def connect(key: str, word: str | None = None) -> None:
                laptop.get_by_label("Secret key", exact=True).fill(key)
                if word is not None:
                    laptop.get_by_label("Secret hash (optional)", exact=True).fill(word)
                laptop.get_by_role("button", name="Connect", exact=False).click()

            print("An admin has no way to connect a processor")
            laptop.goto(BASE + "/mentor", wait_until="networkidle")
            sign_in(laptop, "tobi@example.com")
            check_visible("the admin lands in the space", laptop.get_by_role("heading", name="Gold Desk"))
            check_gone("with no Card payments tool", laptop.get_by_role("tab", name="Card payments"))
            laptop.get_by_role("button", name="Sign out", exact=True).click()

            print("The mentor connects Paystack")
            sign_in(laptop, "kay@example.com")
            laptop.get_by_role("tab", name="Card payments").click()
            check_visible("the mentor is offered card payments", laptop.get_by_role("heading", name="Take card payments"))
            shot(laptop, "1-connect")

            connect("hello")
            check_visible("something that is not a key is turned away", laptop.get_by_text("That does not look like a Paystack secret key", exact=False))
            connect(fake_processors.made_up_key("paystack", "floorchecks00000000000000000001", test=True))
            check_visible("a test key is turned away, with the reason", laptop.get_by_text("That is a test key", exact=False))
            connect(fake_processors.made_up_key("paystack", "notthekey0000000000000000000000"))
            check_visible("a key Paystack refuses is turned away", laptop.get_by_text("Paystack did not accept that key", exact=False))
            check("nothing was stored for any of them", local_db.value("select count(*) from private.payment_accounts") == 0)

            connect(PAYSTACK_KEY)
            check_visible("the right key connects", laptop.get_by_role("heading", name="Paystack · key ending 0001"))
            check_visible("the mentor is told a price is still missing", laptop.get_by_text("Members cannot pay by card yet. Your space has no VIP price yet", exact=False))
            stored = local_db.rows("select provider, secret_cipher, key_hint from private.payment_accounts where space_id = %s", [space])
            check("the key is stored encrypted, never as typed", len(stored) == 1 and stored[0]["secret_cipher"].startswith("v1.") and PAYSTACK_KEY not in stored[0]["secret_cipher"] and "floorchecks" not in stored[0]["secret_cipher"])
            check("the page no longer holds the key", PAYSTACK_KEY not in laptop.content())
            check("the space now says it takes cards", local_db.value("select card_provider from public.spaces where id = %s", [space]) == "paystack")
            check_visible("the mentor is shown the webhook address for their dashboard", laptop.get_by_text(hook["paystack"], exact=True))
            check("Floor tried the key by asking about a payment that does not exist", ("paystack", "GET", "/transaction/verify/floor-key-check") in fake_processors.calls)

            # The mentor sets a price in the app. Here it is set the same way the app does it.
            local_db.as_person(kay, "update public.spaces set vip_price_cents = 2500000, vip_currency = 'USDT', vip_days = 30 where id = %s returning id", [space])
            laptop.reload(wait_until="networkidle")
            laptop.get_by_role("tab", name="Card payments").click()
            check_visible("a price in USDT cannot go on a card, and the mentor is told", laptop.get_by_text("Your price is in USDT, which Paystack cannot charge", exact=False))
            local_db.as_person(kay, "update public.spaces set vip_currency = 'NGN' where id = %s returning id", [space])
            laptop.reload(wait_until="networkidle")
            laptop.get_by_role("tab", name="Card payments").click()
            check_visible("with a price in naira, members can pay", laptop.get_by_text("Members can pay ₦25,000 by card on your join page", exact=False))
            shot(laptop, "2-connected")

            # ------------------------------------------------------------------ a member pays
            def member(email: str):
                """Opens the join page on a member's own phone and signs them in."""
                browser, page = open_phone(p, problems, ignore=EXPECTED_NOISE)
                page.goto(BASE + "/gold-desk", wait_until="networkidle")
                page.get_by_role("button", name="Join Gold Desk", exact=True).click()
                sign_in(page, email)
                page.get_by_role("heading", name="Pay by card").wait_for(timeout=8000)
                return browser, page

            def to_checkout(page, provider: str) -> str:
                """Presses Pay and waits for the processor's page. Returns Floor's name for the payment."""
                page.get_by_role("button", name="Pay ₦25,000", exact=True).click()
                page.wait_for_url(lambda url: url.startswith(f"{PAY}/{provider}/checkout/"), timeout=8000)
                return page.url.rsplit("/", 1)[1]

            print("A member backs out, then pays")
            ada_browser, ada = member("ada@example.com")
            check_visible("the join page offers to pay by card, with the price", ada.get_by_text("₦25,000 for 30 days", exact=True))
            check_visible("and says who is paid and who sees the email", ada.get_by_text("You pay Gold Desk on Paystack's page", exact=False))
            shot(ada, "3-join-page")

            first = to_checkout(ada, "paystack")
            check_visible("Paystack's page asks for the price, to the kobo", ada.get_by_role("heading", name="Pay NGN 25,000.00"))
            check_visible("and knows who is paying", ada.get_by_text("ada@example.com", exact=True))
            shot(ada, "4-checkout")
            ada.get_by_role("button", name="Cancel payment").click()
            ada.wait_for_url(BASE + "/gold-desk", timeout=8000)
            check_visible("backing out returns to the join page, still a free member", ada.get_by_role("heading", name="You're in"))
            check("and nothing was given", payments("Ada") == [{"reference": first, "status": "started", "provider": "paystack", "amount_cents": 2500000, "currency": "NGN", "days": 30}] and vip_days("Ada") is None)

            second = to_checkout(ada, "paystack")
            check("a second try is a new payment", second != first)
            ada.get_by_role("button", name="Pay NGN 25,000.00").click()
            check_visible("back on the join page, the payment is confirmed", ada.get_by_role("heading", name="Payment received"))
            check_visible("and the member is VIP at once, with nothing for the mentor to approve", ada.get_by_role("heading", name="You're VIP until", exact=False))
            check("for the 30 days they paid for", about(vip_days("Ada"), 30))
            check("the payment's name is gone from the address bar", ada.url == BASE + "/gold-desk")
            check("the payment is recorded as paid", [row["status"] for row in payments("Ada")] == ["started", "paid"])
            shot(ada, "5-paid")

            check_soon("the mentor's phone is told that money came in", lambda: [m["body"] for m in fake_push.to(KAY_PHONE)] == ["Ada O. paid by card. 30 days of VIP added."])
            check("the admin's is not", fake_push.to(TOBI_PHONE) == [])

            ada.reload(wait_until="networkidle")
            check_gone("opening the page again does not repeat the notice", ada.get_by_role("heading", name="Payment received"))
            check_visible("the member can add more time", ada.get_by_role("heading", name="Add more VIP time"))
            ada_browser.close()

            # ------------------------------------------------------------------ pays and never comes back
            print("A member pays and closes the page: the webhook")
            bola_browser, bola = member("bola@example.com")
            reference = to_checkout(bola, "paystack")
            fake_processors.pay(reference)
            bola_browser.close()
            check("with no word from anyone, the member is not VIP yet", vip_days("Bola") is None)
            check("a webhook signed by somebody else is refused", fake_processors.send_hook(reference, hook["paystack"], forged=True) == 401)
            check("and gives nothing", vip_days("Bola") is None)
            check("Paystack's own webhook is accepted", fake_processors.send_hook(reference, hook["paystack"]) == 200)
            check("and the member is VIP", about(vip_days("Bola"), 30))
            check("the same webhook a second time is accepted too", fake_processors.send_hook(reference, hook["paystack"]) == 200)
            check("and adds nothing more", about(vip_days("Bola"), 30))
            check("a webhook sent to another space's address is refused", fake_processors.send_hook(reference, f"{BASE}/api/pay/hook/paystack/00000000-0000-4000-8000-000000000000") == 401)

            print("A member pays and closes the page, and no webhook comes: the later check")
            dan_browser, dan = member("dan@example.com")
            reference = to_checkout(dan, "paystack")
            fake_processors.pay(reference)
            dan_browser.close()
            waiting = local_db.rows("select extract(epoch from run_after - now()) / 60 as minutes from private.outbox where kind = 'payment_check' and payload ->> 'reference' = %s", [reference])
            check("a check is queued for ten minutes after the payment was started", len(waiting) == 1 and 9 < float(waiting[0]["minutes"]) <= 10)
            local_db.run("update private.outbox set run_after = now() where kind = 'payment_check' and payload ->> 'reference' = %s", [reference])
            sweep = urllib.request.Request(BASE + "/api/jobs/run", headers={"Authorization": "Bearer local-cron-secret"})
            urllib.request.urlopen(sweep, timeout=60).read()
            check_soon("when its time comes the server asks Paystack, and the member is VIP", lambda: about(vip_days("Dan"), 30))

            # ------------------------------------------------------------------ the key stops working
            print("The mentor's key stops working")
            fake_processors.revoked.add("paystack")
            cee_browser, cee = member("cee@example.com")
            cee.get_by_role("button", name="Pay ₦25,000", exact=True).click()
            check_visible("the member is told card payments are not working, and what to do", cee.get_by_text("Card payments are not working for Gold Desk right now. Use another way to pay, or tell them.", exact=True))
            check("the member is still on the join page", cee.url == BASE + "/gold-desk")
            check_soon("the reason is kept for the mentor", lambda: local_db.value("select last_error from private.payment_accounts where space_id = %s", [space]) == "key_refused")
            check_soon("and the mentor's phone is told", lambda: "A member could not pay by card. Open your mentor page on the web to see why." in [m["body"] for m in fake_push.to(KAY_PHONE)])
            check("still not the admin's", fake_push.to(TOBI_PHONE) == [])
            laptop.reload(wait_until="networkidle")
            laptop.get_by_role("tab", name="Card payments").click()
            check_visible("the mentor's page says what happened and what to do", laptop.get_by_text("Paystack no longer accepts your key, so members cannot pay by card", exact=False))
            shot(laptop, "6-key-refused")
            fake_processors.revoked.clear()

            # ------------------------------------------------------------------ pays less than the price
            print("A payment of less than the price")
            reference = to_checkout(cee, "paystack")
            fake_processors.pay(reference, fraction=0.5)
            cee.goto(f"{BASE}/gold-desk?paid={reference}&trxref={reference}&reference={reference}", wait_until="networkidle")
            check_visible("the member is told it does not match the price", cee.get_by_role("heading", name="The amount paid does not match the price"))
            check("and gets no VIP", vip_days("Cee") is None and payments("Cee")[-1]["status"] == "started")
            shot(cee, "7-mismatch")

            cee.goto(f"{BASE}/gold-desk?paid=fl-{'0' * 32}", wait_until="networkidle")
            check_visible("a made-up payment is not found", cee.get_by_role("heading", name="That payment can't be found"))
            cee_browser.close()

            # ------------------------------------------------------------------ Flutterwave
            print("The mentor moves to Flutterwave")
            laptop.get_by_role("button", name="Disconnect Paystack", exact=True).click()
            check_visible("disconnecting asks first", laptop.get_by_text("Members will no longer be able to pay by card", exact=False))
            laptop.get_by_role("button", name="Disconnect", exact=True).click()
            check_visible("and returns to the offer to connect", laptop.get_by_role("heading", name="Take card payments"))
            check("the key is deleted", local_db.value("select count(*) from private.payment_accounts") == 0)
            check("and the space no longer says it takes cards", local_db.value("select card_provider from public.spaces where id = %s", [space]) is None)
            check_visible("the payments that came in are still listed", laptop.get_by_text("Ada O. · ₦25,000", exact=True))

            laptop.get_by_role("radio", name="Flutterwave").click()
            connect(FLUTTERWAVE_KEY, fake_processors.HOOK_WORD)
            check_visible("Flutterwave connects", laptop.get_by_role("heading", name="Flutterwave · key ending 01-X"))
            check_visible("with its own webhook address", laptop.get_by_text(hook["flutterwave"], exact=True))
            shot(laptop, "8-flutterwave")

            eve_browser, eve = member("eve@example.com")
            check_visible("the join page now names Flutterwave", eve.get_by_text("You pay Gold Desk on Flutterwave's page", exact=False))
            reference = to_checkout(eve, "flutterwave")
            check_visible("Flutterwave's page asks for the price", eve.get_by_role("heading", name="Pay NGN 25,000.00"))
            eve.get_by_role("button", name="Cancel payment").click()
            check_visible("backing out says so, and nothing is given", eve.get_by_role("heading", name="Payment cancelled"))
            check("the member is still free", vip_days("Eve") is None)

            reference = to_checkout(eve, "flutterwave")
            eve.get_by_role("button", name="Pay NGN 25,000.00").click()
            check_visible("paying on Flutterwave's page gives VIP at once", eve.get_by_role("heading", name="Payment received"))
            check("for 30 days", about(vip_days("Eve"), 30))
            check("Floor asked Flutterwave about that very payment, by its id", any(call[0] == "flutterwave" and call[2].endswith("/verify") for call in fake_processors.calls))

            reference = to_checkout(eve, "flutterwave")
            fake_processors.pay(reference)
            eve_browser.close()
            check("a webhook without the mentor's own word is refused", fake_processors.send_hook(reference, hook["flutterwave"], forged=True) == 401)
            check("and adds nothing", about(vip_days("Eve"), 30))
            check("Flutterwave's own webhook is accepted", fake_processors.send_hook(reference, hook["flutterwave"]) == 200)
            check("and the new days are added after the ones the member had", about(vip_days("Eve"), 60))

            old = payments("Cee")[-1]["reference"]
            check("a payment from before the change can no longer be confirmed", fake_processors.send_hook(old, hook["paystack"]) == 401)
            laptop_browser.close()

            # ------------------------------------------------------------------ the mentor's phone
            print("The mentor's phone")
            phone = Phone(p, PHONE, "pay-phone-", problems, ignore=EXPECTED_NOISE)
            phone.sign_in("kay@example.com")
            page = phone.page
            page.get_by_role("tab", name="Manage").click()
            phone.button("Card payments. Who paid by card").click()
            check("the payments screen opens", phone.at("/manage/payments"))
            check_visible("it lists who paid", phone.text("Ada O.", exact=True))
            check("everyone who paid is on it", page.get_by_text("₦25,000", exact=True).count() == 5)
            check_visible("and what each payment gave", phone.text("30 days of VIP, until", exact=False).first)
            check_gone("with no trouble to report", phone.text("could not pay by card", exact=False))
            phone.shot("1-payments")

            # What the mentor sees there after a member could not pay. Set here as the server sets it.
            local_db.run("select public.note_payment_problem(%s, 'Currency not supported by merchant')", [space])
            page.reload(wait_until="networkidle")
            page.get_by_role("tab", name="Manage").click()
            phone.button("Card payments. Who paid by card").click()
            check_visible("the phone says a member could not pay", phone.text("A member could not pay by card", exact=True))
            check_visible("why, in the processor's words, and where to fix it", phone.text("Flutterwave said: “Currency not supported by merchant” Open http://127.0.0.1:8096/mentor in a browser to fix it.", exact=True))
            phone.shot("2-trouble")

            page.goto(PHONE + "/", wait_until="networkidle")
            page.get_by_role("tab", name="Manage").click()
            phone.button("Price and payment. What VIP costs and how members pay you").click()
            phone.at("/manage/setup")
            check_visible("the price screen says card payments are on, and through whom", phone.text("Card payments are on, through Flutterwave", exact=True))
            phone.shot("3-price")
            phone.close()
    finally:
        phone_server.shutdown()
        services.stop()
    finish(problems)


if __name__ == "__main__":
    main()
