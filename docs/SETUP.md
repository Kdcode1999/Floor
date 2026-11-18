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

Chat needs nothing more. When someone writes in a group, their phone tells the others to look, over
Supabase's live connection (Realtime), which a new project has switched on. If it is ever switched
off (Realtime, Settings, "Allow public access"), chat still works: each phone asks every few seconds
instead of at once.

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

## 6. Build the app for your phone

Until now the app ran inside Expo Go. Alerts, and later the live room, use parts of a phone that
Expo Go does not carry, so from here Floor runs as its own app, built in your own Expo project.
The build happens on Expo's servers. Nothing has to be installed on your computer.

Expo Go still opens the app for a quick look at the screens: `npx expo start --go`. On Android it
gets no alerts there.

1. Make a free account at expo.dev.
2. In the `mobile` folder:

   ```powershell
   npm install
   npx eas-cli@latest login
   npx eas-cli@latest init
   ```

   `init` creates the project on Expo and writes its id into `mobile/app.json`. The id is not a
   secret. Save it to the repo:

   ```powershell
   git add app.json
   git commit -m "Add the Expo project id"
   git push
   ```

3. **Android.** Build, then install:

   ```powershell
   npx eas-cli@latest build --profile development --platform android
   ```

   The first time it asks to create a keystore: say yes, Expo keeps it. After about 15 minutes it
   shows a QR code. Scan it with the phone, download the file and open it. Android asks once
   whether to allow installing from your browser.

4. **iPhone.** This needs the Apple Developer Program (99 dollars a year), which the App Store
   needs anyway. Register the phone, then build:

   ```powershell
   npx eas-cli@latest device:create
   npx eas-cli@latest build --profile development --platform ios
   ```

   Sign in with your Apple ID when asked, and let Expo create what it offers to create. Answer
   **yes** when it asks whether to set up push notifications. Install from the QR code. The phone
   also needs Developer Mode on: Settings, Privacy & Security, Developer Mode.

5. Start the app as before, and open **Floor** on the phone instead of Expo Go:

   ```powershell
   npx expo start
   ```

   The phone must be on the same Wi-Fi as the computer. If it cannot find it, scan the QR code in
   the terminal with the phone's camera.

A new build is only needed when a pull changes `mobile/package.json` or `mobile/app.json`.
`docs/STATUS.md` will say so when it happens. Everything else reaches the phone through
`npx expo start`.

The app's id in both stores is `ai.pikin.floor`. It can never change after the first store
release. If you want another, tell Claude before you build.

## 7. Alerts

Alerts are sent through Expo's notification service, which hands them to Apple and Google.

**iPhone:** nothing more to do. Step 6 set it up when you answered yes about push notifications.

**Android** delivers every notification through Google's Firebase, so the app needs a Firebase
project. It is free.

1. At console.firebase.google.com, add a project. Analytics is not needed.
2. In the project, add an Android app with the package name `ai.pikin.floor`. Download
   `google-services.json` when it is offered and put it in the `mobile` folder. This file is safe
   to commit: it ships inside every copy of the app.

   ```powershell
   git add google-services.json
   git commit -m "Add the Firebase settings for Android alerts"
   git push
   ```

3. In Firebase: the gear icon, Project settings, Service accounts, **Generate new private key**.
   A second JSON file downloads. **This one is a secret.** Leave it in Downloads. It never goes in
   the repo folder.
4. On expo.dev, open the Floor project: Credentials, Android, the `ai.pikin.floor` identifier (add
   it if it is not listed), then under Service credentials find **FCM V1 service account key**,
   add a key and upload that secret file. Save. Then delete the file from Downloads.
5. Build the Android app again (step 6.3) and install it. The app now carries the Firebase file.

To check it: sign in on the phone as a member and tap **Turn on alerts** on the card in the Feed.
With another account, as the mentor, post a trade setup. The member's phone should show "New
setup" within a few seconds. The person who posts is never alerted themselves.

**Before launch**, lock sending down. On expo.dev, in your account settings, open Access tokens:

1. Create an access token and add it to Vercel as `EXPO_ACCESS_TOKEN`. Redeploy.
2. Then switch on **Enhanced Security for Push Notifications** on the same page.

In that order. With the switch on, only a server holding your token can send alerts as Floor.

## 8. (Taken out)

This step set up card payments, which were taken out in the plan change of 18 Nov 2026. Members
pay by bank transfer or USDT and send proof. Nothing to do here.

## 9. Floor's own team, and where people write to

**Put yourself on the team.** Floor's own page for reports and suspension is `/admin` on the web.
Only people on Floor's team can use it, and the team is a list in the database. Sign in to Floor
once with the email you want to use for this. Then, in the Supabase dashboard, open the SQL
Editor and run this, with that email in place of the one shown:

```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'you@example.com';
```

Open `https://YOUR-SITE/admin` and sign in. To take someone off the team, delete their row.

What you can do there: read the reports members send, suspend a space with a note that its
mentor reads in the app, restore it, and close reports once you have dealt with them.

**Choose the address people write to.** A suspended mentor, or anyone with a question Floor has
to answer, needs somewhere to write. Use an address made for this, not your personal one: every
member can see it.

- In Vercel: `NEXT_PUBLIC_SUPPORT_EMAIL`
- In `mobile/.env`, and later in the app's build settings: `EXPO_PUBLIC_SUPPORT_EMAIL`

Until it is set, the screens that would show it leave it out.

**Deleting an account.** Both stores require that people can delete their account. In the app it
is under Account. On the web it is `https://YOUR-SITE/account`: Google Play asks for that address
when you list the app.

## 10. The Telegram bot

Floor has one bot of its own. A mentor adds it to the Telegram channel their audience is already
in, and it posts a short notice there when they post in their space, with their join link. You
make the bot once. Every mentor then connects their own channel from the app.

**Make the bot.**

1. In Telegram, open a chat with `@BotFather`. Check the blue tick: there are copies.
2. Send `/newbot`. Give it a name people will see, such as `Floor`, and a username that ends in
   `bot`, such as `FloorTeasersBot`.
3. BotFather answers with a token: a number, a colon and a long run of letters. Whoever holds
   it can post as the bot. Don't paste it in a chat or an email.

**Give the token to Floor's server.** In Vercel, open the project, Settings, Environment
Variables, and add `TELEGRAM_BOT_TOKEN` with the token as its value, for Production. Tick
"Sensitive". Then redeploy, so the server picks it up.

That is all the setup there is. The first time a mentor opens Manage, Telegram teasers, the
server tells Telegram where to send what the bot sees. Nothing is registered by hand.

**Try it.**

1. In Telegram, make a channel of your own to test with. In its settings, open Administrators,
   Add Admin, and add your bot. Leave "Post messages" switched on.
2. In the Floor app, as the mentor of a space: Manage, Telegram teasers. Copy the line it shows
   and post it in the channel. The bot takes the line down and says the channel is connected.
3. Press "Send a test" in the app. A line from the bot appears in the channel.
4. Post a trade setup for VIP in the app. The channel gets "New VIP setup" with the pair and
   your join link, and none of the prices.

**If the token ever gets out**, send `/revoke` to `@BotFather`, choose the bot, and put the new
token in Vercel in place of the old one. Mentors do not have to connect again.

Optional, also with `@BotFather`: `/setuserpic` gives the bot Floor's logo, and `/setdescription`
sets what people read when they open it.

## 11. Live video: Floor's own LiveKit server

Live sessions run on LiveKit, open-source software Floor runs on a machine it rents. Nothing is
paid per minute. LiveKit Cloud would work with the same three settings, if renting a machine is
ever not worth it.

**What you need.** A Linux machine with its own public address (Ubuntu, 2 CPUs and 4 GB of
memory to start), from any provider. And a domain you can add a record to: the server lives at
an address such as `live.yourdomain.com`.

**Make the settings, on your own computer.** With Docker installed, in an empty folder:

```
docker run --rm -it -v ${PWD}:/output livekit/generate
```

Answer its questions: your address (`live.yourdomain.com`), the latest version, **yes to egress**
(LiveKit's recorder, which keeps sessions as lessons), and "Startup Shell Script". With the
recorder on the same machine, take 4 CPUs and 8 GB of memory. It makes a folder with the settings, and prints an API key and
an API secret. Keep both: they go to Vercel below. The secret signs every pass into a room, so
it never goes in a chat or an email.

**Point the address at the machine.** At your domain's provider, add an A record for `live`
with the machine's public address.

**Start it on the machine.** Follow the lines the tool printed: the startup script goes into the
machine's "user data" when you create it, or you run it on the machine. Open these ports in the
provider's firewall: 443 and 80 (TCP), 7881 (TCP), 3478 (UDP) and 50000 to 60000 (UDP).

**Tell LiveKit where to report.** On the machine, in `/opt/livekit/livekit.yaml`, add:

```
webhook:
  api_key: <the API key>
  urls:
    - https://<your Vercel address>/api/live/webhook
```

then `sudo systemctl restart livekit-docker`.

**Give the three settings to Floor's server.** In Vercel, Settings, Environment Variables, for
Production: `LIVEKIT_URL` as `wss://live.yourdomain.com`, `LIVEKIT_API_KEY` and
`LIVEKIT_API_SECRET` (tick "Sensitive" on the secret). Redeploy.

**Recordings.** Sessions are recorded into Supabase's file store, through its S3 door, and
then handed to the video host as a draft lesson. In Supabase: Storage, Settings, S3 Connection.
Switch on the S3 connection, note the endpoint and region it shows, and make an access key. In
Vercel add `RECORDINGS_S3_ENDPOINT`, `RECORDINGS_S3_REGION`, `RECORDINGS_S3_ACCESS_KEY` and
`RECORDINGS_S3_SECRET` (tick "Sensitive" on the last two). Leave them out and sessions simply
are not recorded.

Know this before relying on it: **Supabase's free plan takes files of 50 MB at most**, and an
hour of a session is far more. On the free plan most recordings will fail, and the app tells
the mentor "The recording could not be saved". The Pro plan takes them, or this waits for the
step that moves video to Floor's own storage (see STATUS).

**Try it.** On a laptop, open `/mentor`, the Live tab, and go live. Allow the camera. On a phone
with the installed app, signed in as a VIP member of the same space, the Feed shows "Live now":
tap "Join session" and you should see and hear the laptop. Share your screen from the laptop
and the phone shows it. End the session: with recordings set up, a few minutes later a draft
lesson with the session's title appears in Learn, under "Live recordings".

Live video does not play in Expo Go. It needs the app built in step 6, or the web app.

## 12. Floor for iPhone: the web app

iPhone users get Floor as a web app they add to their Home Screen. It is the phone app itself,
built for the web, on an address of its own such as `app.yourdomain.com`. No App Store, no
review, no cut.

**Make a key pair for alerts.** In a terminal, in the `web` folder:

```
npx web-push generate-vapid-keys
```

It prints a public key and a private key. The private key signs every alert Floor sends to an
iPhone: it goes only into Vercel, never into a chat or an email.

**Give the keys to Floor's server.** In the Vercel project you made in step 4, Settings,
Environment Variables, for Production: `VAPID_PUBLIC_KEY` (the public key), `VAPID_PRIVATE_KEY`
(the private key, tick "Sensitive") and `VAPID_SUBJECT` (`mailto:` and an address you read, such
as `mailto:alerts@yourdomain.com`).

**Make a second Vercel project for the app.** In Vercel: Add New, Project, the same `Floor`
repository. Set Root Directory to `mobile` and leave the framework as "Other": the build
command and output are already in `mobile/vercel.json`. Before deploying, add these Environment
Variables:

| Name | Value |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | the same as in `mobile/.env` |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the same as in `mobile/.env` |
| `EXPO_PUBLIC_SITE_URL` | the web app's address from step 4, with no slash at the end |
| `EXPO_PUBLIC_SUPPORT_EMAIL` | where people write to Floor |
| `EXPO_PUBLIC_VAPID_PUBLIC_KEY` | the public key from above |

Deploy. Under Settings, Domains, give it its address, such as `app.yourdomain.com`.

**Point the join page at it.** Back in the first Vercel project, add `NEXT_PUBLIC_APP_URL` with
the app's address and redeploy. Members who join on the web then get an "Open Floor on iPhone"
button.

**Try it on an iPhone** (iOS 16.4 or later):

1. In Safari, open the app's address and sign in. The Feed shows "Put Floor on your Home Screen".
2. Tap Share, then Add to Home Screen. Open Floor from the new icon: it runs full screen.
3. Tap "Turn on alerts" and allow them.
4. From another phone or the laptop, post a setup as the mentor. The iPhone gets the alert.

What a web app cannot do on iPhone: stop screenshots and screen recording. Paid video there is
protected by the viewer's name on it.
