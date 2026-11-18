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
| `lib/` | Small helpers: Supabase client, secure storage, formatting, `useLoad`, `useAction` |

A screen loads with `useLoad(() => api.loadX(...), key)` and acts with `useAction()`. An action
resolves with a sentence to show when it failed, or null.

Screens inside a tab live under `app/(tabs)/`. Screens that take the whole phone (writing a post,
a picture, later a lesson or a live session) are files directly in `app/` and open over the tabs.

With `mobile/.env` empty the app runs on a sample space, so screens can be looked at with no setup.

## Web app (`web/src`)

| Folder | Holds |
| --- | --- |
| `app/[slug]/` | A space's join page. The server reads only what anyone may know about the space |
| `features/join/` | Sign-in, joining, paying with proof, invite codes, all in the visitor's browser |
| `app/mentor/`, `features/mentor/` | The mentor's laptop page: the course and video upload, and connecting a card processor |
| `features/pay/` | Card payments' plain logic, shared by the pages and the server |
| `app/account/`, `features/account/` | A person's own account on the web: deleting it |
| `app/admin/`, `features/admin/` | Floor's own page: reports, suspending and restoring a space |
| `features/session/` | Sign-in by emailed code for the pages staff use |
| `app/api/`, `server/` | Floor's server. See below |
| `components/`, `theme/` | The same look as the phone app, as CSS |

Files both apps need (the themes, the sign-in messages, Learn's logic, the wording for deleting
an account) are kept in both. A test in `web/` fails when the copies differ.

### Floor's server (`web/src/app/api`, `web/src/server`)

| Route | Who calls it | What it does |
| --- | --- | --- |
| `POST /api/video/upload` | staff | Makes a place for a lesson's video at the video host, answers with an upload ticket |
| `POST /api/video/status` | staff | Asks the host how a video is doing and records it |
| `POST /api/video/play` | someone who may watch | Answers with a signed address for the video |
| `POST /api/video/webhook` | the video host | Hears that a video changed, then asks the host itself |
| `POST /api/jobs/run` | any signed-in app, and Vercel's timer | Does the jobs waiting in the queue |
| `POST /api/account/delete` | anyone signed in | Deletes their account, and their space if they run one |
| `POST /api/pay/connect` | the mentor | Tries their processor key, encrypts it and stores it |
| `POST /api/pay/start` | a member | Starts a card payment and answers with the processor's page for it |
| `POST /api/pay/confirm` | the page a member returns to, no login | Asks the processor what became of a payment, and adds the VIP days if it went through |
| `POST /api/pay/hook/<processor>/<space>` | the mentor's processor | Checks the webhook's signature with that mentor's key, then does the same as confirm |

Every route follows the same steps: take the person's login from the request, ask the database
*as that person* whether they may (a function such as `lesson_playback`), and only then use a
secret. `server/` cannot be imported from code that runs in a browser.

The files in `server/`: `env.ts` (the secret settings), `supabase.ts` (the database as the person,
or with the secret key), `http.ts` (reading requests, wording refusals), `bunny.ts` (everything
asked of the video host), `jobs.ts` (the queue's handlers), `push.ts` (everything asked of the
notification service), `alertWords.ts` (what an alert says and who may get it).

Card payments are in `server/pay/`: `processor.ts` (what Floor asks of any card processor),
`paystack.ts` and `flutterwave.ts` (one file each, and the only places that know either
processor), `vault.ts` (encrypting a mentor's key) and `index.ts` (`confirmPayment`, which the
return, the webhook and the later check all go through). What both the pages and the server
need to know about processors, such as which currencies each charges, is in
`features/pay/logic.ts`.

### Jobs the server does from the queue

| Job | Queued by | What happens |
| --- | --- | --- |
| `alert` | `create_post` for a setup, `publish_lesson`, `settle_payment`, `note_payment_problem` | The server words the alert, asks the database who gets it (`alert_recipients`) and sends it |
| `push_receipts` | the server, 30 minutes after an alert | Asks which phones took the alert and forgets the ones that are gone |
| `video_delete` | `delete_lesson`, `erase_account` | Removes the video from the video host |
| `payment_check` | `start_payment`, for ten minutes later | Asks the processor about a payment nobody has confirmed yet |
| `files_delete` | `erase_account` | Removes files from the file store after an account or space is deleted |

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
- `payments` is one row per try at paying by card. A member reads their own, staff read their
  space's. Only `start_payment` (as the member) and `settle_payment` (secret key) write to it.
- `private.payment_accounts` holds each mentor's processor key, encrypted by the server. No app
  can reach the table. The mentor sees the key's last four characters through `payment_account`.
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
| Card payments | their own | their own | the space's |
| Reports about the space | their own | their own | no |
| Floor's note when suspended | no | no | yes |
| The card processor's key | no | no | no: only Floor's server, encrypted |

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
- `fake_video_host.py` stands in for the video host. It checks upload tickets and playback
  addresses with its own copy of the host's rules, and serves a real short film in pieces.
- `fake_push.py` stands in for the notification service. It keeps every alert it is sent, and
  treats some addresses as phones that no longer have the app.
- `fake_processors.py` stands in for Paystack and Flutterwave: the API calls Floor makes, a page
  to pay on, and webhooks signed the way each one signs.
- `local_services.py` starts all of it together: the backend, the stand-ins and Floor's server.
- Nothing a check opens leaves the machine. A page from another site is answered with an empty one.
- `stand_in.py` is the older, scripted stand-in. It answers whatever a walk-through tells it to,
  for the cases a real database will not produce on demand: a failing server, a second phone
  taking over.
