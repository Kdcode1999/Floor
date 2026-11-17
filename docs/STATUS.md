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

With `mobile/.env` empty the app still opens on the sample space, with no sign-in, so the screens can be
looked at without any setup.

Checked: 67 database tests, 93 logic tests (76 phone, 17 web), and four walk-throughs in Chrome at
phone size. The newest walk-through runs the app against a real Postgres with Floor's migrations, so
what it proves is true of the real rules. The phone app builds for Android and iPhone and the web app
builds for production. Nothing has run against the real Supabase project yet: that needs
`docs/SETUP.md`.

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
- [x] Web: join page for a space, with a preview when the link is shared
- [x] Web: sign-in, pay by transfer or USDT with proof, broker proof, invite code
- [x] Mobile: a mentor starts their space: name, link word, theme, Mentor Terms
- [x] Mobile: the rest of mentor setup: logo, price, how to pay, links
- [x] Mobile: approval queue, invite codes and Members
- [x] Walk-throughs run against a real Postgres with the real rules
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
