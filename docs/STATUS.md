# Build status

The single place that says where the build is. Updated with every change.

Last update: 18 Nov 2026

## Now

Kingsley asked for all of v1 to be built before he looks again. It is being built in the order below,
each piece tested and pushed as it lands.

Working today:

- **Sign-in** by emailed 6-digit code, in the phone app and on the web. One login at a time, one
  phone per account.
- **A mentor starts their space** in the app: name, link word, theme, Mentor Terms.
- **The join page** on the web: the space in its own theme, sign-in, joining free, and the ways to
  VIP (pay the mentor and upload proof, a broker account with proof, an invite code).
- **The mentor's tools** in the app: the approval queue with each proof, price and how to pay,
  the broker offer, the join link, invite codes, the members list with who is about to run out,
  giving and ending VIP by hand, admins, removing someone, and the space's logo.
- **The Feed**: the mentor and admins write posts (with a picture, and in free posts a video or
  social post from YouTube, X, Instagram or Facebook), trade setups and pinned offers. VIP members
  read everything. Free members see that a VIP post exists and nothing inside it. A setup's prices
  cannot be changed after posting: the mentor adds an update or closes it. The join page previews
  the newest posts.

- **Learn**: the mentor builds a course of modules and lessons, in the app or on a laptop at
  `/mentor`, uploads each lesson's video, and publishes it. VIP members watch in the app, with
  their progress kept and a data saver. Free members see the course locked. New lessons show in
  the Feed.
- **Protection**: no screenshots or screen recording for members, and the viewer's name over paid
  video. The mentor can switch either off.
- **Alerts**: a notification on the phone for a new setup and a new lesson, sent only to people
  who can open it. Each member switches each kind on or off, per space. The person who posted is
  not alerted.
- **Reports and suspension**: a member reports their space from the app. Floor's own team reads
  reports on the web at `/admin`, and can suspend a space with a note to its mentor, and restore
  it. A suspended space is closed to members and to the public, and the app says why.
- **Deleting an account**: in the app, and on the web at `/account`. A mentor's account takes
  their space with it. Files and videos are removed with it.
- **Groups**: every space starts with a group for everyone and one for VIP. The mentor and admins
  add more (30 at most), each for everyone, for VIP or by invitation, with members writing or
  only staff. Members talk, answer a message and see what is unread. Only the mentor and admins
  can post links, phone numbers and pictures, and the database is what refuses the rest. Staff
  delete messages and mute members. A member reports a message to staff, who are alerted on
  their phones, and blocks another member. The Chat tab shows a dot when something is waiting.
  There are no private messages.
- **Telegram teasers**: the mentor adds Floor's bot to their Telegram channel and posts a code in
  it. From then on the bot announces a new setup, post or lesson there, with the join link. A VIP
  setup is named by its pair and nothing else. The mentor chooses what is announced, can send a
  test, and is told in the app if the bot was removed or may not post.
- **Names**: everyone chooses the name others see before they write. A name cannot claim to be
  staff, carry a link or a number, or copy the name of the space, its mentor or an admin. The
  mentor and admins carry a badge no name can fake.

- **Classes and the live room** (first part of Live): the mentor or an admin puts classes on a
  schedule from the "Go live" tile, changes and cancels them, and VIP members are reminded 15
  minutes before. Members see the next class at the top of the Feed and the whole schedule in
  their own time. Going live puts a "Live now" card at the top of the Feed, alerts VIP members and,
  if the mentor wants, tells the Telegram channel. The live room opens for VIP members and staff,
  with a chat of its own under the video that the usual filter, mute, report and block all work in.
  Free members see that a session is on and that it is for VIP. Ending a session closes its chat.
  The video runs on Floor's own LiveKit server. The mentor broadcasts from the laptop page at
  `/mentor` (camera, microphone, and the screen to go through a chart) or from the phone (camera
  and microphone). Members watch and hear it on the phone, and can switch to sound only to save
  data. Only the broadcaster can be seen or heard. Live video needs the installed app or the web
  app: it does not play in Expo Go, where the sample's short film stands in for it. A session
  the mentor wants kept is recorded, and becomes a draft lesson in Learn under "Live recordings"
  once it is over; everyone in the room is told it is recorded. Supabase's free plan takes
  files of 50 MB at most, so recordings of any length need the Pro plan until video moves to
  Floor's own storage.

- **The sample space**: with `mobile/.env` empty the app runs on a made-up community held in
  memory. Every screen above works in it with nothing set up, seen as the mentor, as a VIP member
  or as someone who has not paid. It is how the build is looked at in Expo Go today. See below.

Checked: 202 database tests, 239 logic tests (172 phone, 67 web and server), 46 tests of the sample
space, and twelve walk-throughs in Chrome. One of them runs a live session with real video through LiveKit. One opens every screen of the sample space as
each of its three viewers. Nine run against a real Postgres with Floor's migrations, with the mentor, a VIP
member and a free member each on their own phone. The Community walk-through has four people in one
group at once: what one writes shows on the others' phones, and a link, a number, a mute, a report and
a block each do what they should on screen and in the database. The Learn walk-through uploads a real video through the
server to a stand-in for the video host, which checks every signature the way the real host does, and
plays it back. The Alerts walk-through posts a setup in the app and checks who the server tells,
through a stand-in for the notification service. The Telegram walk-through connects a channel through a stand-in for
Telegram, reads every notice the bot posts, and tries a call that only pretends to be Telegram's. The phone app builds for Android and iPhone and the web app builds for
production.

Not yet checked anywhere: anything on a real phone since the first look, and anything against the
real Supabase project, the real video host, a real notification, a real live session or the real
Telegram. Those need
`docs/SETUP.md`. In a group, two things can only be seen on a real phone: that the box to type in
sits just above the keyboard, and that a message reaches the other phones at once. That speed comes
from Supabase's live connection, which the checks cannot use. Without it a phone still asks every few
seconds, so chat works either way.

## See what is built, on your phone

The code is written in the cloud and pushed to GitHub. Expo shows the copy on your computer, so
that copy has to be brought up to date first. In PowerShell, one line at a time:

```powershell
cd $HOME\Projects\Floor
git pull
cd mobile
npm install
npx expo start --go -c
```

`--go` opens the app in Expo Go. Without it Expo now expects Floor's own build (SETUP step 6).

While `mobile/.env` is not filled in, the app opens on the **sample space**. Nothing needs setting
up for it: no database, no keys, no sign-in.

- It is one made-up mentor's community, "Your Academy", with members, posts and setups, a course,
  groups with conversations in them, people waiting for VIP, invite codes and a
  connected Telegram channel. Every screen built so far works in it.
- It opens as the mentor. Tap the badge at the top right, then choose **VIP member** or **Free
  member**, to see the same space through their eyes. The free member has just joined: they find
  VIP posts locked, and are asked for a name before they can write in a group.
- Nothing in it is real, and nothing you do in it is kept. Closing the app starts it again.
- Where it cannot do what the real thing does, the screen says so: it takes no video for a lesson
  (every lesson plays the same short film), reaches no Telegram (the channel connects by itself),
  sends no alerts and deletes no account. The join page is part of the web app and is not in it.

Do this again whenever you want to see what has been added since.

### When you want the real thing

The sample stops the moment `mobile/.env` is filled in (SETUP step 2). The app then opens on
sign-in and talks to your Supabase project. Before that:

```powershell
cd $HOME\Projects\Floor\web
npm install
npx supabase db push
```

`db push` asks for the database password. Type it there. It adds the tables for everything built
since the last push. Then SETUP step 3, so that sign-in emails carry a code.

In Expo Go the real app has everything but alerts, which need Floor's own build. Video lessons,
live video and Telegram teasers also need their SETUP steps.

## Needed from Kingsley

Each step is written out in `docs/SETUP.md`.

- [x] GitHub repo `Kdcode1999/Floor`
- [x] Supabase project
- [x] Put the database on the Supabase project (SETUP step 1)
- [ ] Run `npx supabase db push --remote` again: the database has grown since
- [x] Look at the phone app on a real phone: it looks right
- [ ] Connect the phone app to Supabase: fill in `mobile/.env` (SETUP step 2)
- [ ] Give the project its own email sender and change the two email templates, so sign-in emails carry
      a code (SETUP step 3). Sign-in cannot work on the real project before this
- [ ] Fill in `web/.env.local` the same way
- [ ] Put the web app on Vercel (SETUP step 4). The phone app needs it for video
- [ ] Open a Bunny Stream library for lesson video (SETUP step 5)
- [ ] Build the app for your phone in your own Expo project (SETUP step 6). Run `npm install` in
      `mobile` first: the app has new parts. Expo Go still opens the app for a look at the screens
      (`npx expo start --go`), without alerts on Android
- [ ] A Firebase project, so Android phones can get alerts (SETUP step 7)
- [ ] Put yourself on Floor's own team, and choose the address people write to (SETUP step 9)
- [ ] Make Floor's Telegram bot and give its token to Vercel (SETUP step 10)
- [ ] Rent a machine for live video and start Floor's LiveKit server on it (SETUP step 11)

Later, when the build reaches them: storage for lesson video on Floor's own servers, and a way to collect the $50 a month. No Apple or Google developer accounts are needed.

## Build order

### 1. Paid space
- [x] Two codebases created: Next.js 16 (web), Expo SDK 58 (mobile)
- [x] Database: accounts, spaces, membership, VIP by date
- [x] Database: approval queue for payment and broker proofs, with the proof file store
- [x] Database: invite codes
- [x] Database: one login at a time, one phone per account
- [x] Database: reports and suspension, admins
- [x] Tests for all of the above (41 passing)
- [x] The three themes as code in the mobile app
- [x] Mobile: app shell, navigation, glass components in all three themes
- [x] Mobile: Feed, Mentor home and Space look screens, on sample content
- [x] Mobile: sign-in by emailed code, claim the login, "signed in elsewhere" screen
- [x] Mobile: the person's real space and place in it, a list when they are in several, Account screen
- [x] Web: join page for a space, with a preview when the link is shared
- [x] Web: sign-in, pay by transfer or USDT with proof, broker proof, invite code
- [x] Mobile: a mentor starts their space: name, link word, theme, Mentor Terms
- [x] Mobile: the rest of mentor setup: logo, price, how to pay, links
- [x] Mobile: approval queue, invite codes and Members
- [x] Walk-throughs run against a real Postgres with the real rules
- [x] Database and mobile: Feed (posts, setups, embeds, Offers), and a preview on the join page
- [x] Database, server, mobile and web: Learn (modules, lessons, hosted video, progress)
- [x] Mobile: Protection (capture blocking, name on video)
- [x] Floor's server: routes for video, and the job queue
- [x] Database, server and mobile: Alerts (push)
- [x] Mobile: the app's store id, build profiles, permission wording
- [x] ~~Card payments that unlock VIP by themselves~~: built, then taken out in the plan change of 18 Nov
- [x] Report a space (mobile), suspend a space (Floor's own page at `/admin`)
- [x] Delete an account, in the app and on the web
- [x] Mobile: the sample space runs every screen, as the mentor, a VIP member or a free member

### 2. Community
- [x] Groups and chat
- [x] Moderation, admin-only groups
- [x] Link and number filter
- [x] Telegram teaser bot

### 3. Live
- [x] Class schedule with reminders
- [x] Live room: who may enter, the session's chat, ending a session (video comes with the next item)
- [x] Live room video: broadcasting from the phone, and from the laptop with screen share
- [x] Recordings saved into Learn
- [x] Data saver: sound only in live sessions, a small size for lessons

### 4. Plan change of 18 Nov: no stores, no cards, low running costs
- [x] Take card payments out: the mentor's Paystack and Flutterwave, the card checkout, the
      payments list. Transfer, USDT, broker link and invite code stay
- [ ] Now that no store rules apply: the app shows the way to VIP and takes invite codes
- [ ] iPhone: Floor as a web app on the home screen, with alerts
- [ ] Android: the app as a download from Floor's own site, updating itself
- [ ] Live video and lesson video on Floor's own servers, recordings with them (no 50 MB limit)
- [ ] The mentor pays Floor $50 a month

### Launch
- [ ] Download page, privacy policy, Terms pages
- [ ] A lawyer reviews the Mentor Terms, the member Terms and the privacy policy. The Mentor Terms in the
      app today are Floor's product rules in plain words, not a lawyer's document
- [ ] Test build of the Android app, and the iPhone web app on a real iPhone
- [ ] Floor's download page goes live
