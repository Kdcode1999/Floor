"""Walks Floor as the iPhone web app: in Safari, then added to the home screen, with alerts.

In Safari the Feed explains how to put Floor on the Home Screen, and alerts say they need it.
Opened from the home screen, the member turns alerts on, and the web app gives Floor its push
address. The mentor posts a setup, and Floor's server sends the alert, signed and encrypted,
to the push service, where it is decrypted and read: the words the iPhone would show.

Chrome stands in for Safari. It is told to look like an iPhone, and, for the home-screen part,
to say it runs as an app of its own. Its push subscription is answered by a stand-in for
Apple's push service (fake_web_push.py), the one thing that cannot run here. Everything else
is the local backend (a real Postgres with Floor's migrations) and the web app's own server.

The script makes its own key pair for the run and its own build of the phone app with that key
in it (dist-webapp/), so it needs no settings. The web app must be built (bash shown):

    cd web
    NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8095 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=stand-in \\
      NEXT_PUBLIC_SITE_URL=http://127.0.0.1:8096 npx next build
    cd ../mobile
    python ../checks/phone_webapp.py

Pictures land in `checks/out/`, named `webapp-*`. The script exits with an error if a check fails.
"""

import json
import os
import subprocess
import tempfile
import urllib.request

from playwright.sync_api import sync_playwright

import fake_web_push
import fixtures
import local_db
import local_services
from common import MOBILE, WEB, Phone, check, check_gone, check_soon, check_visible, clear_pictures, finish, serve

DIST = MOBILE / "dist-webapp"
PORT = 8094
PUSH_PORT = 8101
BASE = f"http://127.0.0.1:{PORT}"

EXPECTED_NOISE = ("Failed to load resource",)

IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"


def home_screen_app(subscription: dict) -> str:
    """What makes Chrome look like Floor opened from an iPhone's home screen: it says it runs on
    its own, it asks before showing alerts, and its push subscription is the stand-in's."""
    return f"""
      Object.defineProperty(navigator, 'standalone', {{ get: () => true }});
      let allowed = 'default';
      Object.defineProperty(Notification, 'permission', {{ get: () => allowed }});
      Notification.requestPermission = async () => (allowed = 'granted');
      const made = {json.dumps(subscription)};
      let current = null;
      PushManager.prototype.getSubscription = async function () {{ return current; }};
      PushManager.prototype.subscribe = async function (options) {{
        window.__floorPushKey = options && options.applicationServerKey ? options.applicationServerKey.length : 0;
        current = {{ toJSON: () => made, endpoint: made.endpoint }};
        return current;
      }};
    """


def main() -> None:
    folder = tempfile.mkdtemp()
    keys = json.loads(subprocess.run(
        ["node", "-e", "console.log(JSON.stringify(require('web-push').generateVAPIDKeys()))"],
        cwd=WEB, check=True, capture_output=True, text=True,
    ).stdout)

    print("Building the phone app with this run's key")
    subprocess.run(
        ["npx", "expo", "export", "--platform", "web", "--output-dir", str(DIST)],
        cwd=MOBILE, check=True, capture_output=True,
        env={**os.environ, "CI": "1", "EXPO_PUBLIC_SUPABASE_URL": "http://127.0.0.1:8095", "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY": "stand-in",
             "EXPO_PUBLIC_SITE_URL": local_services.WEB, "EXPO_PUBLIC_VAPID_PUBLIC_KEY": keys["publicKey"]},
    )

    push = fake_web_push.start(PUSH_PORT, folder)
    services = local_services.start({
        "VAPID_PUBLIC_KEY": keys["publicKey"],
        "VAPID_PRIVATE_KEY": keys["privateKey"],
        "VAPID_SUBJECT": "mailto:alerts@example.com",
        # The stand-in's certificate was made for this run. Only this server process trusts it blindly.
        "NODE_TLS_REJECT_UNAUTHORIZED": "0",
    })
    phones = serve(DIST, PORT)
    clear_pictures("webapp-")

    kay = fixtures.person("kay@example.com", "Kay")
    space = fixtures.space(kay, "Gold Desk", "gold-desk")
    vee = fixtures.person("vee@example.com", "Vee")
    fixtures.join(vee, "gold-desk")
    fixtures.vip(space, vee, 30)
    browser_keys = fake_web_push.Subscriber("vee")

    problems: list[str] = []
    try:
        with sync_playwright() as p:
            print("The home-screen files")
            manifest = json.loads(urllib.request.urlopen(BASE + "/manifest.webmanifest").read())
            check("the manifest names Floor and opens it on its own", manifest["name"] == "Floor" and manifest["display"] == "standalone")
            check("with icons", all(urllib.request.urlopen(BASE + icon["src"]).status == 200 for icon in manifest["icons"]))
            page = urllib.request.urlopen(BASE + "/").read().decode()
            check("the page tells an iPhone it can run full screen", 'name="apple-mobile-web-app-capable" content="yes"' in page and 'rel="apple-touch-icon"' in page)
            check("and links the manifest", 'rel="manifest" href="/manifest.webmanifest"' in page)

            print("In Safari")
            safari = Phone(p, BASE, "webapp-safari-", problems, ignore=EXPECTED_NOISE, user_agent=IPHONE)
            safari.sign_in("vee@example.com")
            check_visible("the Feed says how to put Floor on the Home Screen", safari.text("Put Floor on your Home Screen"))
            check_visible("and where to tap", safari.text("Tap Share at the bottom of Safari, then Add to Home Screen", exact=False))
            check_gone("it does not offer alerts Safari cannot give", safari.button("Turn on alerts"))
            safari.shot("1-feed")
            safari.page.get_by_role("button", name="Account. You are: VIP").click()
            safari.button("Alerts").click()
            check_visible("Alerts says they need the Home Screen", safari.text("On iPhone, alerts work once Floor is on your Home Screen", exact=False))
            safari.button("Back").click()
            safari.page.goto(BASE + "/", wait_until="networkidle")
            safari.button("Not now").first.click()
            check_gone("the card can be put off", safari.text("Put Floor on your Home Screen"))
            safari.page.reload(wait_until="networkidle")
            check_gone("and stays away", safari.text("Put Floor on your Home Screen"))
            safari.close()

            print("Opened from the Home Screen")
            app = Phone(p, BASE, "webapp-app-", problems, ignore=EXPECTED_NOISE, user_agent=IPHONE, init_script=home_screen_app(browser_keys.subscription(PUSH_PORT)))
            app.sign_in("vee@example.com")
            check_gone("there is nothing to add any more", app.text("Put Floor on your Home Screen"))
            check_visible("alerts are offered", app.button("Turn on alerts"))
            app.shot("1-feed")
            app.button("Turn on alerts").click()
            check_gone("turning them on", app.button("Turn on alerts"), 8)
            check_soon("registers Floor's service worker", lambda: app.page.evaluate("navigator.serviceWorker.getRegistration('/').then((found) => Boolean(found))"), 8)
            check("the browser is given Floor's public key", app.page.evaluate("window.__floorPushKey") == 65)
            saved = local_db.rows("select token, platform from public.push_tokens where user_id = %s", [vee])
            check("Floor keeps the web app's push address", len(saved) == 1 and saved[0]["platform"] == "web" and json.loads(saved[0]["token"])["endpoint"].endswith("/push/vee"))

            print("An alert")
            mentor = Phone(p, BASE, "webapp-mentor-", problems, ignore=EXPECTED_NOISE)
            mentor.sign_in("kay@example.com")
            mentor.page.get_by_role("tab", name="Manage").click()
            mentor.button("New post").click()
            mentor.at("/compose")
            mentor.page.get_by_role("radio", name="Trade setup", exact=True).click()
            mentor.field("Pair").fill("XAUUSD")
            mentor.page.get_by_role("radio", name="Buy").click()
            mentor.field("Entry").fill("2650")
            mentor.field("Stop").fill("2630")
            mentor.field("Target 1").fill("2690")
            mentor.button("Post").click()
            check_soon("the alert reaches the push service", lambda: len(fake_web_push.received.get("vee", [])) == 1, 15)
            alert = (fake_web_push.received.get("vee") or [{}])[0]
            check("decrypted with the phone's own key, it reads as the alert", alert.get("title") == "Gold Desk" and alert.get("body") == "New setup: XAUUSD · Buy")
            check("and says what to open", (alert.get("data") or {}).get("type") == "setup")
            check("signed by Floor's key", (fake_web_push.signed_by.get("vee") or [""])[0].endswith(f"k={keys['publicKey']}"))
            mentor.close()
            app.close()
    finally:
        phones.shutdown()
        services.stop()
        push.shutdown()
    finish(problems)


if __name__ == "__main__":
    main()
