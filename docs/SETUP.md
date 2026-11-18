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

## 4. Put the web app on Vercel

The web app is the join page, the mentor's laptop page, and Floor's own server: the few jobs that
need a secret key, such as signing a video's address. The phone app calls that server, so the web
app has to be online before video works on a phone.

1. In Vercel: Add New, then Project, and pick the `Kdcode1999/Floor` repo.
2. Set **Root Directory** to `web`. Leave the rest as Vercel suggests.
3. Under Environment Variables, add the values from `web/.env.example`:
   - the three `NEXT_PUBLIC_` values from step 2, with `NEXT_PUBLIC_SITE_URL` set to the address Vercel
     gives the project (or your own domain), with no slash at the end
   - `SUPABASE_SECRET_KEY`: Supabase dashboard, Project Settings, API Keys, the **secret** key. It passes
     every access rule, so it goes here and nowhere else
   - `CRON_SECRET`: a long random word of your own. Any password generator will do
4. Deploy. Then put the same address in `mobile/.env` as `EXPO_PUBLIC_SITE_URL`.

Vercel calls the server once a day to sweep up any job that was left behind (an alert that could not
be sent, a video that could not be removed). The apps also nudge it every time they queue a job, so
nothing waits for the sweep in normal use. On Vercel's Pro plan the sweep can run more often: change
the schedule in `web/vercel.json` to `*/5 * * * *`.

## 5. The video host for lessons

Lesson videos are stored and played by Bunny Stream. `docs/DECISIONS.md` says why. It has a 14-day
trial, then a 1 dollar monthly minimum and pay for what is used.

1. Open an account at bunny.net. Go to Stream and add a video library. Pick a main storage region
   near your members: Johannesburg or a European one for West Africa.
2. In the library, find these four values and put them in Vercel's Environment Variables:
   - `BUNNY_STREAM_LIBRARY_ID`: the library's ID, a number
   - `BUNNY_STREAM_API_KEY`: the library's own API key (not your account's API key)
   - `BUNNY_STREAM_CDN_HOST`: the library's CDN hostname, such as `vz-1a2b3c4d-5e6.b-cdn.net`
   - `BUNNY_STREAM_TOKEN_KEY`: on the library's Security page, switch on token authentication for
     direct access to the video files, and copy its key. This is what stops a video's address from
     working for anyone Floor has not signed it for
3. On the same Security page, switch on blocking of direct file access if it is offered. Nobody
   should be able to open a video without a signed address.
4. Under Encoding, keep 240p, 360p, 480p and 720p switched on. The low ones are what data saver
   plays. 1080p is optional and costs more storage.
5. Webhook: make up a long random word and add it to Vercel as `BUNNY_STREAM_WEBHOOK_KEY`. In the
   library's webhook setting, enter `https://YOUR-SITE/api/video/webhook?key=THAT-WORD`. Bunny then
   tells Floor the moment a video is ready. Without it Floor still finds out, the next time a mentor
   or admin opens the lesson.
6. Redeploy on Vercel so it picks up the new values.

To check it: in the app, as the mentor, add a lesson and upload a short video. It should say "Video
is being prepared", then "Video ready". Publish it and play it as a VIP member. **If it does not
play, tell Claude what you see**: the playback address is signed to Bunny's published rules, and this
is the first time it meets the real service.
