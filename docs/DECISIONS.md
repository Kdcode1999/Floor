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

- **A read that needs two tables is a database function.** The apps otherwise read one table at a
  time with plain filters. The join is then written once and tested with the rest of the rules,
  and nothing depends on the finer points of the table API.
- **Walk-throughs run on a real Postgres.** `checks/local_supabase.py` puts Supabase's web API in
  front of a local Postgres with Floor's migrations. Screens are checked against the real rules,
  and each step is checked in the database too. It refuses any request beyond plain columns and
  plain filters, which keeps the apps to the rule above.
- **A space's logo is a file in Floor's own store**, never a link. A link could point at anything
  and change later. The app crops it square and shrinks it to 512 pixels before upload.
- **Declining a request asks for a reason**, and the member sees it. A bare "declined" only
  produces a second identical request.
- **Removing someone bans them.** They lose the space at once and cannot come back by the join
  link, a proof or an invite code. It ends their VIP and any admin role for good: letting them
  back in makes them a free member. An admin can remove members. Only the mentor can remove an
  admin. Nobody can remove the mentor.
- **Whether VIP is running is the database's call.** The phone's clock only words how long is
  left. A phone with a wrong clock cannot show someone as VIP who is not.
- **Admins get the queue, invite codes and Members. Price, payment details and the look stay with
  the mentor.** An admin who could change the bank details could redirect every payment.

- **Three kinds of post: a post, a trade setup, an offer.** Posts and setups are for VIP unless the
  mentor picks Everyone. An offer is a deal with a link, pinned to the top of the Feed for
  everyone, five at most.
- **A free member sees that a VIP post exists, and nothing inside it.** They get its kind, its age,
  a post's title or a setup's pair. The rest never reaches their phone: the database leaves it out,
  the app does not merely hide it.
- **A setup's prices are set once.** Nobody can rewrite a call after the market has moved. The
  mentor can add an update in their own words and close the setup. A closed setup stays closed.
  Posts and offers can be edited, and are marked as edited.
- **The composer checks that a setup makes sense**: for a Buy the stop is below the entry and the
  targets above, for a Sell the other way round. A setup that fails this is a typing slip, and
  members act on these numbers.
- **The phone app has no upgrade button.** A locked post says it is for VIP members and stops
  there. The app does not link to the join page and does not take invite codes: both stores forbid
  steering people to outside payment for digital content, and a rejection would block the launch.
  Members get VIP on the web join page, as decided earlier.
- **Embeds use each site's own player** and open the original with one tap. YouTube only plays
  inside a page that says where it is, so the app gives its store id as that address.
- **Pictures are shrunk on the phone before upload** (1600 pixels on the long side) and open full
  screen with pinch to zoom. A chart has to be read up close.
- **Jobs for the server wait in a queue in the database.** Sending an alert or posting to Telegram
  cannot happen inside the database. A function that needs one adds a job in the same transaction
  as its own change, so the job exists exactly when the change does. Floor's server takes jobs
  with its secret key, retries a failed one with a growing wait, and gives up after five tries.
- **Composing, managing a post and viewing a picture open over the tabs**, full screen, and
  return to wherever they were opened from.
- **Typing never hides behind the keyboard.** Screens use `react-native-keyboard-controller`, which
  behaves the same on Android and iPhone and is part of Expo Go.
- **The join page previews the space's newest posts**: free posts with their opening words, VIP
  posts locked. It is what a free member would see, so nothing new is made public.

- **Lesson video is hosted on Bunny Stream.** Checked in November 2026: Bunny charges 1 cent per GB
  stored and 6 cents per GB delivered in Africa, with free encoding. Cloudflare Stream charges 5
  dollars per 1,000 minutes stored and 1 dollar per 1,000 minutes delivered. At the sizes phones
  play (360p to 480p) an hour watched costs about 2 to 3 cents on Bunny and 6 cents on Cloudflare,
  and storage is many times cheaper. On Bunny the data saver also lowers Floor's own bill, so
  what is good for a member on mobile data is good for Floor. The database keeps the host's name
  with every video, and everything Floor asks of the host is in one file (`web/src/server/bunny.ts`),
  so another host can replace it.
- **Lessons are VIP only.** Hosted video costs money for every minute watched, and Floor's fee does
  not count free members. Free teaching goes out as a YouTube embed in a free post, which costs
  nothing. A free member sees the course outline, locked: what VIP holds.
- **A video goes straight from the mentor's phone or laptop to the video host, in pieces.** It never
  passes through Floor's server, and a dropped connection only costs the piece that was on its way.
  Floor's server hands out a ticket good for that one video for a day.
- **A video plays only at an address Floor's server has signed**, for that video alone, for six
  hours. The server signs only after the database has said this person may watch: VIP that has not
  run out and the account's one login, or staff. Video cannot be sent to a TV or kept in a floating
  window, both of which would take it outside the app's protection.
- **Replacing a lesson's video takes it back to a draft** until the new one is ready, so members
  never open a lesson to nothing. A lesson cannot be published before its video is ready.
- **A lesson counts as watched at 92 percent.** Nobody sits through the last seconds. Progress is
  saved every ten seconds, and finishing is kept: watching again does not un-finish a lesson.
- **Data saver is a switch on the lesson screen**, remembered on the phone. It holds video to 360p.
- **Protection.** Always on: one login at a time, one phone per account. The mentor's switches, on
  by default: no screenshots or screen recording for members, and the viewer's name and email
  faintly over paid video, moving every 20 seconds so it cannot be cropped out. The mentor and
  admins are exempt from both. The app says plainly that a second phone can still film the screen.
- **Floor's server is a handful of routes in the web app** (`web/src/app/api`). Each one does a job
  that needs a secret key and nothing else. It passes the person's login to the database, and the
  database decides. The server uses the secret key only to record what the video host reported and
  to take jobs from the queue.
- **The apps nudge the server whenever they queue a job**, so alerts go out at once. A daily timer
  on Vercel sweeps up anything left behind. Nothing depends on a paid plan.
- **The laptop page (`/mentor`) does what a laptop is better at**: adding lessons and uploading
  video. Renaming, sorting and deleting stay in the app. It never takes the account's one login
  from the phone.

- **An alert goes only to people who can open what it is about.** A VIP setup alerts VIP members
  and staff. A setup for everyone alerts everyone. So an alert can say what is new ("New setup:
  EURUSD · Buy") without leaking anything, and nobody is teased with something locked. It never
  carries the prices: those are read in the app, behind the login.
- **The person who posted is not alerted.** They know. Other staff are.
- **One address per account**, like one phone per account. Signing in on a phone moves alerts to
  it. Signing out stops them.
- **Each member chooses per space**: new setups, live sessions and classes, new lessons. All on to
  begin with. The phone's own notification setting stays the master switch.
- **The app asks before the phone does.** A card in the Feed says what alerts are for, with a
  button. The phone's own question appears only after a tap, because a phone asks once and a "no"
  there is hard to undo.
- **A class alert carries no clock time.** Members are in different time zones, and a notification
  is the same words for everyone. The app shows the time in each member's own.
- **Floor finds out when an app was removed** and stops sending to it. The notification service
  says so when a message is handed over, or a while later: the server asks again after 30 minutes.
- **Alerts go through Expo's notification service**, which passes them to Apple and Google. It is
  free and saves running two integrations. Everything asked of it is in `web/src/server/push.ts`.
- **The app's id in both stores is `ai.pikin.floor`.** It can never change once the app is in a
  store. It can be changed freely before the first build: two lines in `mobile/app.json`.
- **The app asks for no camera and no microphone.** Pictures and lesson videos are chosen from the
  phone's library. A mentor goes live from a laptop.
- **Checks never leave the build machine.** Any page from another site (YouTube's player inside a
  post) is answered with an empty page, so a result cannot depend on the network or on another
  site's messages.

- **Card payments run through the mentor's own Paystack or Flutterwave account.** Those are the two
  processors a Nigerian mentor can open today. The money goes from the member to the mentor's
  account, so "Floor never holds a member's money" stays true with cards as well. Stripe is left
  for later: checked in November 2026, it still opens no accounts for businesses registered in
  Nigeria. Everything Floor asks of a processor is one file per processor
  (`web/src/server/pay/`), so adding it for mentors elsewhere is one more file.
- **The member pays on the processor's own page.** Card numbers never touch Floor, in a browser or
  on the server. Floor starts the payment and sends the member there.
- **Floor has to hold the mentor's secret key, so it is held carefully.** Neither processor offers
  a way to act for a merchant without their key. The key is tried once, encrypted on the server
  with a secret that lives only in Vercel, and stored in a table no app can reach. It is never
  sent back, not even to the mentor. A copy of the database holds nothing that can move money.
  Disconnecting deletes it.
- **A payment counts only when the processor itself says so.** Whatever brings the news (the
  member's return, a webhook, the later check), the server asks the processor about that payment
  by Floor's own name for it. Less than the price, another currency, or an answer about some other
  payment gives no VIP. The days are added once, however many times the news arrives.
- **Three roads to the same place.** The member's return is the fast one. The processor's webhook
  covers a member who closes the page. A check the server queues for ten minutes later covers a
  mentor who set up no webhook. Any one of them is enough.
- **The return needs no login.** A payment's name is long, random and known only to whoever started
  it, and the only thing it can do is give that person what they paid for. So a member who paid in
  another browser is not stuck. The database limits how often one payment can make the server ask
  the processor.
- **The price and the days are fixed when the member presses Pay.** A mentor changing the price
  cannot alter a payment that is under way.
- **Test keys are refused.** A space connected with one would give VIP to anyone with a pretend
  card. A setting switches them on for trying payments before launch (SETUP step 8).
- **Only the mentor connects a processor**, on the web at `/mentor`, not in the phone app: the key
  is copied out of the processor's own website. Admins see who paid.
- **Card payments need no approval, so the mentor is told.** An alert when a member pays, and a
  list of card payments in the app. If a member cannot start a payment, the mentor is alerted and
  shown the processor's own reason: a sale lost in silence is what Floor is for preventing.
- **Someone removed after they started paying gets no VIP.** The payment is still listed, marked,
  so the mentor can refund it.
- **A refund does not end VIP by itself.** Refunds happen in the processor's dashboard, between the
  mentor and the member. The mentor ends VIP under Members.

## Open

- The service behind the live room. To be chosen when Live is built, on current prices.
- How a mentor pays Floor its monthly fee. Nothing in the build order covers it yet. It has to happen on
  the web, not inside the iPhone app.
