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
- **Card payments**: the mentor connects their own Paystack or Flutterwave account on the web at
  `/mentor`. A member pays by card on the join page and is VIP at once, with nothing to approve.
  The mentor is alerted and sees who paid in the app. Floor never holds the money.
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
- **Names**: everyone chooses the name others see before they write. A name cannot claim to be
  staff, carry a link or a number, or copy the name of the space, its mentor or an admin. The
  mentor and admins carry a badge no name can fake.

With `mobile/.env` empty the app still opens on the sample space, with no sign-in, so the screens can be
looked at without any setup.

Checked: 186 database tests, 223 logic tests (156 phone, 67 web and server), and eleven walk-throughs
in Chrome. Eight of them run against a real Postgres with Floor's migrations, with the mentor, a VIP
member and a free member each on their own phone. The Community walk-through has four people in one
group at once: what one writes shows on the others' phones, and a link, a number, a mute, a report and
a block each do what they should on screen and in the database. The Learn walk-through uploads a real video through the
server to a stand-in for the video host, which checks every signature the way the real host does, and
plays it back. The Alerts walk-through posts a setup in the app and checks who the server tells,
through a stand-in for the notification service. The card payments walk-through connects a processor,
pays on its page, and tries a wrong key, a forged webhook and an underpayment, against stand-ins for
Paystack and Flutterwave. The phone app builds for Android and iPhone and the web app builds for
production.

Not yet checked anywhere: anything on a real phone since the first look, and anything against the
real Supabase project, the real video host, a real notification or a real card processor. Those need
`docs/SETUP.md`. In a group, two things can only be seen on a real phone: that the box to type in
sits just above the keyboard, and that a message reaches the other phones at once. That speed comes
from Supabase's live connection, which the checks cannot use. Without it a phone still asks every few
seconds, so chat works either way. The first real card payment should be a test one (SETUP step 8): it is the first
time Floor's reading of Paystack's and Flutterwave's rules meets the real services.

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
- [ ] Card payments: one secret in Vercel, then try a test payment (SETUP step 8)
- [ ] Put yourself on Floor's own team, and choose the address people write to (SETUP step 9)

Later, when the build reaches them: a live video service, a Telegram bot token, the Apple and Google
developer accounts.

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
- [x] Database, server, web and mobile: card payments that unlock VIP by themselves
- [x] Report a space (mobile), suspend a space (Floor's own page at `/admin`)
- [x] Delete an account, in the app and on the web

### 2. Community
- [x] Groups and chat
- [x] Moderation, admin-only groups
- [x] Link and number filter
- [ ] Telegram teaser bot

### 3. Live
- [ ] Class schedule with reminders
- [ ] Live room: video, laptop screen share, chat
- [ ] Recordings saved into Learn
- [ ] Data saver

### Launch
- [ ] Store listings, privacy policy, Terms pages
- [ ] A lawyer reviews the Mentor Terms, the member Terms and the privacy policy. The Mentor Terms in the
      app today are Floor's product rules in plain words, not a lawyer's document
- [ ] Test builds on Android and iPhone
- [ ] Submit to the stores
