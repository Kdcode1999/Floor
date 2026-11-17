# Build status

The single place that says where the build is. Updated with every change.

Last update: 17 Nov 2026

## Now

The phone app signs people in. Someone types their email, gets a 6-digit code, and is in. The phone
then holds the account's one login: a second phone that signs in takes it over, and the first one is
stopped with a "Signed in on another phone" screen. After sign-in the app loads the person's real space
from the database, in that space's theme. Space look now saves to the database.

A mentor can start their space in the app: its name, the word their join link ends with, its theme, and
agreeing to the Mentor Terms. They land in it as its mentor. Members cannot join yet: that needs the web
join page, which is next.

With `mobile/.env` empty the app still opens on the sample space, with no sign-in, so the screens can be
looked at without any setup.

Checked: 58 logic tests, and two walk-throughs in Chrome at phone size (23 checks on the sample space, 69
on sign-in and starting a space, against a stand-in backend). The app builds for Android and iPhone.
Kingsley has seen the sample space on his phone and it looks right. Sign-in has not been run against the
real Supabase project yet: that needs steps 2 and 3 of `docs/SETUP.md`.

## Needed from Kingsley

- [x] GitHub repo `Kdcode1999/Floor`
- [x] Supabase project
Each step is written out in `docs/SETUP.md`.

- [x] Put the database on the Supabase project (SETUP step 1)
- [x] Look at the phone app on a real phone: it looks right
- [ ] Connect the phone app to Supabase: fill in `mobile/.env` (SETUP step 2)
- [ ] Give the project its own email sender and change the two email templates, so sign-in emails carry
      a code (SETUP step 3). Sign-in cannot work on the real project before this
- [ ] Fill in `web/.env.local` the same way, when the web app starts using Supabase

Later, when the build reaches them: an Expo account (EAS), a video host, a live video service, the card
processors, a Telegram bot token, the Apple and Google developer accounts.

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
- [ ] Web: join page for a space
- [ ] Web: sign-in, pay by transfer or USDT with proof, broker proof, invite code
- [x] Mobile: a mentor starts their space: name, link word, theme, Mentor Terms
- [ ] Mobile: the rest of mentor setup: logo, price, how to pay, links
- [ ] Mobile: approval queue and Members
- [ ] Database and mobile: Feed (posts, setups, embeds, Offers)
- [ ] Database and mobile: Learn (modules, lessons, hosted video)
- [ ] Mobile: Protection (capture blocking, name on video)
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
