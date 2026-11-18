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
| `phone_sample.py` | The sample space in all three themes | nothing: no backend |
| `phone_sign_in.py` | Sign-in, starting a space, a second phone taking over | the scripted stand-in |
| `web_join.py` | The join page: sign-in, joining, proof, invite codes | the scripted stand-in |
| `phone_mentor.py` | The mentor's tools: queue, price, codes, members, logo | the real database |
| `phone_feed.py` | The Feed as mentor, VIP member and free member | the real database |
| `phone_learn.py` | Learn and Protection: upload, watch, progress | the real database, server routes, video host stand-in |
| `web_mentor.py` | The mentor's laptop page: course and video upload | the real database, server routes, video host stand-in |
| `phone_alerts.py` | Alerts: who is told when a setup is posted, a member's switches, signing out | the real database, server routes, notification stand-in |

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
| `stand_in.py` | Supabase, scripted | Answers whatever a walk-through tells it to. For cases a real database will not produce on demand |

`local_services.py` starts the backend, the stand-ins and Floor's own server together, for the
walk-throughs that need server routes.

Nothing a check opens leaves this machine. A page from another site, such as YouTube's player in a
post, is answered with an empty page, so no result depends on the network.
