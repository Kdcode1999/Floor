# Floor

One app for trading mentors who run communities. A mentor gets a branded space, moves their paid
community into it and teaches there.

## What is where

| Folder | What it holds |
| --- | --- |
| `docs/` | What v1 is, the decisions behind it, and where the build stands |
| `web/` | The web app (Next.js): the join page, sign-up, paying and proof upload, the mentor's laptop tools |
| `web/supabase/` | The database: every table, access rule and function, with tests |
| `mobile/` | The phone app (Expo), for members, mentors and admins |

Read `docs/STATUS.md` first. It says what is done and what is next.

## First run

Commands are written for PowerShell, one per line.

```powershell
git clone https://github.com/Kdcode1999/Floor.git
cd Floor\web
npm install
cd ..\mobile
npm install
```

## Put the database on Supabase

Once, from the `web` folder. `link` asks for the database password: type it there, never into a chat.

```powershell
cd web
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --remote
```

Run `npx supabase db push --remote` again whenever a pull brings new files in `web/supabase/migrations`.

## Run the apps

```powershell
cd web
npm run dev
```

```powershell
cd mobile
npx expo start
```

Scan the QR code with the Expo Go app on your phone. If the phone cannot reach the computer, run
`npx expo start --tunnel` instead.

## Check the work

```powershell
cd web
npm run test:db
npm run typecheck
npm run lint
```

```powershell
cd mobile
npm run typecheck
npm run lint
```

`test:db` applies the migrations to an in-memory Postgres and checks who can do what. It needs no
Supabase project and no network.
