# Setup: what Kingsley does

The steps only Kingsley can do, because they need his accounts. Each one is done once.
`docs/STATUS.md` says which are still open.

Never paste a key or password into a chat. They go into the files and dashboards named here.

## 1. Put the database on Supabase

From the `web` folder:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --remote
```

Run the last line again whenever a pull brings new files in `web/supabase/migrations`.

## 2. Connect the phone app to Supabase

In the Supabase dashboard: Project Settings, then API Keys. Copy the Project URL and the
publishable key. Both are safe to ship inside the app.

In the `mobile` folder, copy `.env.example` to `.env` and fill in the lines:

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
EXPO_PUBLIC_SITE_URL=https://where-the-web-app-lives
```

`EXPO_PUBLIC_SITE_URL` is the web app's address with no slash at the end. The app builds each
mentor's join link from it. Until the web app is on Vercel, use your computer's address on your
Wi-Fi, such as `http://192.168.1.20:3000`.

Stop `npx expo start` and start it again so it picks the file up. The app now opens on sign-in
instead of the sample space. Empty the first two values to get the sample space back.

The web app needs the same two values. In the `web` folder, copy `.env.example` to `.env.local` and fill
in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `npm run dev` then serves it at
`http://localhost:3000`, and a space's join page is `http://localhost:3000/its-link-word`.

## 3. Make sign-in emails carry a code

Floor signs people in with a 6-digit code they type into the app. Out of the box Supabase emails
a link instead, and its built-in email sender cannot be changed to send a code:

- It only delivers to people on your Supabase team, two emails an hour.
- On a Free project made after 3 June 2026 its email wording cannot be edited.

So the project needs its own email sender. This is needed before anyone but you can sign in anyway.

1. Open an account with an email sending service. Resend is the usual choice with Supabase and
   has a free tier. It asks you to prove you own the domain the emails come from, by adding a few
   DNS records it shows you.
2. In Supabase: Authentication, then Emails, then SMTP Settings. Switch on custom SMTP and enter
   the host, port, username and password the service gives you, and a sender such as
   `Floor <codes@yourdomain>`.
3. In Supabase: Authentication, then Emails, then Templates. Change two templates, **Magic link**
   and **Confirm sign up**. For both:
   - Subject: `{{ .Token }} is your Floor code`
   - Body: paste everything in `web/supabase/templates/code.html`
4. Authentication, then Sign In / Providers, then Email. Check that "Email OTP length" is 6: the
   app expects six digits. Optional but better: set "Email OTP expiration" to 600 seconds, so a
   code lasts ten minutes instead of an hour.

To check it: open the app, type your email, and a code should arrive within a few seconds.

With your own sender Supabase allows 30 sign-in emails an hour to start with. Raise it before
launch under Authentication, then Rate Limits.
