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

With `mobile/.env` empty the app still opens on the sample space, with no sign-in, so the screens can be
looked at without any setup.

Checked: 115 database tests, 137 logic tests (105 phone, 32 web and server), and seven walk-throughs in
Chrome. Four of them run against a real Postgres with Floor's migrations, with the mentor, a VIP member
and a free member each on their own phone. The Learn walk-through uploads a real video through the
server to a stand-in for the video host, which checks every signature the way the real host does, and
plays it back. The phone app builds for Android and iPhone and the web app builds for production.

Not yet checked anywhere: anything on a real phone since the first look, and anything against the
real Supabase project or the real video host. Those need `docs/SETUP.md`.

## Needed from Kingsley

- [x] GitHub repo `Kdcode1999/Floor`
- [x] Supabase project
Each step is written out in `docs/SETUP.md`.

- [x] Put the database on the Supabase project (SETUP step 1)
- [ ] Run `npx supabase db push --remote` again: the database has grown since
- [x] Look at the phone app on a real phone: it looks right
- [ ] Connect the phone app to Supabase: fill in `mobile/.env` (SETUP step 2)
- [ ] Give the project its own email sender and change the two email templates, so sign-in emails carry
      a code (SETUP step 3). Sign-in cannot work on the real project before this
- [ ] Fill in `web/.env.local` the same way
- [ ] Put the web app on Vercel (SETUP step 4). The phone app needs it for video
- [ ] Open a Bunny Stream library for lesson video (SETUP step 5)

Later, when the build reaches them: an Expo account (EAS), a live video service, the card processors, a
Telegram bot token, the Apple and Google developer accounts.

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
- [ ] Alerts (push)
- [ ] Card payments that unlock VIP by themselves
- [ ] Report a space (mobile), suspend a space (Floor's own admin page)

### 2. Community
- [ ] Groups and chat
- [ ] Moderation, admin-only groups
- [ ] Link and number filter
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
