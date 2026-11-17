# Decisions

Newest at the bottom. Each entry says what was decided and why, so nobody has to dig through a chat.

## Product

- **Branded space inside one Floor app.** A mentor's own app in the stores comes later as a top tier.
- **Flat monthly fee, no take-rate.** Tiered by VIP members and live minutes. Free members do not count.
- **Members pay the mentor directly.** Floor never holds a member's money. This keeps chargebacks and
  fraud claims with the mentor, where the sale happened.
- **Checkout happens on the web join page, not inside the iOS app.**
- **Themes change colour and light only.** One layout for all three (Night, Dawn, Smoke). Buy stays green
  and Sell stays red in every theme, in soft shades. Mentors pick a preset: there is no free colour
  picker. Every theme must still look right with blur switched off, for cheap Android phones.
- **A mentor tries a theme on before saving it.** Tapping a theme on Space look shows it across the whole
  app at once. Nothing is kept until "Save look", and leaving without saving puts the old theme back.
- **Embeds only in free posts.** YouTube's developer policy rules out charging to watch an embedded video,
  so paid lessons are uploaded and hosted in the app.
- **"Never lose revenue" is not a promise we can make.** A second phone can always film the screen. What we
  do: one login at a time, one phone per account, capture blocking on paid content, the viewer's name on
  paid video.
- **One login and one phone are always on.** Capture blocking and the name on video are switches the mentor
  controls, on by default.
- **No private messages in v1.** Impersonators are the daily problem on Telegram.
- **Proof of results is optional, and Floor never vouches.** See PRODUCT.md.
- **One launch.** Everything in PRODUCT.md ships together. It is still built in order: Paid space, then
  Community, then Live.

## Build

- **Claude writes the code.** Kingsley owns the accounts, the keys, phone testing and store submission.
- **One repo, two apps.** `web/` (Next.js, and home of the database) and `mobile/` (Expo). Each folder
  has its own `package.json` and is installed and run on its own.
- **Supabase** for accounts, database, files and realtime. **Vercel** for the web app. **EAS** for app builds.
- **Sign-in is an emailed code, with no passwords.** Nothing to share, nothing to leak. It also means
  "changing phones needs an emailed code" comes for free: signing in on the new phone is that code.
- **VIP is a date, not a flag.** A member is VIP while `vip_until` is in the future. Nothing has to run for
  VIP to end, so it cannot fail to end.
- **Privileged changes go through database functions.** The apps cannot write `role`, `vip_until` or
  `status` directly. Every rule lives in one place and is tested.
- **One login at a time is enforced in the database.** The phone app calls `claim_session` after sign-in.
  Content rules then accept only that login. We do not depend on Supabase's single-session setting.
- **One phone per account.** The first phone to claim is tied to the account. A new phone may take over
  at most twice in 30 days.
- **Staff are exempt from the one-login rule in their own space.** A mentor needs the phone app and the
  laptop page at once. Account sharing by staff does not cost the mentor money.
- **Requests carry their own VIP days.** A pending request keeps the days it was made with, so a later
  price change cannot alter it. Staff can set other days when approving.
- **Invite codes need no approval.** The code is the approval. Every failure gives the same answer, so
  codes cannot be probed.
- **Access rules are tested against a real Postgres engine** (PGlite) on every change: `npm run test:db`
  in `web/`.
- **The Supabase project is created with "Automatically expose new tables" off and "Enable automatic RLS" on.**
  Migrations grant access table by table, and switch RLS on themselves. Automatic RLS is the safety net.
- **Database helper functions live in a `private` schema** that the API does not expose. Only functions
  meant for the apps are in `public`.

- **Only the floating navigation blurs.** The cards are a see-through fill, a hairline border and a
  shadow. The lights behind a card are already smooth, so blurring them changes nothing on screen and
  costs battery on every card. The design's glass also made the colours behind it richer: that lift is
  applied to the lights themselves, so a card looks the same as in the design.
- **Blur per platform.** iPhone uses the system blur. Android gets a nearly solid navigation instead,
  because live blur is slow on low-cost phones.
- **Screens opened from Manage stay inside the Manage tab**, so the navigation remains in view, as in the
  design.
- **The phone app shows a sample space until sign-in is built.** The sample lives in one file,
  `mobile/src/space/SpaceContext.tsx`, and is replaced by the real space and membership.
- **The phone app's web build is for checking screens only.** It is not shipped to members: the student
  web app is on the Later list. It is exported as a single page.
- **Screens are checked by walking the app, not by eye alone.** The scripts in `checks/` drive the phone
  app and the web app in Chrome at phone size, check each step and save a picture of every screen.

- **Sign-in is a typed code, never a link.** A link opens a browser, and on a phone that means leaving
  the app. Supabase's built-in email cannot send a code on a new Free project, so Floor needs its own
  email sender from the start. See SETUP.md.
- **The login is kept in the phone's secure storage** (Keychain on iPhone, Keystore on Android), marked
  as never to be copied to another phone. A login is too big for one secure entry, so it is kept in pieces.
- **How a phone is recognised.** Android: a one-way hash of the phone's Android ID, which survives a
  reinstall. iPhone: a random id kept in the Keychain, which also survives a reinstall. Otherwise putting
  the app back on the same phone would count as moving to a new one.
- **Signing in takes the login over. Opening the app never does.** A phone that signs in claims the login.
  A phone that still has an old login only asks whether it is current, and stops if it is not. If it took
  the login back by itself, two phones would keep taking it from each other and burn through the account's
  phone changes.
- **A weak connection locks nobody out.** If the server cannot be reached when the app opens, the person
  is let in and asked about again shortly. The database still guards every piece of content.
- **Sign out only signs out this phone**, and works without a connection.
- **An open app asks every five minutes, and whenever it comes back into view, whether its login is still
  current.** Chat will bring a live connection that can replace the timer.
- **Account opens from the badge in the header** (Mentor, Admin, VIP or Member). The design had no account
  screen. This adds one without a new button or tab. Kingsley can ask for a visible button instead.
- **One hold screen** covers every reason a signed-in person cannot go further: another phone took over,
  the phone limit, a server that cannot be reached, no space yet, several spaces to choose from.
- **Sample content never appears in a real space.** With `mobile/.env` empty the app shows the sample
  space. Connected to Supabase, a space starts empty. A phone build made for release without its settings
  shows an error and nothing else.
- **Plain logic is tested on its own, screens are walked.** Files with no phone code in them (login rules,
  storage in pieces, messages) have tests: `npm test` in `mobile/`. Sign-in is also walked end to end in
  Chrome against a stand-in for Supabase: `checks/phone_sign_in.py`.

- **Anyone signed in can start a space, one per account.** There is no approval step. The Mentor Terms
  and "report and suspend" are the guard.
- **The join link ends with a word the mentor picks.** The app writes it from the space's name until the
  mentor types their own. It cannot be changed afterwards in v1: links already shared must keep working.
- **The Mentor Terms are seven short rules, read and agreed to in the app.** The database stores which
  version each mentor agreed to. Changing the wording means changing the version.

- **The join page runs in the visitor's browser.** The server only reads what anyone may know about the
  space, so a shared link shows the space's name in chat apps. Signing in, joining and sending proof talk
  to Supabase straight from the browser, under the same database rules as the phone app.
- **The web never claims the account's one login.** People use the web to join and to prove a payment.
  They read the space in the phone app. So signing in on the web does not stop their phone.
- **How to pay is shown only after joining.** A visitor sees the price. The bank details, the payment
  link and the broker link are for members.
- **An invite code typed on a join page must be that space's code.** Another space's code gets the same
  answer as a code that does not exist.
- **Files both apps need are kept in both** (the themes, the sign-in messages). A test in `web/` fails
  when the two copies differ.

## Open

- Card processors for the automatic path. Starting point: Paystack and Flutterwave, Stripe after.
- Video host for lessons and the service behind the live room. To be chosen when Learn is built, on
  current prices.
- How a mentor pays Floor its monthly fee. Nothing in the build order covers it yet. It has to happen on
  the web, not inside the iPhone app.
