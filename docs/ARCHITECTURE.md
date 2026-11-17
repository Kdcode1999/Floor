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

With `mobile/.env` empty the app runs on a sample space, so screens can be looked at with no setup.

## Web app (`web/src`)

| Folder | Holds |
| --- | --- |
| `app/[slug]/` | A space's join page. The server reads only what anyone may know about the space |
| `features/join/` | Sign-in, joining, paying with proof, invite codes, all in the visitor's browser |
| `components/`, `theme/` | The same look as the phone app, as CSS |

Files both apps need (the themes, the sign-in messages) are kept in both. A test in `web/` fails
when the copies differ.

## Database (`web/supabase`)

- `migrations/` is the database. A migration that has been pushed is never edited: changes go in
  a new file.
- `tests/` applies the migrations to an in-memory Postgres and checks who can do what. `npm test`
  in `web/`.
- Helper functions used by rules live in the `private` schema, which the API does not expose.
- Errors raised for the apps are short codes (`not_allowed`, `banned`). The apps turn a code into
  a sentence.

## Checks (`checks/`)

- `local_db.py` starts a real Postgres and applies the migrations.
- `local_supabase.py` puts Supabase's web API in front of it: sign-in with a fixed code, the
  table API, database functions and file storage. Requests run as the signed-in person under the
  real rules. It refuses anything beyond plain columns and plain filters, which holds the apps to
  rule 3.
- `phone_*.py` and `web_*.py` walk the apps in Chrome at phone size, check each step on screen
  and in the database, and save a picture of every screen to `checks/out/`.
- `stand_in.py` is the older, scripted stand-in. It answers whatever a walk-through tells it to,
  for the cases a real database will not produce on demand: a failing server, a second phone
  taking over.
