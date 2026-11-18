"""Walks the Feed in the phone app, as the mentor, a VIP member and a free member at once.

The mentor writes a post with a picture and a video, a trade setup and a pinned offer. The two
members then open the Feed on their own phones: the VIP member reads everything, the free member
sees that the VIP setup exists and nothing inside it. The mentor adds an update to the setup,
edits a post and deletes one.

Runs on the local backend (local_supabase.py): a real Postgres with Floor's migrations.

Needs Python with Playwright, psycopg and Pillow, Google Chrome, and PostgreSQL installed.
From `mobile/` (bash shown; the values only matter while building):

    EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:8095 EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=stand-in \\
      EXPO_PUBLIC_SITE_URL=http://127.0.0.1:8096 npx expo export --platform web --output-dir dist-stand-in
    python ../checks/phone_feed.py

Pictures land in `checks/out/`, named `feed-*`. The script exits with an error if a check fails.
"""

from playwright.sync_api import sync_playwright

import fixtures
import local_db
import local_supabase
from common import MOBILE, OUT, Phone, check, check_count, check_gone, check_visible, clear_pictures, finish, serve

DIST = MOBILE / "dist-stand-in"
PORT = 8094
BASE = f"http://127.0.0.1:{PORT}"

# The video in the post is played by YouTube's own player, which this machine cannot reach, and
# refusals are part of the walk. The browser logs both.
EXPECTED_NOISE = ("Failed to load resource", "youtube", "ERR_", "No available adapters")


def main() -> None:
    backend = local_supabase.start(8095)
    server = serve(DIST, PORT)
    clear_pictures("feed-")

    kay = fixtures.person("kay@example.com", "Kay")
    space = fixtures.space(kay, "Gold Desk", "gold-desk")
    vee = fixtures.person("vee@example.com", "Vee")
    free = fixtures.person("free@example.com", "Free")
    for person in (vee, free):
        fixtures.join(person, "gold-desk")
    fixtures.vip(space, vee, 30)

    def posts(where: str = "true") -> list[dict]:
        return local_db.rows(f"select * from public.posts where space_id = %s and deleted_at is null and {where} order by created_at", [space])

    problems: list[str] = []
    with sync_playwright() as p:
        mentor = Phone(p, BASE, "feed-mentor-", problems, ignore=EXPECTED_NOISE)
        page = mentor.page

        def compose(kind: str | None = None) -> None:
            page.goto(BASE + "/", wait_until="networkidle")
            page.get_by_role("tab", name="Manage").click()
            mentor.button("New post").click()
            mentor.at("/compose")
            if kind:
                page.get_by_role("radio", name=kind, exact=True).click()

        print("A post, with a picture and a video")
        mentor.sign_in("kay@example.com")
        check_visible("a new space has an empty Feed", mentor.text("Nothing posted yet"))
        compose()
        check_visible("a post is for VIP unless the mentor says otherwise", mentor.text("Free members see that it was posted, but cannot open it."))
        check_gone("a VIP post has no box for a video link", mentor.field("Link to a video or post"))
        mentor.button("Post").click()
        check_visible("an empty post is not sent", mentor.text("Write something, or add a picture."))
        page.get_by_role("radio", name="Everyone").click()
        mentor.field("Title").fill("Welcome to Gold Desk")
        mentor.field("What do you want to say?").fill("Start here. The rules are at https://example.com/rules and every setup has a stop.")
        mentor.field("Link to a video or post").fill("https://vimeo.com/123")
        mentor.button("Post").click()
        check_visible("a link from somewhere else is turned away", mentor.text("Use a link from YouTube, X, Instagram or Facebook", exact=False))
        mentor.field("Link to a video or post").fill("https://youtu.be/dQw4w9WgXcQ")
        chart = OUT / "feed-chart-source.png"
        chart.write_bytes(fixtures.picture("EURUSD H1", colour="#14532d", size=(2400, 1350)))
        with page.expect_file_chooser() as chooser:
            mentor.button("Add a picture").click()
        chooser.value.set_files(str(chart))
        check_visible("the chosen picture is shown", page.get_by_role("img", name="The picture you chose"))
        mentor.shot("1-compose-post")
        mentor.button("Post").click()
        check("posting returns to the Feed", mentor.at("/"))
        check_visible("where the post now is", page.get_by_role("heading", name="Welcome to Gold Desk"))
        made = posts("kind = 'post'")
        check("it is in the database, for everyone", len(made) == 1 and made[0]["audience"] == "everyone" and made[0]["embed_url"] == "https://youtu.be/dQw4w9WgXcQ")
        path = made[0]["image_path"] if made else ""
        check("its picture sits in the folder for everyone", bool(path) and path.startswith(f"{space}/everyone/"))
        stored = local_supabase.files.get(("posts", path))
        check("shrunk to 1600 across before upload", bool(stored) and (made[0]["image_width"], made[0]["image_height"]) == (1600, 900))
        check_visible("the mentor is told who it is for", mentor.text("Post · Everyone · Just now"))
        check_visible("the link in the words can be tapped", page.get_by_role("link", name="https://example.com/rules"))
        check_count("the video plays inside the post, in YouTube's own player", page.locator('iframe[src^="https://www.youtube.com/embed/dQw4w9WgXcQ"]'), 1)
        page.wait_for_timeout(700)
        check("the picture loaded", page.evaluate("Array.from(document.images).some((image) => image.naturalWidth === 1600)"))
        mentor.shot("2-feed-post")

        print("A trade setup")
        compose("Trade setup")
        mentor.button("Post").click()
        check_visible("a setup needs its pair", mentor.text("Type the pair, like EURUSD or XAUUSD."))
        check_visible("its direction", mentor.text("Choose Buy or Sell."))
        check_visible("and its prices", mentor.text("Type the entry price, like 1.0850."))
        mentor.field("Pair").fill("eurusd")
        page.get_by_role("radio", name="Buy").click()
        mentor.field("Entry").fill("1.0850")
        mentor.field("Stop").fill("1.0900")
        mentor.field("Target 1").fill("1.0930")
        mentor.field("Target 2").fill("1.1000")
        mentor.field("Note").fill("Waiting for the retest of the breakout level.")
        mentor.button("Post").click()
        check_visible("a stop on the wrong side of the entry is caught", mentor.text("For a Buy, the stop goes below the entry."))
        check("and nothing is posted", len(posts("kind = 'setup'")) == 0)
        mentor.field("Stop").fill("1.0810")
        mentor.shot("3-compose-setup")
        mentor.button("Post").click()
        check("posting returns to the Feed", mentor.at("/"))
        check_visible("the setup is on top", page.get_by_role("heading", name="EURUSD"))
        setup = posts("kind = 'setup'")
        check("the prices are kept exactly as typed", len(setup) == 1 and (setup[0]["entry"], setup[0]["stop"], setup[0]["targets"]) == ("1.0850", "1.0810", ["1.0930", "1.1000"]))
        check("it is for VIP", setup[0]["audience"] == "vip")
        check("an alert is waiting to go out for it", local_db.value("select count(*) from private.outbox where kind = 'alert'") == 1)
        check_visible("two targets are numbered", mentor.text("Target 2"))

        print("A pinned offer")
        compose("Offer")
        check_visible("the form says who sees an offer", mentor.text("An offer is pinned to the top of the Feed", exact=False))
        mentor.field("Title").fill("Free VIP with my broker")
        mentor.field("A few words about it").fill("Open an account under my link and send proof.")
        mentor.field("Link").fill("broker.example/kay")
        mentor.button("Pin offer").click()
        check_visible("an offer's link must be a real one", mentor.text("Type the link, starting with https://"))
        mentor.field("Link").fill("https://broker.example/kay")
        mentor.field("What the button says").fill("Open account")
        mentor.button("Pin offer").click()
        check("pinning returns to the Feed", mentor.at("/"))
        check_visible("the offer is pinned", mentor.text("Pinned by your mentor"))
        order = page.get_by_role("heading").all_inner_texts()
        check("above everything else", [text for text in order if text in ("Free VIP with my broker", "EURUSD", "Welcome to Gold Desk")] == ["Free VIP with my broker", "EURUSD", "Welcome to Gold Desk"])
        mentor.shot("4-feed-mentor")

        print("A VIP member's Feed")
        vip_phone = Phone(p, BASE, "feed-vip-", problems, ignore=EXPECTED_NOISE)
        vip_phone.sign_in("vee@example.com")
        check_visible("a VIP member sees the setup", vip_phone.page.get_by_role("heading", name="EURUSD"))
        check_visible("with its prices", vip_phone.text("1.0850", exact=True))
        check_visible("and the mentor's note", vip_phone.text("Waiting for the retest of the breakout level."))
        check_visible("the offer has its button", vip_phone.button("Open account"))
        check_gone("a member has no way to manage a post", vip_phone.button("Manage this post"))
        check_gone("and is not told who each post is for", vip_phone.text("Post · Everyone", exact=False))
        vip_phone.shot("1-feed")
        vip_phone.page.get_by_role("button", name="Picture. Open it full screen").click()
        check("a picture opens full screen", vip_phone.at("/picture"))
        check_visible("ready to zoom", vip_phone.page.get_by_role("img", name="The picture, full screen"))
        vip_phone.shot("2-picture")
        vip_phone.button("Close").click()
        check("and closes back to the Feed", vip_phone.at("/"))

        print("A free member's Feed")
        free_phone = Phone(p, BASE, "feed-free-", problems, ignore=EXPECTED_NOISE)
        free_phone.sign_in("free@example.com")
        check_visible("a free member sees that a VIP setup was posted", free_phone.text("EURUSD setup"))
        check_visible("marked as for VIP", free_phone.text("For VIP members", exact=False))
        check_gone("with none of its prices", free_phone.text("1.0850", exact=True))
        check_gone("and none of its words", free_phone.text("Waiting for the retest", exact=False))
        check_visible("the free post is open to them", free_phone.page.get_by_role("heading", name="Welcome to Gold Desk"))
        check_visible("and so is the offer", free_phone.button("Open account"))
        free_phone.page.wait_for_timeout(700)
        check("the free post's picture loads for them", free_phone.page.evaluate("Array.from(document.images).some((image) => image.naturalWidth === 1600)"))
        free_phone.shot("1-feed")

        print("An update to the setup")
        page.get_by_role("button", name="Manage this post").nth(1).click()
        check("the setup opens for managing", mentor.at("/post"))
        check_visible("its prices are shown, not offered for change", mentor.text("Entry 1.0850 · Stop 1.0810 · Targets 1.0930, 1.1000"))
        check_gone("there is no box for a price", mentor.field("Entry"))
        mentor.field("Update").fill("Target 1 hit, stop moved to entry")
        page.get_by_role("checkbox", name="This setup is closed").click()
        mentor.shot("5-manage-setup")
        mentor.button("Save update").click()
        check("saving returns to the Feed", mentor.at("/"))
        check_visible("the update is under the setup", mentor.text("Target 1 hit, stop moved to entry"))
        check_visible("and the setup is marked closed", mentor.text("Closed", exact=True))
        row = posts("kind = 'setup'")[0]
        check("in the database too, with the prices untouched", row["update_note"] == "Target 1 hit, stop moved to entry" and row["closed_at"] is not None and row["entry"] == "1.0850")
        mentor.shot("6-feed-updated")
        vip_phone.page.goto(BASE + "/", wait_until="networkidle")
        check_visible("the VIP member sees the update", vip_phone.text("Target 1 hit, stop moved to entry"))
        free_phone.page.goto(BASE + "/", wait_until="networkidle")
        check_visible("the free member still sees only that the setup exists", free_phone.text("EURUSD setup"))
        check_gone("and nothing of the update", free_phone.text("Target 1 hit", exact=False))

        print("Editing and deleting")
        page.get_by_role("button", name="Manage this post").nth(2).click()
        mentor.at("/post")
        check("a post's words can be changed", mentor.field("Title").input_value() == "Welcome to Gold Desk")
        mentor.field("Title").fill("Welcome, read this first")
        mentor.button("Save").click()
        mentor.at("/")
        check_visible("the new title is in the Feed", page.get_by_role("heading", name="Welcome, read this first"))
        check_visible("marked as edited", mentor.text("Edited", exact=False))
        page.get_by_role("button", name="Manage this post").nth(2).click()
        mentor.at("/post")
        mentor.button("Delete this post").click()
        check_visible("deleting asks first", mentor.text("Delete this for everyone? It cannot be brought back."))
        mentor.button("Keep it").click()
        check("and can be backed out of", len(posts("kind = 'post'")) == 1)
        mentor.button("Delete this post").click()
        mentor.button("Yes, delete").click()
        mentor.at("/")
        check_gone("a deleted post leaves the Feed", page.get_by_role("heading", name="Welcome, read this first"))
        check("and the database", len(posts("kind = 'post'")) == 0)
        page.wait_for_timeout(500)
        check("its picture is thrown away", ("posts", path) not in local_supabase.files)
        free_phone.page.goto(BASE + "/", wait_until="networkidle")
        check_gone("for the members too", free_phone.page.get_by_role("heading", name="Welcome, read this first"))

        print("A long Feed")
        for number in range(1, 26):
            local_db.as_person(kay, "select public.create_post(p_space => %s, p_kind => 'post', p_audience => 'everyone', p_title => %s)", [space, f"Note {number}"])
            local_db.run("update public.posts set created_at = now() - make_interval(mins => %s) where title = %s", [60 - number, f"Note {number}"])
        free_phone.page.goto(BASE + "/", wait_until="networkidle")
        check_visible("the newest posts come first", free_phone.page.get_by_role("heading", name="Note 25", exact=True))
        check_gone("the oldest are not loaded yet", free_phone.page.get_by_role("heading", name="Note 3", exact=True))
        free_phone.button("Show older posts").click()
        check_visible("older posts load when asked for", free_phone.page.get_by_role("heading", name="Note 1", exact=True))
        check_gone("and then there is nothing more to ask for", free_phone.button("Show older posts"))
        check_count("the offer is not repeated", free_phone.text("Pinned by your mentor"), 1)

        for phone in (mentor, vip_phone, free_phone):
            phone.close()

    server.shutdown()
    backend.shutdown()
    finish(problems)


if __name__ == "__main__":
    main()
