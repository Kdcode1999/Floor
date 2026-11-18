"""Walks Community in the phone app: the mentor, a VIP member and two free members, each on
their own phone at the same time.

The mentor chooses the name people will see, then writes in the group every space starts with.
The members read it on their phones and answer. A free member finds the VIP room locked. A
member's link and phone number are stopped before they are sent, and the mentor's are not. The
mentor answers a message, posts a picture, makes a group only staff write in and a group by
invitation, and puts the groups in a new order. One member misbehaves: another reports the
message and blocks them, the mentor deletes the message from the queue of reports and mutes
them. At the end the mentor deletes a group.

Runs on the local backend (local_supabase.py): a real Postgres with Floor's migrations.

Needs Python with Playwright, psycopg and Pillow, Google Chrome, and PostgreSQL installed.
From `mobile/` (bash shown; the values only matter while building):

    EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:8095 EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=stand-in \\
      EXPO_PUBLIC_SITE_URL=http://127.0.0.1:8096 npx expo export --platform web --output-dir dist-stand-in
    python ../checks/phone_chat.py

Pictures land in `checks/out/`, named `chat-*`. The script exits with an error if a check fails.
"""

import re

from playwright.sync_api import Locator, sync_playwright

import fixtures
import local_db
import local_supabase
from common import MOBILE, OUT, Phone, check, check_count, check_gone, check_soon, check_visible, clear_pictures, finish, serve

DIST = MOBILE / "dist-stand-in"
PORT = 8094
BASE = f"http://127.0.0.1:{PORT}"

# Refusals are part of the walk, and the browser logs each one. Deleting a picture also asks
# Floor's server to clear the file away, and no server runs for this walk.
EXPECTED_NOISE = ("Failed to load resource", "net::ERR_")

# A phone in a group asks for news every few seconds. This is how long a check waits for it.
SOON = 15


def main() -> None:
    backend = local_supabase.start(8095)
    server = serve(DIST, PORT)
    clear_pictures("chat-")

    # The mentor signed up in the app and has not chosen a name yet.
    kay = local_supabase.account("kay@example.com")
    space = fixtures.space(kay, "Gold Desk", "gold-desk")
    vee = fixtures.person("vee@example.com", "Vee")
    ada = fixtures.person("ada@example.com", "Ada O.")
    bola = fixtures.person("bola@example.com", "Bola")
    for person in (vee, ada, bola):
        fixtures.join(person, "gold-desk")
    fixtures.vip(space, vee, 30)

    def group_id(name: str) -> str | None:
        found = local_db.value("select id from public.groups where space_id = %s and name = %s", [space, name])
        return str(found) if found else None

    def said(group: str, words: str | None = None) -> list[dict]:
        """The messages in a group, oldest first. With `words`, only the ones that say exactly that."""
        rows = local_db.rows(
            "select m.*, f.display_name as name from public.messages m join public.profiles f on f.id = m.user_id "
            "where m.group_id = %s order by m.created_at",
            [group_id(group)],
        )
        return [row for row in rows if words is None or row["body"] == words]

    def row(phone: Phone, name: str) -> Locator:
        """A group in the list on the Chat tab."""
        return phone.page.get_by_role("button", name=re.compile(rf"^{re.escape(name)}\. "))

    def chat(phone: Phone) -> None:
        phone.page.get_by_role("tab", name="Chat").click()
        phone.at("/chat")

    def enter(phone: Phone, name: str) -> None:
        chat(phone)
        row(phone, name).click()
        phone.at("/group")

    def leave(phone: Phone) -> None:
        phone.button("Back to Chat").click()
        phone.at("/chat")

    def say(phone: Phone, words: str) -> None:
        phone.field("Message").fill(words)
        phone.button("Send").click()

    def bubble(phone: Phone, who: str, words: str) -> Locator:
        return phone.page.get_by_role("button", name=f"{who}: {words}", exact=True)

    problems: list[str] = []
    with sync_playwright() as p:
        mentor = Phone(p, BASE, "chat-mentor-", problems, ignore=EXPECTED_NOISE)

        print("The groups a space starts with")
        mentor.sign_in("kay@example.com")
        chat(mentor)
        check_visible("a new space has a group for everyone", row(mentor, "General"))
        check_visible("and one for VIP", row(mentor, "VIP room"))
        check_visible("that says so", mentor.text("VIP", exact=True))
        check_visible("the mentor can manage the groups from here", mentor.button("Manage groups"))
        mentor.shot("1-groups")

        print("Choosing a name before writing")
        row(mentor, "General").click()
        check("a group opens", mentor.at("/group"))
        check_visible("an empty group says so", mentor.text("Nothing here yet. Say the first word."))
        check_visible("someone with no name yet is asked for one first", mentor.text("Choose the name people here will see before you write."))
        check_gone("and has no box to write in", mentor.field("Message"))
        mentor.shot("2-name-first")
        mentor.button("Choose a name").click()
        check("the name screen opens", mentor.at("/name"))
        mentor.field("Name").fill("Admin Kay")
        mentor.button("Save").click()
        check_visible("a name cannot claim to be staff", mentor.text("The mentor and admins get a badge instead.", exact=False))
        mentor.field("Name").fill("Kay +234 801 234 5678")
        mentor.button("Save").click()
        check_visible("or carry a phone number", mentor.text("A name can't carry a link, an @name or a phone number."))
        check("nothing was saved", local_db.value("select display_name from public.profiles where id = %s", [kay]) == "Member")
        mentor.field("Name").fill("Kay")
        mentor.shot("3-name")
        mentor.button("Save").click()
        check("saving goes back to the group", mentor.at("/group"))
        check("the name is saved", local_db.value("select display_name from public.profiles where id = %s", [kay]) == "Kay")
        check_visible("and now there is a box to write in", mentor.field("Message"))

        print("The mentor writes, and may post links and numbers")
        welcome = "Welcome to the desk. Rules are at https://example.com/rules and the office line is +234 801 234 5678"
        say(mentor, welcome)
        check_visible("the message appears, as their own", bubble(mentor, "You", welcome))
        check("it is in the database", len(said("General", welcome)) == 1)
        check("the box is empty again", mentor.field("Message").input_value() == "")
        mentor.shot("4-first-message")

        print("A VIP member reads and answers")
        vip_phone = Phone(p, BASE, "chat-vip-", problems, ignore=EXPECTED_NOISE)
        vip_phone.sign_in("vee@example.com")
        check_visible("the Chat tab shows that something is waiting, before it is opened", vip_phone.page.get_by_role("tab", name="Chat. Unread messages", exact=True))
        chat(vip_phone)
        check_visible("the list shows the newest message and who wrote it", vip_phone.text(f"Kay: {welcome}"[:60], exact=False))
        check_visible("and that one message is unread", row(vip_phone, "General").get_by_text("1", exact=True))
        check_visible("the VIP room is open to a VIP member", vip_phone.page.get_by_role("button", name="VIP room. For VIP members."))
        vip_phone.shot("1-groups")
        row(vip_phone, "General").click()
        vip_phone.at("/group")
        check_visible("the mentor's message is there", bubble(vip_phone, "Kay", welcome))
        check_visible("under their name", vip_phone.text("Kay", exact=True))
        check_visible("with the badge only staff carry", vip_phone.text("Mentor", exact=True))
        check_soon("opening the group marks it read", lambda: local_db.value("select count(*) from public.group_reads where user_id = %s", [vee]) == 1)
        check_gone("a member has no way to add a picture", vip_phone.button("Add a picture"))
        say(vip_phone, "Thanks Kay, glad to be here")
        check_visible("their answer appears on their phone", bubble(vip_phone, "You", "Thanks Kay, glad to be here"))
        check_visible("and on the mentor's, without them touching anything", bubble(mentor, "Vee", "Thanks Kay, glad to be here"), SOON)
        beside = lambda phone, name: phone.page.get_by_text(name, exact=True).locator("xpath=..").get_by_text("Mentor", exact=True)
        check_count("the badge sits beside the mentor's name", beside(vip_phone, "Kay"), 1)
        check_count("a member's name carries none", beside(mentor, "Vee"), 0)
        vip_phone.shot("2-conversation")
        leave(vip_phone)
        check_gone("nothing is unread once they have been in", row(vip_phone, "General").get_by_text("1", exact=True))
        check_visible("and the dot on the Chat tab goes", vip_phone.page.get_by_role("tab", name="Chat", exact=True))

        print("A free member")
        free_phone = Phone(p, BASE, "chat-free-", problems, ignore=EXPECTED_NOISE)
        free_phone.sign_in("ada@example.com")
        chat(free_phone)
        check_visible("the VIP room is listed, locked", free_phone.page.get_by_role("button", name="VIP room. For VIP members"))
        free_phone.shot("1-groups")
        row(free_phone, "VIP room").click()
        free_phone.at("/group")
        check_visible("and says who it is for when opened", free_phone.text("This group is for VIP members. It opens here once you have VIP."))
        check_gone("with no box to write in", free_phone.field("Message"))
        refused = False
        try:
            local_db.as_login(ada, "select * from public.chat_page(%s)", [group_id("VIP room")])
        except Exception as error:
            refused = "not_allowed" in str(error)
        check("the database refuses them its messages", refused)
        check("while it gives them the group for everyone", len(local_db.as_login(ada, "select * from public.chat_page(%s)", [group_id("General")])) == 2)
        leave(free_phone)

        print("Links and phone numbers are for staff")
        row(free_phone, "General").click()
        free_phone.at("/group")
        say(free_phone, "Join my signals channel t.me/adafx")
        check_visible("a member's link is stopped before it is sent", free_phone.text("Only the mentor and admins can post links, email addresses or @names here."))
        free_phone.shot("2-link-stopped")
        say(free_phone, "whatsapp me on 0803 123 4567")
        check_visible("and so is a phone number", free_phone.text("Only the mentor and admins can post phone numbers here.", exact=False))
        check("neither reached the database", len(said("General")) == 2)
        for words, code in (("add me @adafx_signals", "no_links"), ("call 0803-123-4567", "no_numbers")):
            caught = ""
            try:
                local_db.as_login(ada, "select public.send_message(%s, %s)", [group_id("General"), words])
            except Exception as error:
                caught = str(error)
            check(f"going around the app is refused by the database ({code})", code in caught)
        levels = "My levels: tp 1.08500, 1.09000 and sl 1.07800"
        say(free_phone, levels)
        check_visible("prices are not phone numbers", bubble(free_phone, "You", levels))

        print("Answering a message")
        check_visible("the mentor sees the member's levels", bubble(mentor, "Ada O.", levels), SOON)
        bubble(mentor, "Ada O.", levels).click()
        for choice in ("Reply", "Copy text", "Mute Ada O.", "Delete for everyone"):
            check_visible(f"the mentor can choose: {choice}", mentor.button(choice))
        check_gone("staff do not report to themselves", mentor.button("Report to the mentor and admins"))
        mentor.shot("5-actions")
        mentor.button("Reply").click()
        check_visible("the answer says what it answers", mentor.text("Replying to Ada O."))
        say(mentor, "Good levels. Keep the stop where it is.")
        check_visible("the answer carries a line of the message it answers", bubble(mentor, "You", "Good levels. Keep the stop where it is."))
        answer = said("General", "Good levels. Keep the stop where it is.")
        check("and is tied to it in the database", len(answer) == 1 and answer[0]["reply_to"] == said("General", levels)[0]["id"])
        check_gone("the reply bar is put away", mentor.text("Replying to Ada O."))
        check_visible("the member sees the answer with their own words quoted", free_phone.text("Good levels. Keep the stop where it is."), SOON)

        print("A picture from the mentor")
        chart = OUT / "chat-chart-source.png"
        chart.write_bytes(fixtures.picture("XAUUSD H4", colour="#7c2d12", size=(2400, 1350)))
        with mentor.page.expect_file_chooser() as chooser:
            mentor.button("Add a picture").click()
        chooser.value.set_files(str(chart))
        check_visible("the chosen picture waits to be sent", mentor.text("Picture ready to send"))
        mentor.button("Send").click()
        check_soon("the picture message is saved", lambda: any(row["image_path"] for row in said("General")), 20)
        pictured = [row for row in said("General") if row["image_path"]]
        path = pictured[0]["image_path"] if pictured else ""
        check("the picture sits in the group's own folder", path.startswith(f"{space}/{group_id('General')}/"))
        check("shrunk to 1600 across before upload", bool(pictured) and (pictured[0]["image_width"], pictured[0]["image_height"]) == (1600, 900))
        check("and is in the file store", ("chat", path) in local_supabase.files)
        check_visible("it shows in the conversation", mentor.page.get_by_role("button", name="Picture. Open it full screen"), SOON)
        mentor.page.wait_for_timeout(900)
        check("and loads", mentor.page.evaluate("Array.from(document.images).some((image) => image.naturalWidth === 1600)"))
        mentor.shot("6-picture")
        check_visible("the member sees it too", free_phone.page.get_by_role("button", name="Picture. Open it full screen"), SOON)
        free_phone.page.wait_for_timeout(900)
        check("and it loads for them", free_phone.page.evaluate("Array.from(document.images).some((image) => image.naturalWidth === 1600)"))
        free_phone.page.get_by_role("button", name="Picture. Open it full screen").click()
        check("it opens full screen", free_phone.at("/picture"))
        check_visible("ready to zoom", free_phone.page.get_by_role("img", name="The picture, full screen"))
        free_phone.button("Close").click()
        check("and closes back to the group", free_phone.at("/group"))
        free_phone.shot("3-conversation")

        print("A group only staff write in")
        mentor.button("Group settings").click()
        check("the group's settings open from the conversation", mentor.at("/group-settings"))
        check("with what is saved", mentor.field("Name").input_value() == "General")
        check_visible("and the choice of who can open it", mentor.page.get_by_role("radio", name="Invited"))
        mentor.shot("7-group-settings")
        mentor.button("Back").click()
        check("Back returns to the conversation", mentor.at("/group"))
        leave(mentor)
        mentor.page.get_by_role("tab", name="Manage").click()
        mentor.page.get_by_role("button", name=re.compile("^Groups\\. ")).click()
        check("the list of groups opens from Manage", mentor.at("/manage/groups"))
        check_visible("it says there are no private messages", mentor.text("There are no private messages.", exact=False))
        mentor.button("New group").click()
        mentor.at("/group-settings")
        mentor.button("Create group").click()
        check_visible("a group needs a name", mentor.text("Give the group a name."))
        mentor.field("Name").fill("Announcements")
        mentor.field("What it is for").fill("News from Kay. Read only.")
        mentor.page.get_by_role("radio", name="Mentor and admins only").click()
        check_visible("the choice is explained", mentor.text("Members read. Good for announcements."))
        mentor.shot("8-new-group")
        mentor.button("Create group").click()
        check("creating goes back to the list", mentor.at("/manage/groups"))
        check_visible("the new group is listed with who it is for", mentor.page.get_by_role("button", name="Announcements. Open to everyone · Only staff write"))
        check("it is in the database", local_db.value("select posting from public.groups where id = %s", [group_id("Announcements")]) == "staff")

        print("A group by invitation")
        mentor.button("New group").click()
        mentor.at("/group-settings")
        mentor.field("Name").fill("Inner circle")
        mentor.page.get_by_role("radio", name="Invited").click()
        check_visible("the mentor is told nobody else will know it is there", mentor.text("Only the members you add. Nobody else knows it is there."))
        mentor.button("Create group").click()
        check("a new group by invitation goes straight to choosing who is in it", mentor.at("/group-members"))
        check_visible("it starts empty", mentor.text("0 members are in this group."))
        check_gone("staff are not listed: they are always in", mentor.page.get_by_role("checkbox", name="Kay"))
        mentor.page.get_by_role("checkbox", name="Vee").click()
        check_visible("ticking a member puts them in", mentor.text("1 member is in this group."))
        check_soon("in the database at once", lambda: local_db.value("select count(*) from public.group_members where group_id = %s and user_id = %s", [group_id("Inner circle"), vee]) == 1)
        mentor.shot("9-group-members")
        mentor.page.get_by_role("checkbox", name="Bola").click()
        check_soon("a second member goes in", lambda: local_db.value("select count(*) from public.group_members where group_id = %s", [group_id("Inner circle")]) == 2)
        mentor.page.get_by_role("checkbox", name="Bola").click()
        check_soon("and unticking takes them out", lambda: local_db.value("select count(*) from public.group_members where group_id = %s", [group_id("Inner circle")]) == 1)

        print("Putting the groups in order")
        mentor.button("Back").click()
        check("Back returns to the list of groups", mentor.at("/manage/groups"))
        mentor.page.get_by_role("button", name="Inner circle. Invited members · Members can write").click()
        mentor.at("/group-settings")
        check_visible("an invited group's settings lead to its members", mentor.button("Choose who is in it"))
        mentor.button("Back").click()
        mentor.at("/manage/groups")
        mentor.button("Move Announcements up").click()
        order = lambda: [found["name"] for found in local_db.rows("select name from public.groups where space_id = %s order by position, created_at", [space])]
        check_soon("a group moves up one place", lambda: order() == ["General", "Announcements", "VIP room", "Inner circle"])
        mentor.button("Move Announcements up").click()
        check_soon("and again, to the top", lambda: order() == ["Announcements", "General", "VIP room", "Inner circle"])
        mentor.shot("10-groups-ordered")

        print("What each person now sees")
        chat(mentor)
        known = ("General", "VIP room", "Announcements", "Inner circle")

        def names(phone: Phone) -> list[str]:
            """The groups in the list on the Chat tab, top to bottom."""
            labels = phone.page.get_by_role("button", name=re.compile(r"^[A-Z][A-Za-z ]+\. ")).evaluate_all("(found) => found.map((each) => each.getAttribute('aria-label'))")
            return [label.split(". ")[0] for label in labels if label.split(". ")[0] in known]

        check_soon("the mentor sees all four, in the new order", lambda: names(mentor) == ["Announcements", "General", "VIP room", "Inner circle"])
        row(mentor, "Announcements").click()
        mentor.at("/group")
        check_visible("the header says what kind of group it is", mentor.text("Everyone in the space · Announcements"))
        say(mentor, "Class on Saturday at 4pm. Bring your charts.")
        check_visible("the mentor writes in it", bubble(mentor, "You", "Class on Saturday at 4pm. Bring your charts."))
        leave(mentor)

        chat(vip_phone)
        vip_phone.page.wait_for_timeout(300)
        chat(vip_phone)
        check_soon("the invited member sees the group by invitation", lambda: names(vip_phone) == ["Announcements", "General", "VIP room", "Inner circle"], 25)
        check_visible("marked as invited", vip_phone.text("Invited", exact=True))
        check_visible("the announcement is unread", row(vip_phone, "Announcements").get_by_text("1", exact=True))
        vip_phone.shot("3-groups")
        row(vip_phone, "Announcements").click()
        vip_phone.at("/group")
        check_visible("a member can read it", bubble(vip_phone, "Kay", "Class on Saturday at 4pm. Bring your charts."))
        check_visible("and is told only staff write there", vip_phone.text("Only the mentor and admins write here."))
        check_gone("with no box to write in", vip_phone.field("Message"))
        vip_phone.shot("4-announcements")
        leave(vip_phone)

        leave(free_phone)
        check_soon("someone not invited never sees that group", lambda: names(free_phone) == ["Announcements", "General", "VIP room"], 25)

        print("A member misbehaves")
        bad_phone = Phone(p, BASE, "chat-bad-", problems, ignore=EXPECTED_NOISE)
        bad_phone.sign_in("bola@example.com")
        enter(bad_phone, "General")
        scam = "Send me your account login and I will double your money this week"
        say(bad_phone, scam)
        check_visible("their message goes out: it carries no link or number", bubble(bad_phone, "You", scam))
        say(bad_phone, "Who wants in? Last chance")
        check_visible("and another", bubble(bad_phone, "You", "Who wants in? Last chance"))

        print("Another member reports it and blocks them")
        enter(vip_phone, "General")
        check_visible("the VIP member sees it", bubble(vip_phone, "Bola", scam), SOON)
        bubble(vip_phone, "Bola", scam).click()
        for choice in ("Reply", "Copy text", "Report to the mentor and admins", "Block Bola"):
            check_visible(f"a member can choose: {choice}", vip_phone.button(choice))
        check_gone("a member cannot delete someone else's message", vip_phone.button("Delete for everyone"))
        check_gone("or mute anyone", vip_phone.button("Mute Bola"))
        vip_phone.shot("5-actions")
        vip_phone.button("Report to the mentor and admins").click()
        check_visible("reporting is confirmed", vip_phone.text("Reported. The mentor and admins will take a look."))
        check_soon("the report is in the database", lambda: local_db.value("select count(*) from public.message_reports where status = 'open'") == 1)
        bubble(vip_phone, "Kay", welcome).click()
        check_visible("a complaint about staff goes to Floor instead", vip_phone.button("Report this space to Floor"))
        check_gone("staff cannot be blocked", vip_phone.button("Block Kay"))
        vip_phone.button("Cancel").click()

        enter(free_phone, "General")
        check_visible("the free member sees it too", bubble(free_phone, "Bola", scam), SOON)
        bubble(free_phone, "Bola", scam).click()
        free_phone.button("Block Bola").click()
        check_visible("blocking asks first", free_phone.text("Block Bola? You will stop seeing their messages in every group.", exact=False))
        free_phone.shot("4-block")
        free_phone.button("Block", exact=True).click()
        check_visible("and says what happened", free_phone.text("Bola is blocked. You won't see their messages."))
        check_gone("their messages leave the screen", bubble(free_phone, "Bola", scam))
        check_gone("all of them", bubble(free_phone, "Bola", "Who wants in? Last chance"))
        check("the block is in the database", local_db.value("select count(*) from public.blocks where user_id = %s and blocked_id = %s", [ada, bola]) == 1)
        check_visible("everyone else's messages stay", bubble(free_phone, "Kay", welcome))
        say(bad_phone, "Anyone?")
        free_phone.page.wait_for_timeout(4500)
        check_gone("what they write afterwards never arrives", bubble(free_phone, "Bola", "Anyone?"))

        print("The mentor deals with the report")
        mentor.page.get_by_role("tab", name="Manage").click()
        # The Manage tab is where the mentor left it: on the list of groups.
        mentor.button("Back to Manage").click()
        mentor.at("/manage")
        check_visible("Manage says a message is waiting", mentor.page.get_by_role("button", name="Reported messages. 1 message is waiting for you"))
        mentor.page.get_by_role("button", name="Reported messages. 1 message is waiting for you").click()
        check("the queue opens", mentor.at("/manage/reported"))
        check_visible("with who reported how many times, and where", mentor.text("Reported by 1 member · General", exact=False))
        check_visible("and the message itself", mentor.text(scam))
        mentor.shot("11-reported")
        mentor.button("Delete it").click()
        check_visible("deleting empties the queue", mentor.text("Nothing is waiting.", exact=False))
        check("the message is emptied in the database, not removed", [found["deleted_at"] is not None and found["body"] is None for found in local_db.rows("select body, deleted_at from public.messages where user_id = %s order by created_at limit 1", [bola])] == [True])
        check("the report is closed", local_db.value("select count(*) from public.message_reports where status = 'open'") == 0)
        check_visible("on the reporter's phone the message is marked as removed", vip_phone.text("Message removed"), SOON)
        check_gone("and its words are gone", bubble(vip_phone, "Bola", scam))

        print("The mentor mutes them")
        enter(mentor, "General")
        check_visible("the mentor sees the rest of what they wrote", bubble(mentor, "Bola", "Who wants in? Last chance"), SOON)
        bubble(mentor, "Bola", "Who wants in? Last chance").click()
        mentor.button("Mute Bola").click()
        check_visible("muting says what it does", mentor.text("Mute Bola? They can still read, but cannot write in any group until it ends."))
        mentor.shot("12-mute")
        mentor.button("1 day").click()
        check_visible("and confirms", mentor.text("Bola is muted for 1 day."))
        check_soon("the mute is in the database", lambda: local_db.value("select muted_until > now() + interval '23 hours' from public.memberships where user_id = %s", [bola]) is True)
        say(bad_phone, "Hello? Why is nobody answering")
        check_visible("the muted member is told why they cannot write", bad_phone.text("You can't write here for now. The mentor or an admin has muted you."))
        check_visible("and the box gives way to when the mute ends", bad_phone.text("You are muted until", exact=False), SOON)
        check_gone("with nothing to type in", bad_phone.field("Message"))
        check("nothing more of theirs is saved", len(said("General", "Hello? Why is nobody answering")) == 0)
        bad_phone.shot("1-muted")

        print("The mentor's page for the member")
        bubble(mentor, "Bola", "Who wants in? Last chance").click()
        mentor.button("Mute Bola").click()
        mentor.button("Open Bola in Members").click()
        check("the member's page opens", mentor.at("/member"))
        check_visible("it says they are muted, and until when", mentor.text("Muted until", exact=False))
        mentor.shot("13-member")
        mentor.button("Unmute now").click()
        check_soon("the mute can be lifted", lambda: local_db.value("select muted_until from public.memberships where user_id = %s", [bola]) is None)
        check_visible("and the page says so", mentor.text("Mute in groups"))
        mentor.button("Back").click()
        check("Back returns to the conversation", mentor.at("/group"))

        print("Deleting your own message, and unblocking")
        bubble(vip_phone, "You", "Thanks Kay, glad to be here").click()
        check_gone("nobody reports or blocks themselves", vip_phone.button("Report to the mentor and admins"))
        vip_phone.button("Delete", exact=True).click()
        check_visible("deleting asks first", vip_phone.text("Delete this message? It goes for everyone.", exact=False))
        vip_phone.button("Keep it").click()
        check("and can be backed out of", len(said("General", "Thanks Kay, glad to be here")) == 1)
        bubble(vip_phone, "You", "Thanks Kay, glad to be here").click()
        vip_phone.button("Delete", exact=True).click()
        vip_phone.button("Yes, delete").click()
        check_gone("their own message goes", bubble(vip_phone, "You", "Thanks Kay, glad to be here"))
        check("in the database too", len(said("General", "Thanks Kay, glad to be here")) == 0)

        leave(free_phone)
        free_phone.page.get_by_role("button", name=re.compile("^Account\\.")).click()
        free_phone.at("/account")
        check_visible("the account screen shows the name others see", free_phone.text("Ada O.", exact=True))
        free_phone.button("Blocked people").click()
        check("the list of blocked people opens", free_phone.at("/blocked"))
        check_visible("with the person they blocked", free_phone.text("Bola", exact=True))
        free_phone.shot("5-blocked")
        free_phone.button("Unblock").click()
        check_visible("unblocking empties it", free_phone.text("You haven't blocked anyone.", exact=False))
        check("and the database", local_db.value("select count(*) from public.blocks") == 0)

        print("A member cannot take a staff name")
        free_phone.button("Back").click()
        free_phone.at("/account")
        free_phone.button("Change your name").click()
        free_phone.at("/name")
        free_phone.field("Name").fill("K a y")
        free_phone.button("Save").click()
        check_visible("the mentor's name is taken, however it is spaced", free_phone.text("That is the name of this space, its mentor or an admin. Choose another."))
        free_phone.field("Name").fill("Gold Desk")
        free_phone.button("Save").click()
        check_visible("and so is the space's", free_phone.text("That is the name of this space, its mentor or an admin. Choose another."))
        free_phone.field("Name").fill("Ada Okafor")
        free_phone.button("Save").click()
        check("an ordinary name is saved", free_phone.at("/account"))
        check_visible("and shown", free_phone.text("Ada Okafor", exact=True))
        check("in the database", local_db.value("select display_name from public.profiles where id = %s", [ada]) == "Ada Okafor")

        print("Deleting a group")
        leave(mentor)
        mentor.page.get_by_role("tab", name="Manage").click()
        mentor.button("Back to Manage").click()
        mentor.at("/manage")
        mentor.page.get_by_role("button", name=re.compile("^Groups\\. ")).click()
        mentor.at("/manage/groups")
        mentor.page.get_by_role("button", name="Inner circle. Invited members · Members can write").click()
        mentor.at("/group-settings")
        mentor.button("Delete this group").click()
        check_visible("deleting a group asks first", mentor.text("Delete Inner circle and everything said in it? It cannot be brought back."))
        mentor.button("Yes, delete").click()
        check("and goes back to the list", mentor.at("/manage/groups"))
        check_gone("where the group no longer is", mentor.page.get_by_role("button", name="Inner circle. Invited members · Members can write"))
        check("nor in the database", group_id("Inner circle") is None)

        print("A long conversation")
        news = group_id("Announcements")
        local_db.run("delete from public.messages where group_id = %s", [news])
        for number in range(1, 96):
            local_db.as_person(kay, "select public.send_message(%s, %s)", [news, f"Update {number}"])
        # A minute apart, as if written over an afternoon.
        local_db.run(
            """
            update public.messages m
               set created_at = now() - make_interval(mins => 200 - o.place::int), changed_at = now() - make_interval(mins => 200 - o.place::int)
              from (select id, row_number() over (order by created_at) as place from public.messages where group_id = %s) o
             where o.id = m.id
            """,
            [news],
        )
        leave(vip_phone)
        row(vip_phone, "Announcements").click()
        vip_phone.at("/group")
        updates = vip_phone.page.get_by_role("button", name=re.compile(r"^Kay: Update \d+$"))
        check_visible("the newest messages come first", bubble(vip_phone, "Kay", "Update 95"))
        check_count("one page of them", updates, 40)
        check_gone("the start of the group is not claimed yet", vip_phone.text("The start of Announcements"))

        def scroll_back() -> None:
            """Scrolls the conversation as far back as it goes. A wheel does nothing on a phone-sized Chrome."""
            vip_phone.page.evaluate(
                """() => {
                  const boxes = Array.from(document.querySelectorAll('div')).filter((each) => {
                    const style = getComputedStyle(each);
                    return (style.overflowY === 'auto' || style.overflowY === 'scroll') && each.scrollHeight > each.clientHeight + 10 && each.offsetParent !== null;
                  });
                  const box = boxes[boxes.length - 1];
                  if (box) box.scrollTop = box.scrollHeight;
                }"""
            )

        scroll_back()
        check_count("scrolling back loads the page before", updates, 80, SOON)
        scroll_back()
        check_count("and the one before that", updates, 95, SOON)
        check_visible("down to where the group starts", vip_phone.text("The start of Announcements"))
        scroll_back()
        vip_phone.shot("6-start")

        for phone in (mentor, vip_phone, free_phone, bad_phone):
            phone.close()

    server.shutdown()
    backend.shutdown()
    finish(problems)


if __name__ == "__main__":
    main()
