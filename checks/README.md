# Checks

Scripts that walk both apps in Chrome, check each step on screen and in the database, and save
a picture of every screen to `checks/out/`.

They are run on the build side. They need Python with Playwright, psycopg and Pillow, Google
Chrome, PostgreSQL and ffmpeg.

## Build first

Both apps are built once, pointed at the local stand-ins. The values only matter while building.

```bash
cd web
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8095 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=stand-in \
  NEXT_PUBLIC_SITE_URL=http://127.0.0.1:8096 npx next build

cd ../mobile
npx expo export --platform web                       # the sample space, into dist/
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:8095 EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=stand-in \
  EXPO_PUBLIC_SITE_URL=http://127.0.0.1:8096 npx expo export --platform web --output-dir dist-stand-in
```

## Run

From `mobile/` or `web/`, one at a time (they share ports):

| Script | Walks | Runs on |
| --- | --- | --- |
| `phone_sample.py` | The sample space: every screen built so far, seen as its mentor, a VIP member and someone who has not paid, and the three themes. Also the live room, the schedule and a class added and a session ended | nothing: the sample's own stand-in for the backend, inside the app |
| `web_live.py` | Live with real video: the mentor broadcasts from the laptop with camera, microphone and screen, a VIP member watches and chats on the phone and switches to sound only, a free member is kept out, the session ends; a finished recording becomes a draft lesson; then the mentor broadcasts from the phone | LiveKit's open-source server, run here (`live_server.py` says how to build it), and the local backend |
| `phone_sign_in.py` | Sign-in, starting a space, a second phone taking over | the scripted stand-in |
| `web_join.py` | The join page: sign-in, joining, proof, invite codes | the scripted stand-in |
| `phone_mentor.py` | The mentor's tools: queue, price, codes, members, logo | the real database |
| `phone_feed.py` | The Feed as mentor, VIP member and free member | the real database |
| `phone_learn.py` | Learn and Protection: upload, watch, progress | the real database, server routes, video host stand-in |
| `web_mentor.py` | The mentor's laptop page: course and video upload | the real database, server routes, video host stand-in |
| `phone_alerts.py` | Alerts: who is told when a setup is posted, a member's switches, signing out | the real database, server routes, notification stand-in |
| `web_safety.py` | Reporting a space, Floor suspending and restoring it, and deleting an account | the real database, server routes, and the phone app |
| `phone_teasers.py` | Telegram teasers: connecting a channel, what the bot announces and what it keeps back, switches, a test, and the bot being removed | the real database, server routes, Telegram stand-in |
| `phone_chat.py` | Groups, with four people on their own phones: writing, the link and number filter, names, pictures, groups for staff and by invitation, report, block, mute, delete | the real database |

```bash
python ../checks/phone_feed.py
```

A script exits with an error if any check fails.

## What stands in for what

| File | Stands in for | How faithful |
| --- | --- | --- |
| `local_db.py` | The database | It is a real Postgres with Floor's migrations |
| `local_supabase.py` | Supabase's sign-in, table API, functions and file storage | Requests run as the signed-in person under the real rules. Sign-in takes any email and the code `123456` |
| `fake_video_host.py` | The video host | Checks upload tickets and playback addresses with its own copy of the host's rules, and serves a real short film in pieces |
| `fake_push.py` | The notification service | Keeps every alert it is sent. Answers "this phone no longer has the app" for addresses with `gone` in them. A browser cannot get a phone's address, so walk-throughs put addresses in the database directly |
| `fake_telegram.py` | Telegram's Bot API | Refuses a wrong token, a bad webhook secret and an empty message. Keeps what the bot posted and took down. Plays Telegram's other part too: it calls Floor's webhook with the registered secret, or with a wrong one on request, and can refuse a chat the way Telegram does when the bot was removed |
| `stand_in.py` | Supabase, scripted | Answers whatever a walk-through tells it to. For cases a real database will not produce on demand |

`local_services.py` starts the backend, the stand-ins and Floor's own server together, for the
walk-throughs that need server routes. `quiet.py` is the web server they all run on.

`make_sample_assets.py` is not a check. It makes the pictures and the short film the sample
space shows, into `mobile/assets/sample/`.

Nothing a check opens leaves this machine. A page from another site, such as YouTube's player in a
post, is answered with an empty page, so no result depends on the network. To do that, every request
a browser makes passes through the script. So a script never sleeps while it waits for the app: it
waits with `common.pause`, which lets the browsers carry on.

The phone app's web build has no live connection, so in `phone_chat.py` a phone learns of a new
message by asking every few seconds. On a real phone the same question is asked the moment another
phone says something changed.
