# Build status

The single place that says where the build is. Updated with every change.

Last update: 17 Nov 2026

## Now

The foundation is in the repo: both apps, the database with its tests, the three themes.

## Needed from Kingsley

- [x] GitHub repo `Kdcode1999/Floor`
- [x] Supabase project
- [ ] Put the database on the Supabase project: the three commands in the README, from `web/`
- [ ] Fill in `web/.env.local` and `mobile/.env` from the Supabase dashboard (URL and publishable key)

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
- [ ] Mobile: app shell, navigation, glass components in all three themes
- [ ] Mobile: sign-in by emailed code, claim the login, "signed in elsewhere" screen
- [ ] Web: join page for a space
- [ ] Web: sign-in, pay by transfer or USDT with proof, broker proof, invite code
- [ ] Mobile: mentor setup (name, logo, theme, price, how to pay, links), mentor Terms
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
- [ ] Test builds on Android and iPhone
- [ ] Submit to the stores
