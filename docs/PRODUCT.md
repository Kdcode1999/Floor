# Floor v1: what we are building

Floor is one app for trading mentors who run communities. A mentor gets a branded space, moves
their paid community into it, teaches there, and pays Floor a flat monthly fee of $50.

Floor holds no money except that fee. Members pay the mentor straight to the mentor's bank
account or in USDT. There are no app stores: Android gets the app as a download from Floor's own
site, and iPhone uses Floor as a web app on the home screen. No store takes a cut, and no store
rule stands between a member and the mentor's own price.

One space per mentor. A member is Free or VIP. There are three ways to become VIP.

Design references
- Structure: https://claude.ai/artifact/Ugkt7poM8zh7wBjmcykEp3 (whiteboard)
- Screens: https://claude.ai/artifact/MSsSCqWRgEJRcSvpfrTocM (mockup, "Glass app" page)

## Who uses it

| Person | Where | What they do |
| --- | --- | --- |
| Member (student) | Floor on the phone: the Android app, or the web app on iPhone | Reads the Feed, takes lessons, chats in groups, joins live sessions |
| Mentor | The same, plus a laptop page for sharing a chart and uploading lessons | Posts, teaches, approves requests, runs the space |
| Admin | The same | Staff the mentor appoints: approves requests, posts, moderates |
| Visitor | Web join page | Sees the space, signs up, pays or proves a broker account |

## The mentor's flow

1. **Set up once**: name, logo, theme (Night, Dawn or Smoke), price, how to pay, broker and offer links.
2. **Invite audience**: a join link, and a Telegram bot that posts teasers into their old channel.
3. **Approve requests**: one queue for payment proofs and broker proofs, one tap each.
4. **Teach**: post, go live, add lessons.
5. **Members**: see who is VIP and who is about to run out.

## The member's flow

1. **Join page** (web): a free preview, then the ways in.
2. **Get VIP**, any of:
   - **Pay**: by bank transfer or USDT straight to the mentor, with a proof upload the mentor approves.
   - **Broker link**: open an account under the mentor's link, upload proof, get free VIP.
   - **Invite code**: VIP at once.
3. **The app**: Feed, Learn, Chat, and Live when a session is on.
4. **VIP ends by itself** on its end date. The member drops back to Free until they renew.

## What is in v1

Built in this order, shipped together in one launch.

### 1. Paid space
- Sign-up by emailed code. One login at a time. One phone per account.
- Space setup, the three themes, mentor Terms.
- Join page and VIP that ends by itself.
- Ways in: transfer, USDT, broker link, invite code.
- Feed: posts, trade setups, embeds (YouTube, X, Instagram, Facebook) in free posts, pinned Offers.
- Learn: lessons in modules. Paid video is hosted in the app, never embedded.
- Protection: no screenshots or screen recording on paid content, and the viewer's name on paid video.
- Alerts (push) for a new setup, going live and a new lesson. Members list.
- Report a space, and Floor can suspend one.

### 2. Community
- Groups like Telegram: several per space, each open to Everyone, VIP or Invited members.
- Moderation: delete, mute, ban, and groups where only admins post.
- Link and number filter: only the mentor and admins may post links or phone numbers.
- Admins.
- Telegram teaser bot.

### 3. Live
- Class schedule shown in each member's own time zone, with a reminder.
- Live room: video, laptop screen share, chat.
- Recordings saved into Learn.
- Data saver: audio-only lives and a low-quality option for lessons.

### 4. Getting Floor onto phones, cheaply
- Android: the app as a download from Floor's own site, and it updates itself.
- iPhone: the same app as a web app, added to the home screen, with alerts.
- The mentor pays Floor $50 a month.
- Floor's own servers for live video and for lesson video, so costs stay low as spaces grow.

## Rules for real mentors and furus

Floor serves every kind of mentor and stays a neutral tool.

- **Proof stays optional.** No mentor has to show results. A verified record comes later and is opt-in.
- **Floor never vouches.** A mentor can post anything as their own claim. Anything that carries
  Floor's stamp (member counts, badges, testimonials) comes from the system, or does not exist.
  No tools that fake results, testimonials or numbers.
- **The free audience stays free.** Free members are not billed for. Big free lives go out as a
  YouTube embed. Floor's live room is for VIP.
- **Mentor Terms.** No guaranteed profits. No handling members' trading money.
- **Report and suspend.** Members can report a space. Floor can close one.
- **No private messages.** That is what keeps impersonators out.

## Not in v1

Later
- Quizzes and certificates, student microphones in live sessions, a verified record (opt-in).
- Private messages.
- Automatic broker verification, per-course pricing, Floor or a mentor's own app in the stores, custom domains.
- Account tracking (Watchwall), AI co-mentor, analytics.

Never
- A marketplace of mentors.
- A take-rate on what mentors earn.
- Holding members' money, card payments for members, or Apple's and Google's in-app payments.
