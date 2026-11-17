# Floor: web

The web side of Floor, and the home of its database.

- **Web app** (Next.js): the public join page for each space, sign-up, paying and proof upload, and
  the mentor's laptop tools.
- **Database** (`supabase/`): every table, access rule and function, as migrations, with tests.

The phone app is in `../mobile`. The project docs are in `../docs`. Setup and run commands are in the
README at the top of the repo.

## Check it

```powershell
npm run test:db
npm run typecheck
npm run lint
```

`test:db` applies the migrations to an in-memory Postgres and checks who can do what: who can see a
space, who can approve a request, that VIP ends on its date, that an old login stops working. It
needs no Supabase project and no network.

## Environment

Copy `.env.example` to `.env.local` and fill it in. `.env.local` is never committed.
