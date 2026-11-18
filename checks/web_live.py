"""Walks Live with real video: the mentor broadcasts from the laptop page, members watch on
their phones.

The mentor goes live on the laptop with a camera and a microphone and shares the screen. A VIP
member joins from the Feed on their phone and sees and hears the broadcast, writes in the
session's chat and switches to sound only. A free member sees the session is on and cannot go
in. The mentor ends it and the room closes on the phone. Then the mentor goes live from the
phone, and the VIP member sees the phone's camera.

Recording: no recorder runs here (LiveKit's recorder is a separate service), so the first
session shows what happens when one cannot start: the session carries on, unrecorded. Then a
finished recording is reported the way the live video server reports one, signed with its
secret, and the job that follows hands the file to the video host and makes the draft lesson.

The video goes through LiveKit's own open-source server, run here (live_server.py). Chrome's
made-up camera and microphone stand in for real ones. Everything else is the local backend (a
real Postgres with Floor's migrations) and the web app's own server routes.

Needs what the other walk-throughs need, and the LiveKit server (see live_server.py). Build both
apps first (bash shown):

    cd web
    NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8095 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=stand-in \\
      NEXT_PUBLIC_SITE_URL=http://127.0.0.1:8096 npx next build
    cd ../mobile
    EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:8095 EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=stand-in \\
      EXPO_PUBLIC_SITE_URL=http://127.0.0.1:8096 npx expo export --platform web --output-dir dist-stand-in
    python ../checks/web_live.py

Pictures land in `checks/out/`, named `live-*`. The script exits with an error if a check fails.
"""

from playwright.sync_api import sync_playwright

import base64
import hashlib
import hmac
import json
import time
import urllib.error
import urllib.request

import fake_video_host
import fixtures
import live_server
import local_db
import local_services
import local_supabase
from common import MOBILE, OUT, Phone, check, check_gone, check_soon, check_visible, clear_pictures, finish, open_phone, serve

DIST = MOBILE / "dist-stand-in"
PORT = 8094
PHONES = f"http://127.0.0.1:{PORT}"
LAPTOP = local_services.WEB

# Media in a browser is chatty: a closed room, a track that ends, a refused screen share, and
# the data links every participant has, which close with errors when the mentor ends the room.
EXPECTED_NOISE = ("Failed to load resource", "net::ERR_", "livekit", "LiveKit", "websocket", "WebSocket", "could not", "signal", "publication", "RTC", "DataChannel", "data channel")

# A phone's live room asks how the session stands every 20 seconds.
SOON = 30

PLAYING = """(label) => {
  const video = document.querySelector(`video[aria-label="${label}"]`);
  return Boolean(video && video.videoWidth > 0 && video.readyState >= 2 && !video.paused);
}"""


# Where recordings would be written. Nothing listens there: the recorder never starts here.
RECORDINGS = {
    "RECORDINGS_S3_ENDPOINT": "http://127.0.0.1:9/storage/v1/s3",
    "RECORDINGS_S3_REGION": "local",
    "RECORDINGS_S3_ACCESS_KEY": "local-access",
    "RECORDINGS_S3_SECRET": "local-recordings-secret",
}


def signed_webhook(event: dict) -> None:
    """Sends Floor's server a message the way the live video server does: the body, and a token
    signed with the server's secret that carries the body's fingerprint."""
    body = json.dumps(event).encode()
    part = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b"=").decode()
    now = int(time.time())
    claims = {"iss": live_server.KEY, "nbf": now - 10, "exp": now + 600, "sha256": base64.b64encode(hashlib.sha256(body).digest()).decode()}
    unsigned = f"{part({'alg': 'HS256', 'typ': 'JWT'})}.{part(claims)}"
    signature = base64.urlsafe_b64encode(hmac.new(live_server.SECRET.encode(), unsigned.encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
    request = urllib.request.Request(
        LAPTOP + "/api/live/webhook", data=body, method="POST",
        headers={"Authorization": f"{unsigned}.{signature}", "Content-Type": "application/webhook+json"},
    )
    urllib.request.urlopen(request, timeout=10).read()


def run_jobs() -> None:
    request = urllib.request.Request(LAPTOP + "/api/jobs/run", headers={"Authorization": "Bearer local-cron-secret"})
    urllib.request.urlopen(request, timeout=30).read()


def main() -> None:
    livekit = live_server.start()
    services = local_services.start({**live_server.SETTINGS, **RECORDINGS})
    phones = serve(DIST, PORT)
    clear_pictures("live-")

    kay = fixtures.person("kay@example.com", "Kay")
    space = fixtures.space(kay, "Gold Desk", "gold-desk")
    vee = fixtures.person("vee@example.com", "Vee")
    bola = fixtures.person("bola@example.com", "Bola")
    for person in (vee, bola):
        fixtures.join(person, "gold-desk")
    fixtures.vip(space, vee, 30)

    def session() -> dict:
        return local_db.rows("select * from public.live_sessions where space_id = %s order by created_at desc limit 1", [space])[0]

    problems: list[str] = []
    try:
        with sync_playwright() as p:
            browser, laptop = open_phone(p, problems, ignore=EXPECTED_NOISE, laptop=True, media=True)

            def button(name: str):
                return laptop.get_by_role("button", name=name, exact=True)

            def shot(name: str) -> None:
                laptop.wait_for_timeout(600)
                laptop.screenshot(path=str(OUT / f"live-laptop-{name}.png"), full_page=True)

            print("The mentor goes live on the laptop")
            laptop.goto(LAPTOP + "/mentor", wait_until="networkidle")
            laptop.get_by_label("Email", exact=True).fill("kay@example.com")
            button("Send code").click()
            laptop.get_by_label("Code", exact=True).fill(local_supabase.THE_CODE)
            laptop.get_by_role("tab", name="Live").click()
            check_visible("the Live tab offers going live", laptop.get_by_role("heading", name="Go live now"))
            laptop.get_by_label("What it is about").fill("Gold at the London open")
            button("Go live").click()
            check_visible("the session is live", laptop.get_by_text("● Live now"), 8)
            check("and the database says so", session()["status"] == "live")
            check_soon("the laptop's camera goes out", lambda: laptop.evaluate(PLAYING, "What your members see"), 15)
            check_visible("nobody is watching yet", laptop.get_by_text("Nobody is watching yet"))
            check("with no recorder running, the session carries on unrecorded", session()["recording_status"] == "failed")
            shot("1-live")

            print("A VIP member watches on the phone")
            vip = Phone(p, PHONES, "live-vip-", problems, ignore=EXPECTED_NOISE, media=True)
            vip.sign_in("vee@example.com")
            check_visible("the Feed says the mentor is live", vip.text("Gold at the London open"), 10)
            vip.button("Join session").click()
            check("the live room opens", vip.at("/live"))
            check_soon("the member sees the broadcast", lambda: vip.page.evaluate(PLAYING, "Live video"), 20)
            check_soon("and hears it: the mentor's microphone plays on the page", lambda: vip.page.evaluate("document.querySelectorAll('audio[data-live-sound]').length") >= 1, 10)
            check_visible("the laptop counts one watching", laptop.get_by_text("1 watching"), 10)
            vip.shot("1-room")

            print("The session's chat")
            vip.field("Message").fill("Is the entry at 2,650?")
            vip.button("Send").click()
            check_visible("the member's message shows in the room", vip.text("Is the entry at 2,650?"))
            check_visible("and on the mentor's laptop", laptop.get_by_text("Is the entry at 2,650?"), 10)

            print("Sharing the screen")
            button("Share screen").click()
            check_visible("the mentor shares the screen", button("Stop sharing"), 10)
            check_soon("and the member still sees the broadcast", lambda: vip.page.evaluate(PLAYING, "Live video"), 15)
            shot("2-screen")
            button("Stop sharing").click()

            print("Sound only")
            vip.page.get_by_role("switch", name="Sound only").click()
            check_visible("the member can switch to sound only", vip.text("Sound only, to save data."))
            check_gone("and the pictures stop", vip.page.locator('video[aria-label="Live video"]'))
            vip.shot("2-sound-only")
            vip.page.get_by_role("switch", name="Sound only").click()
            check_soon("switching back brings the pictures back", lambda: vip.page.evaluate(PLAYING, "Live video"), 15)

            print("A free member")
            free = Phone(p, PHONES, "live-free-", problems, ignore=EXPECTED_NOISE)
            free.sign_in("bola@example.com")
            check_visible("a free member sees the session is on", free.text("Gold at the London open"), 10)
            check_visible("and that it is for VIP", free.text("For VIP members", exact=True))
            check_gone("with no way in", free.button("Join session"))
            free.shot("1-feed")
            free.close()

            print("The mentor ends the session")
            laptop.get_by_role("button", name="End session", exact=True).click()
            check_visible("the laptop offers going live again", laptop.get_by_role("heading", name="Go live now"), 10)
            check("the session is over", session()["status"] == "ended")
            check_visible("the member's room says so", vip.text("This session has ended"), SOON)
            check_visible("and its chat is closed", vip.text("The session has ended, so its chat is closed."))
            vip.shot("3-ended")
            browser.close()

            print("A finished recording becomes a draft lesson")
            ended = session()
            path = f"{space}/{ended['id']}.mp4"
            local_db.run("insert into storage.objects (bucket_id, name) values ('recordings', %s)", [path])
            local_supabase.files[("recordings", path)] = (services.film, "video/mp4")
            signed_webhook({
                "event": "egress_ended",
                "id": "EV_local",
                "createdAt": str(int(time.time())),
                "egressInfo": {
                    "egressId": "EG_local",
                    "roomName": str(ended["id"]),
                    "status": "EGRESS_COMPLETE",
                    "fileResults": [{"filename": path, "size": str(len(services.film))}],
                },
            })
            check("the server takes the report and queues the recording", session()["recording_status"] == "saving")
            try:
                urllib.request.urlopen(urllib.request.Request(LAPTOP + "/api/live/webhook", data=b"{}", method="POST", headers={"Authorization": "made-up"}), timeout=10)
                check("an unsigned report is turned away", False)
            except urllib.error.HTTPError as refused:
                check("an unsigned report is turned away", refused.code == 401)
            run_jobs()
            after = session()
            check("the recording is saved", after["recording_status"] == "saved")
            lesson = local_db.rows("select l.*, m.title as module from public.lessons l join public.modules m on m.id = l.module_id where l.id = %s", [after["lesson_id"]])
            check("as a draft lesson in Live recordings", bool(lesson) and lesson[0]["module"] == "Live recordings" and lesson[0]["published_at"] is None)
            check("named after the session", bool(lesson) and lesson[0]["title"] == "Gold at the London open")
            fetched = [video for video in fake_video_host.videos.values() if "recordings" in str(video.get("fetched_from"))]
            check("the video host fetched the file from a signed address", len(fetched) == 1)
            check("the lesson has that video", bool(lesson) and lesson[0]["video_id"] in fake_video_host.videos)
            check("the file is removed a day later", local_db.value("select count(*) from private.outbox where kind = 'files_delete' and payload->'paths' ? %s and run_after > now() + interval '23 hours'", [path]) == 1)

            print("The mentor goes live from the phone")
            mentor = Phone(p, PHONES, "live-mentor-", problems, ignore=EXPECTED_NOISE, media=True)
            mentor.sign_in("kay@example.com")
            mentor.page.get_by_role("tab", name="Manage").click()
            mentor.button("Go live").click()
            check("Live opens", mentor.at("/manage/live"))
            mentor.field("What it is about").fill("Quick update from my phone")
            mentor.button("Go live").click()
            check("the room opens for the mentor", mentor.at("/live"))
            check_soon("the phone's camera goes out", lambda: mentor.page.evaluate(PLAYING, "Live video"), 20)
            check_visible("the mentor can turn the microphone off", mentor.page.get_by_role("switch", name="Microphone"))
            check_visible("and the camera", mentor.page.get_by_role("switch", name="Camera"))
            mentor.shot("1-broadcast")

            vip.page.goto(PHONES + "/", wait_until="networkidle")
            vip.button("Join session").click()
            vip.at("/live")
            check_soon("the member sees the phone's camera", lambda: vip.page.evaluate(PLAYING, "Live video"), 20)
            check_visible("the mentor's phone counts one watching", mentor.text("1 watching"), 10)
            check_gone("a member is not shown a count", vip.text("watching"))
            vip.shot("4-phone-broadcast")

            mentor.button("End session").click()
            mentor.button("Yes, end it").click()
            check_visible("the mentor ends it from the phone", mentor.text("This session has ended"), 10)
            check("the session is over", session()["status"] == "ended")
            mentor.close()
            vip.close()
    finally:
        phones.shutdown()
        services.stop()
        livekit.kill()
    finish(problems)


if __name__ == "__main__":
    main()
