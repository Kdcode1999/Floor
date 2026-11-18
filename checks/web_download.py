"""Walks where people get Floor on their phone: the download page, and the release the Android
app checks when it opens.

The web app's own server runs with this walk's release settings. Nothing else is needed: the
page and the endpoint read nothing from the database.

Needs Python with Playwright and Google Chrome. Build the web app first (bash shown):

    cd web
    NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8095 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=stand-in \\
      NEXT_PUBLIC_SITE_URL=http://127.0.0.1:8096 npx next build
    python ../checks/web_download.py

Pictures land in `checks/out/`, named `download-*`. The script exits with an error if a check fails.
"""

import json
import urllib.request

from playwright.sync_api import sync_playwright

from common import OUT, check, check_visible, clear_pictures, finish, open_phone, start_web, stop_web

PORT = 8096
BASE = f"http://127.0.0.1:{PORT}"
APK = "https://downloads.example.com/floor-1.2.0.apk"


def main() -> None:
    web = start_web(PORT, {
        "ANDROID_APK_URL": APK,
        "ANDROID_VERSION_NAME": "1.2.0",
        "ANDROID_VERSION_CODE": "12",
        "ANDROID_MIN_VERSION_CODE": "9",
        "ANDROID_NOTES": "Live sessions with video.",
    })
    clear_pictures("download-")
    problems: list[str] = []
    try:
        print("The release the app checks")
        answer = urllib.request.urlopen(BASE + "/api/android")
        release = json.loads(answer.read())
        check("it names the download, the build and the oldest build still allowed", release == {
            "versionName": "1.2.0", "versionCode": 12, "minimumVersionCode": 9, "url": APK, "notes": "Live sessions with video.",
        })
        check("anyone may ask, from anywhere", answer.headers.get("Access-Control-Allow-Origin") == "*")

        with sync_playwright() as p:
            browser, page = open_phone(p, problems)
            print("The download page")
            page.goto(BASE + "/download", wait_until="networkidle")
            link = page.get_by_role("link", name="Download Floor for Android")
            check_visible("it offers the Android app", link)
            check("which downloads the current release", link.get_attribute("href") == APK)
            check_visible("it says which version", page.get_by_text("Version 1.2.0. Live sessions with video."))
            check_visible("and how to install it from outside the Play Store", page.get_by_text("allow installing apps from your browser", exact=False))
            check_visible("it has a place for iPhone", page.get_by_role("heading", name="iPhone"))
            page.screenshot(path=str(OUT / "download-1-page.png"), full_page=True)
            browser.close()
    finally:
        stop_web(web)
    finish(problems)


if __name__ == "__main__":
    main()
