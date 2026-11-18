"""Walks Telegram teasers: the mentor connects their Telegram channel, and Floor's bot posts a
notice there when they post in their space.

Telegram is played by a stand-in (fake_telegram.py). It answers Floor's server the way
Telegram does, keeps what the bot posted, and tells the server what the bot saw in the channel.
Everything else is real: the mentor's screen in the app, the code, the database, the queue of
jobs and the server routes.

The walk covers a call that only pretends to be Telegram's, a wrong code and one that was
replaced, the notices for a VIP setup, a post for everyone and a post for VIP, the mentor's
switches, a test, the bot being taken out of the channel and losing the right to post, and
disconnecting.

Runs on the local backend and the web app's server routes. `checks/README.md` says how to build
both apps first. From `mobile/`:

    python ../checks/phone_teasers.py

Pictures land in `checks/out/`, named `teasers-*`. The script exits with an error if a check fails.
"""

import re
import urllib.request

from playwright.sync_api import sync_playwright

import fake_telegram
import fixtures
import local_db
import local_services
from common import MOBILE, Phone, check, check_gone, check_soon, check_ticked, check_visible, clear_pictures, finish, pause, serve

DIST = MOBILE / "dist-stand-in"
PORT = 8094
BASE = f"http://127.0.0.1:{PORT}"
EXPECTED_NOISE = ("Failed to load resource",)

# Telegram gives a channel a long negative number.
CHANNEL = -1001234567890
TITLE = "Kay FX Signals"
JOIN = f"{local_services.WEB}/gold-desk"

# The screen looks again every few seconds. This is how long a check waits for it.
SOON = 12


def main() -> None:
    services = local_services.start()
    server = serve(DIST, PORT)
    clear_pictures("teasers-")

    kay = fixtures.person("kay@example.com", "Kay")
    space = fixtures.space(kay, "Gold Desk", "gold-desk")
    tobi = fixtures.person("tobi@example.com", "Tobi")
    fixtures.join(tobi, "gold-desk")
    local_db.as_person(kay, "select public.set_member_role(%s, %s, 'admin')", [space, tobi])

    def link() -> dict:
        found = local_db.rows("select * from public.telegram_links where space_id = %s", [space])
        return found[0] if found else {}

    def posted() -> list[str]:
        return fake_telegram.texts(CHANNEL)

    def sweep() -> None:
        """Has the server do the jobs that are waiting, as its timer would."""
        request = urllib.request.Request(local_services.WEB + "/api/jobs/run", headers={"Authorization": "Bearer local-cron-secret"})
        urllib.request.urlopen(request, timeout=60).read()

    def write(kind: str, **more) -> None:
        """The mentor posts, without going through the screens again. The server is then asked to do its jobs."""
        values = {"p_space": space, "p_kind": kind, **more}
        names = ", ".join(f"{name} => %s" for name in values)
        local_db.as_person(kay, f"select public.create_post({names})", list(values.values()))
        sweep()

    problems: list[str] = []
    with sync_playwright() as p:
        mentor = Phone(p, BASE, "teasers-", problems, ignore=EXPECTED_NOISE)
        page = mentor.page

        print("The steps to connect a channel")
        mentor.sign_in("kay@example.com")
        page.get_by_role("tab", name="Manage").click()
        page.get_by_role("button", name=re.compile("^Telegram teasers\\. ")).click()
        check("the screen opens from Manage", mentor.at("/manage/telegram"))
        check_visible("it says the bot never posts what is for VIP", mentor.text("It never posts", exact=False))
        check_visible("the first step names Floor's bot", page.get_by_role("heading", name="Add @FloorTeaserBot to your channel"))
        check_soon("a code is made for the space", lambda: bool(link().get("connect_code")))
        code = link().get("connect_code", "")
        check("eight letters and digits that are hard to misread", bool(re.fullmatch(r"[A-HJ-NP-Z2-9]{8}", code)))
        check_visible("the second step is the exact line to post", mentor.text(f"/connect {code}", exact=True))
        check_visible("with how long it works", mentor.text(re.compile(r"The code works for (29|30) more minutes\.")))
        check("Floor told Telegram where to send what the bot sees", fake_telegram.webhook["url"] == local_services.WEB + "/api/telegram/webhook")
        check("with a word only the two of them know", bool(re.fullmatch(r"[0-9a-f]{64}", fake_telegram.webhook["secret"])))
        check("and asked only for what it needs", fake_telegram.webhook["allowed"] == ["message", "channel_post", "my_chat_member"])
        mentor.shot("1-steps")

        print("Someone pretending to be Telegram")
        check("a call without Telegram's word is turned away", fake_telegram.channel_post(CHANNEL, TITLE, f"/connect {code}", secret="not-the-word") == 401)
        check("and one with no word at all", fake_telegram.channel_post(CHANNEL, TITLE, f"/connect {code}", secret="") == 401)
        check("nothing was connected", link().get("chat_id") is None and posted() == [])

        print("A wrong code, and one that was replaced")
        check("Telegram's own call is taken", fake_telegram.channel_post(CHANNEL, TITLE, "/connect WRNG2345") == 200)
        check("the bot says the code is not valid", posted() == ["That code is not valid, or has run out. Get a new one in the Floor app: Manage, then Telegram teasers."])
        check("and nothing is connected", link().get("chat_id") is None)
        mentor.button("Get a new code").click()
        check_soon("the mentor can get a new code", lambda: link().get("connect_code") not in (None, code))
        old, code = code, link().get("connect_code", "")
        check_visible("which the screen shows", mentor.text(f"/connect {code}", exact=True))
        fake_telegram.channel_post(CHANNEL, TITLE, f"/connect {old}")
        check("the old code no longer works", link().get("chat_id") is None and len(posted()) == 2)
        check("someone who writes to the bot directly is told what it is for", fake_telegram.private_message(555, "/start") == 200 and "I announce new setups" in fake_telegram.texts(555)[-1])
        fake_telegram.private_message(555, f"/connect {code}")
        check("and the code does nothing in a private chat", link().get("chat_id") is None and "not here" in fake_telegram.texts(555)[-1])

        print("The mentor posts the code in their channel")
        fake_telegram.sent.clear()
        check("Telegram's call is taken", fake_telegram.channel_post(CHANNEL, TITLE, f"  /connect {code.lower()} ") == 200)
        row = link()
        check("the channel is connected to the space", row.get("chat_id") == CHANNEL and row.get("chat_title") == TITLE and row.get("chat_kind") == "channel")
        check("the code is used up", row.get("connect_code") is None)
        check("the bot says so in the channel, with the join link", posted() == [f"Connected. New setups, posts and lessons from Gold Desk will be announced here.\n\nGold Desk on Floor: {JOIN}"])
        check("and takes the line with the code down", len(fake_telegram.deleted) == 1 and fake_telegram.deleted[0][0] == CHANNEL)
        check_visible("the screen changes by itself", page.get_by_role("heading", name=f"Connected to your channel {TITLE}"), SOON)
        check_visible("nothing has been announced yet", mentor.text("Nothing has been posted there yet"))
        for label in ("New setups", "New posts", "New lessons"):
            check_ticked(f"{label} are announced unless the mentor says otherwise", page.get_by_role("checkbox", name=label))
        mentor.shot("2-connected")

        print("A VIP setup")
        fake_telegram.sent.clear()
        mentor.button("Back to Manage").click()
        mentor.button("New post").click()
        mentor.at("/compose")
        page.get_by_role("radio", name="Trade setup", exact=True).click()
        mentor.field("Pair").fill("eurusd")
        page.get_by_role("radio", name="Buy").click()
        mentor.field("Entry").fill("1.0850")
        mentor.field("Stop").fill("1.0810")
        mentor.field("Target 1").fill("1.0930")
        mentor.field("Note").fill("Waiting for the retest of the breakout level.")
        mentor.button("Post").click()
        mentor.at("/")
        check_soon("the bot announces it in the channel, without being asked", lambda: len(posted()) == 1, SOON)
        notice = (posted() or [""])[0]
        check("naming the pair, with the join link", notice == f"New VIP setup: EURUSD\n\nThe entry, stop and targets are inside, for VIP members.\n\nGold Desk on Floor: {JOIN}")
        check("and none of what VIP members pay for", not any(secret in notice for secret in ("1.0850", "1.0810", "1.0930", "Buy", "retest")))

        print("A post for everyone, written in the app")
        fake_telegram.sent.clear()
        page.get_by_role("tab", name="Manage").click()
        mentor.button("New post").click()
        mentor.at("/compose")
        page.get_by_role("radio", name="Everyone").click()
        mentor.field("Title").fill("Welcome to Gold Desk")
        mentor.field("What do you want to say?").fill("Start here.\n\nThe rules are simple: every setup has a stop, and nobody is promised a profit.")
        mentor.button("Post").click()
        mentor.at("/")
        check_soon("a post for everyone is announced with its first lines", lambda: posted() == [
            f"Welcome to Gold Desk\n\nStart here. The rules are simple: every setup has a stop, and nobody is promised a profit.\n\nGold Desk on Floor: {JOIN}"
        ], SOON)

        print("A post for VIP")
        fake_telegram.sent.clear()
        write("post", p_audience="vip", p_title="Why I closed gold early", p_body="Because the daily candle closed below 2650, and that level held all month.")
        check("a VIP post gives its title and nothing more", posted() == [f"New for VIP members: Why I closed gold early\n\nRead it inside.\n\nGold Desk on Floor: {JOIN}"])
        fake_telegram.sent.clear()
        write("offer", p_title="Free VIP with my broker", p_link_url="https://broker.example/kay")
        check("a pinned offer is not announced", posted() == [])

        print("The mentor's switches")
        page.get_by_role("tab", name="Manage").click()
        page.get_by_role("button", name=re.compile("^Telegram teasers\\. ")).click()
        mentor.at("/manage/telegram")
        check_visible("the screen says when the last notice went", mentor.text(re.compile(r"Last notice (just now|\d+ min ago)")), SOON)
        page.get_by_role("checkbox", name="New posts").click()
        check_soon("switching posts off is saved", lambda: link().get("tease_posts") is False)
        check_ticked("and shown", page.get_by_role("checkbox", name="New posts"), ticked=False)
        check("the other switches stay as they were", link().get("tease_setups") is True and link().get("tease_lessons") is True)
        write("post", p_audience="everyone", p_title="Not for the channel")
        check("a post is then not announced", posted() == [])
        write("setup", p_audience="everyone", p_pair="XAUUSD", p_side="sell", p_entry="2650", p_stop="2660", p_targets=["2630"])
        check("while a setup still is, and one for everyone says which way", posted() == [f"New setup: XAUUSD · Sell\n\nThe entry, stop and targets are inside.\n\nGold Desk on Floor: {JOIN}"])
        mentor.shot("3-switches")

        print("A test")
        fake_telegram.sent.clear()
        mentor.button("Send a test").click()
        check_visible("the mentor is told a test is on its way", mentor.text("A test line is on its way to your channel."))
        check_soon("and it arrives", lambda: posted() == [f"This is a test from Floor. Notices for Gold Desk will be posted here.\n\nGold Desk on Floor: {JOIN}"], SOON)

        print("The bot is taken out of the channel")
        fake_telegram.sent.clear()
        check("Telegram tells Floor", fake_telegram.kicked(CHANNEL, TITLE) == 200)
        check("which notes it", link().get("last_error") == "removed")
        check_visible("the mentor is told, and what to do", mentor.text(f"Floor's bot is no longer in {TITLE}. Add it back as an admin, then send a test."), SOON)
        mentor.shot("4-removed")
        write("setup", p_audience="vip", p_pair="GBPUSD", p_side="buy", p_entry="1.2700", p_stop="1.2650", p_targets=["1.2800"])
        check("a notice that cannot be posted is not posted", posted() == [])
        check("and is not tried over and over", local_db.value("select count(*) from private.outbox where kind = 'telegram' and done_at is null") == 0)

        print("The bot is back, but may not post")
        fake_telegram.refusing[CHANNEL] = (400, "Bad Request: need administrator rights in the channel chat")
        mentor.button("Send a test").click()
        check_visible("the mentor is told it lacks the right", mentor.text(f"Floor's bot is in {TITLE} but is not allowed to post.", exact=False), SOON)
        fake_telegram.refusing.clear()
        mentor.button("Send a test").click()
        check_soon("once it is put right, a test goes through", lambda: len(posted()) == 1, SOON)
        check_gone("and the warning goes", mentor.text("but is not allowed to post", exact=False), SOON)
        check("with nothing left noted against the channel", link().get("last_error") is None)

        print("Telegram is slow to answer")
        fake_telegram.sent.clear()
        fake_telegram.refusing[CHANNEL] = (429, "Too Many Requests: retry after 5")
        write("setup", p_audience="vip", p_pair="USDJPY", p_side="sell", p_entry="151.20", p_stop="151.80", p_targets=["150.00"])
        waiting = local_db.rows("select attempts, done_at from private.outbox where kind = 'telegram' order by id desc limit 1")
        check("a notice Telegram asked to wait for is kept, to try again", posted() == [] and len(waiting) == 1 and waiting[0]["done_at"] is None and waiting[0]["attempts"] == 1)
        check("and is not blamed on the mentor's channel", link().get("last_error") is None)
        fake_telegram.refusing.clear()
        local_db.run("update private.outbox set run_after = now() where kind = 'telegram' and done_at is null")
        sweep()
        check("it goes out when Telegram is ready", posted() == [f"New VIP setup: USDJPY\n\nThe entry, stop and targets are inside, for VIP members.\n\nGold Desk on Floor: {JOIN}"])

        print("Disconnecting")
        fake_telegram.sent.clear()
        mentor.button("Disconnect").click()
        check_visible("disconnecting asks first", mentor.text(f"Stop posting in your channel {TITLE}? You can connect it again at any time."))
        mentor.button("Keep it").click()
        check("and can be backed out of", link().get("chat_id") == CHANNEL)
        mentor.button("Disconnect").click()
        mentor.button("Yes, disconnect").click()
        check_soon("the channel is forgotten", lambda: link().get("chat_id") is None)
        check("the mentor's switches are kept for next time", link().get("tease_posts") is False)
        check_visible("the screen goes back to the steps", page.get_by_role("heading", name="Add @FloorTeaserBot to your channel"), SOON)
        write("setup", p_audience="vip", p_pair="AUDUSD", p_side="buy", p_entry="0.6500", p_stop="0.6450", p_targets=["0.6600"])
        check("and nothing more is announced", posted() == [] and local_db.value("select count(*) from private.outbox where kind = 'telegram' and done_at is null") == 0)
        mentor.close()

        print("An admin")
        admin = Phone(p, BASE, "teasers-admin-", problems, ignore=EXPECTED_NOISE)
        admin.sign_in("tobi@example.com")
        admin.page.get_by_role("tab", name="Manage").click()
        check_visible("an admin has the Manage tab", admin.page.get_by_role("button", name=re.compile("^Members\\. ")))
        check_gone("but teasers are the mentor's alone", admin.page.get_by_role("button", name=re.compile("^Telegram teasers\\. ")))
        refused = ""
        try:
            local_db.as_login(tobi, "select * from public.telegram_start(%s)", [space])
        except Exception as error:
            refused = str(error)
        check("and the database refuses them a code", "not_allowed" in refused)
        admin.close()
        pause(0.2)

    server.shutdown()
    services.stop()
    finish(problems)


if __name__ == "__main__":
    main()
