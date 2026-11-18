# How Floor is put together

A map of the code for whoever works on it next. `PRODUCT.md` says what Floor is, `DECISIONS.md`
says why it is built this way, `STATUS.md` says how far the build is.

## The pieces

| Piece | Where | What it does |
| --- | --- | --- |
| Database | `web/supabase/migrations/` | Every table, every rule about who may do what, and every privileged change, as SQL |
| Phone app | `mobile/` (Expo) | What members, mentors and admins use |
| Web app | `web/` (Next.js on Vercel) | The join page, and the pages a mentor uses on a laptop |
| Server routes | `web/src/app/api/` | The few jobs that need a secret key. Called by both apps |
| Checks | `checks/` | Scripts that walk both apps in Chrome against a real database |

Supabase provides accounts, the Postgres database, file storage and live updates.

## Rules the code follows

1. **The database is the gatekeeper.** Row level security is on for every table. The apps can only
   read what the rules allow, whatever the app's own code does. A bug in a screen cannot leak
   paid content.
2. **Privileged changes are database functions.** Role, VIP date, status, anything that costs or
   earns money: the apps call a function (`approve_request`, `grant_vip`, `ban_member`), and the
   function checks who is asking. The apps cannot write those columns.
3. **A read that needs two tables is a database function too** (`my_spaces`, `list_members`).
   Everything else the apps read is one table with plain filters. So every query the apps make is
   either trivial or tested SQL.
4. **Secrets live only in server routes.** The phone app and the browser hold the publishable
   key and the person's own login, nothing else.
5. **Screens hold no rules.** A screen asks the database and shows the answer. Wording and
   small calculations live in `logic.ts` files with tests.

## Phone app (`mobile/src`)

| Folder | Holds |
| --- | --- |
| `app/` | The screens, one file per screen (expo-router). `_layout.tsx` decides who sees which group |
| `auth/` | Sign-in by emailed code, the one-login rule, what to show while held |
| `space/` | The space being shown and the viewer's place in it. Themes the whole app |
| `features/<name>/` | One folder per feature: `api.ts` (what it asks the database), `logic.ts` (wording and sums), its own components |
| `components/` | The shared glass parts: `Screen`, `Card`, `Button`, `TextField`, `Chips`, `Avatar` |
| `theme/` | The three themes as plain values |
| `lib/` | Small helpers: the backend every screen talks to (`database.ts`), secure storage, formatting, `useLoad`, `useAction` |
| `sample/` | The sample space: a stand-in for the backend that answers from memory. See below |

A screen loads with `useLoad(() => api.loadX(...), key)` and acts with `useAction()`. An action
resolves with a sentence to show when it failed, or null.

Screens inside a tab live under `app/(tabs)/`. Screens that take the whole phone (writing a post,
a picture, a group's conversation, later a live session) are files directly in `app/` and open
over the tabs. So is any screen that opens from more than one place, such as a member's page or
the lesson editor: Back then returns to wherever it was opened from.

A few screens inside the Manage tab are also opened from another tab: the course from Learn, the
groups from Chat, and two from a tapped alert. Those links are pushed with `withAnchor`, which
puts Mentor home underneath, so Back goes to Manage instead of nowhere in particular.

An open group is kept current by `features/chat/useConversation.ts`. It asks the database what
changed since the newest thing it holds, at once when another phone nudges (`live.ts`), and every
few seconds otherwise. How long it waits is `waitFor` in `features/chat/logic.ts`.

### The sample space (`mobile/src/sample`)

With `mobile/.env` empty there is no backend to talk to, and the app runs on a sample space
instead: one made-up mentor's community with members, posts, a course, groups and everything a
mentor manages. Every screen works in it, and the Account screen switches whose eyes it is seen
through: the mentor's, a VIP member's, or someone's who has not paid.

Screens do not know the difference. They ask `database` from `lib/database.ts`, which is the
Supabase client when the app is connected and the sample's stand-in when it is not. Calls to
Floor's server go the same way, through `callServer`.

| File | Holds |
| --- | --- |
| `world.ts` | The tables, shaped and named as the database's are |
| `seed.ts`, `people.ts` | What the sample holds when the app starts, counted back from now |
| `rules.ts` | Who may do what, following the database's `private.*` functions |
| `functions/` | One function for each database function the app calls, under the same name |
| `tables.ts`, `storage.ts` | The tables and file stores the app reads directly, each with its rule |
| `server.ts` | Floor's server routes |
| `backend.ts` | Puts those together behind the parts of the Supabase client the app uses |
| `session.ts` | Whose eyes the sample is seen through |
| `client.ts`, `assets.ts` | The one sample space the app runs on, and the pictures and film that come with it |

Three things keep it honest:

- **It guards nothing.** The rules that protect paid content are the database's, tested in
  `web/supabase/tests`. The sample follows them so that it looks and behaves like the real thing.
- **It cannot fall behind.** `tests/sampleBackend.test.ts` reads the app's source and fails when
  a screen calls a database function, table, file store or server route the sample cannot
  answer. A new one is added to the sample in the same change.
- **It never ships.** A build that has its settings drops the sample and its files altogether,
  and a release build made without settings shows an error instead of the sample.

Where the sample cannot do what the real thing does (take a video, reach Telegram, delete an
account), the screen says so in place, with `features/sample/SampleNote`.

## Web app (`web/src`)

| Folder | Holds |
| --- | --- |
| `app/[slug]/` | A space's join page. The server reads only what anyone may know about the space |
| `features/join/` | Sign-in, joining, paying with proof, invite codes, all in the visitor's browser |
| `app/mentor/`, `features/mentor/` | The mentor's laptop page: the course and video upload, and going live with a shared screen |
| `app/account/`, `features/account/` | A person's own account on the web: deleting it |
| `app/admin/`, `features/admin/` | Floor's own page: reports, suspending and restoring a space |
| `features/session/` | Sign-in by emailed code for the pages staff use |
| `app/api/`, `server/` | Floor's server. See below |
| `components/`, `theme/` | The same look as the phone app, as CSS |

Files both apps need (the themes, the sign-in messages, Learn's logic, the wording for deleting
an account, and getting VIP: proof files and invite codes) are kept in both. A test in `web/` fails when the copies differ.

### Floor's server (`web/src/app/api`, `web/src/server`)

| Route | Who calls it | What it does |
| --- | --- | --- |
| `POST /api/video/upload` | staff | Makes a place for a lesson's video at the video host, answers with an upload ticket |
| `POST /api/video/status` | staff | Asks the host how a video is doing and records it |
| `POST /api/video/play` | someone who may watch | Answers with a signed address for the video |
| `POST /api/video/webhook` | the video host | Hears that a video changed, then asks the host itself |
| `POST /api/jobs/run` | any signed-in app, and Vercel's timer | Does the jobs waiting in the queue |
| `POST /api/account/delete` | anyone signed in | Deletes their account, and their space if they run one |
| `POST /api/telegram/start` | the mentor | Answers with the bot's name and the code to post in their channel. Registers the webhook with Telegram if this copy of the server has not yet |
| `POST /api/live/join` | VIP members and staff | Asks the database whether the room opens for them, answers with a pass into the video room. Starts the recording when the broadcaster arrives |
| `POST /api/live/end` | staff | Ends the session and closes the video room |
| `POST /api/live/webhook` | the live video server | Checks the signature, then takes a finished recording into the queue |
| `POST /api/telegram/webhook` | Telegram | Checks the secret word, then acts on what the bot saw: a code posted in a chat connects it, being removed is noted |

Every route follows the same steps: take the person's login from the request, ask the database
*as that person* whether they may (a function such as `lesson_playback`), and only then use a
secret. `server/` cannot be imported from code that runs in a browser.

The files in `server/`: `env.ts` (the secret settings), `supabase.ts` (the database as the person,
or with the secret key), `http.ts` (reading requests, wording refusals), `bunny.ts` (everything
asked of the video host), `jobs.ts` (the queue's handlers), `push.ts` (everything asked of the
notification service), `alertWords.ts` (what an alert says and who may get it), `telegram.ts`
(everything asked of Telegram, as Floor's bot), `teaserWords.ts` (what a notice says, and how the
bot reads what it is told) and `teasers.ts` (posting a notice, and acting on an update).

### Jobs the server does from the queue

| Job | Queued by | What happens |
| --- | --- | --- |
| `alert` | `create_post` for a setup, `publish_lesson`, `settle_payment`, `note_payment_problem` | The server words the alert, asks the database who gets it (`alert_recipients`) and sends it |
| `push_receipts` | the server, 30 minutes after an alert | Asks which phones took the alert and forgets the ones that are gone |
| `video_delete` | `delete_lesson`, `erase_account` | Removes the video from the video host |
| `payment_check` | `start_payment`, for ten minutes later | Asks the processor about a payment nobody has confirmed yet |
| `files_delete` | `erase_account`, `delete_message`, `delete_group` | Removes files from the file store |
| `telegram` | a new post or setup, a lesson being published, `telegram_test` | Words a notice from what a free member would see and posts it in the space's Telegram chat |

Every job carries `actor`: who caused it. An alert leaves that person out.

## Database (`web/supabase`)

- `migrations/` is the database. A migration that has been pushed is never edited: changes go in
  a new file.
- `tests/` applies the migrations to an in-memory Postgres and checks who can do what. `npm test`
  in `web/`.
- Helper functions used by rules live in the `private` schema, which the API does not expose.
- Errors raised for the apps are short codes (`not_allowed`, `banned`). The apps turn a code into
  a sentence.
- `private.outbox` is the queue of jobs for Floor's server (alerts, Telegram, clean-up). Functions
  add to it with `private.enqueue`. The server takes jobs with `claim_outbox` and reports back with
  `finish_outbox`, both open to the secret key only.
- `reports` and `suspensions` are Floor's own. A member writes a report through `report_space`.
  Only Floor's team (`platform_admins`) reads reports or changes a space's status, through
  `admin_reports`, `suspend_space` and `restore_space`. A space's staff can read the note Floor
  left them, and nothing else.
- Deleting an account is two steps on the server: `erase_account` deletes the space the person
  owns and queues the removal of files and videos, then Supabase deletes the account, which
  takes with it every row that points at it.
- `groups`, `messages`, `group_members`, `group_reads`, `blocks` and `message_reports` are chat. The
  apps never read them directly: `my_groups` lists what a person may see, `chat_page` and
  `chat_changes` give the messages, `send_message` is the only way to write one. The link and
  number filter is `private.has_link` and `private.has_phone`, and the same two also guard names.
  `private.can_read_group` is the one rule for who opens a group, used by every function and by
  the file store for pictures (`chat` bucket, `<space>/<group>/<file>`).
- `telegram_links` ties a space to the Telegram chat Floor's bot posts in. Nothing reads it but
  functions: the mentor's (`telegram_status`, `telegram_start`, `telegram_set`, `telegram_test`,
  `telegram_disconnect`) and the server's (`telegram_connect`, `telegram_target`,
  `telegram_result`, `telegram_left`). Triggers on `posts` and `lessons` queue the notices.
- `push_tokens` holds each account's one address for alerts. Nothing reads it but functions: the
  app saves and removes its own (`save_push_token`, `remove_push_token`), the server asks who to
  alert (`alert_recipients`). A member's switches are three columns on their membership.

### Who can read what

| Content | Free member | VIP member | Staff |
| --- | --- | --- | --- |
| Free posts, offers | yes | yes | yes |
| VIP posts and setups | that they exist | yes | yes |
| How to pay, broker link | yes | yes | yes |
| The course outline | yes, locked | yes | yes |
| Lessons and their video | no | yes | yes |
| The queue, members, invite codes | no | no | yes |
| Groups for everyone | yes | yes | yes |
| VIP groups | that they exist | yes | yes |
| Groups by invitation | only if added | only if added | yes |
| Reported messages | no | no | yes |
| Reports about the space | their own | their own | no |
| Floor's note when suspended | no | no | yes |

A member also needs the account's one claimed login (`private.has_access`). Staff do not: a
mentor uses the phone and a laptop at once.

## Checks (`checks/`)

- `local_db.py` starts a real Postgres and applies the migrations.
- `local_supabase.py` puts Supabase's web API in front of it: sign-in with a fixed code, the
  table API, database functions and file storage. Requests run as the signed-in person under the
  real rules. It refuses anything beyond plain columns and plain filters, which holds the apps to
  rule 3.
- `phone_*.py` and `web_*.py` walk the apps in Chrome at phone size, check each step on screen
  and in the database, and save a picture of every screen to `checks/out/`. Several people can be
  walked at once, each on their own phone.
- Every request a walk-through's browser makes passes through the script first, so that nothing
  leaves the machine. A script that waits must wait with `common.pause`, never a plain sleep, or
  the browsers stand still with it.
- `fake_video_host.py` stands in for the video host. It checks upload tickets and playback
  addresses with its own copy of the host's rules, and serves a real short film in pieces.
- `fake_push.py` stands in for the notification service. It keeps every alert it is sent, and
  treats some addresses as phones that no longer have the app.
- `fake_processors.py` stands in for Paystack and Flutterwave: the API calls Floor makes, a page
  to pay on, and webhooks signed the way each one signs.
- `fake_telegram.py` stands in for Telegram: it answers the bot's calls, keeps what the bot
  posted, and tells Floor's server what the bot saw, with the secret word the server registered.
- `local_services.py` starts all of it together: the backend, the stand-ins and Floor's server.
- Nothing a check opens leaves the machine. A page from another site is answered with an empty one.
- `stand_in.py` is the older, scripted stand-in. It answers whatever a walk-through tells it to,
  for the cases a real database will not produce on demand: a failing server, a second phone
  taking over.

## Live video

A live session's video goes through Floor's own LiveKit server, never through Vercel or Supabase.
The database decides who may enter (`live_join`, asked as the person). Floor's server then signs a
pass into that one room (`web/src/server/live.ts`): the broadcaster may send camera, microphone and
screen, everyone else may only watch. The pass is the only thing the server adds: the room's chat
is an ordinary group, and the session's state lives in `live_sessions`.

In the phone app, `features/live/useLiveRoom.ts` joins the room with `livekit-client`, on the phone
through `@livekit/react-native` (loaded only in the installed app, `features/live/native.ts`) and in
a browser directly. `VideoSurface.tsx` and `VideoSurface.web.tsx` draw a track on each. The
laptop page's broadcaster is `web/src/features/mentor/Live.tsx`.

## The iPhone web app

`mobile/` builds for the web too (`npx expo export --platform web`), and that build is Floor on
iPhone, hosted as its own Vercel project (`mobile/vercel.json`). `mobile/public/` holds what only
the web build has: the page with its Home Screen tags, the manifest, the icons, and `sw.js`, the
service worker, which shows alerts and opens the right screen when one is tapped.

Files ending in `.web.tsx` or `.web.ts` take the place of their phone versions in that build:
`features/alerts/push.web.ts` subscribes to Web Push and gives Floor the subscription as its
address (`push_tokens.platform = 'web'`), and `InstallCard.web.tsx` explains the Home Screen in
Safari. On the server, `server/webPush.ts` sends to those addresses and `server/push.ts` sends
the rest through Expo's service.
