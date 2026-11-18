// What the link and number filter must catch and must let through. The database's filter and
// the app's copy of it are both tested against this one list, so they cannot drift apart.

/** Messages a member may not send, because they carry a link, an email address or an @name. */
export const LINKS = [
  "join my channel https://t.me/fxsignals",
  "HTTP://EXAMPLE.COM",
  "go to www.bestsignals.net now",
  "dm me on t.me/fxking",
  "wa.me/2348031234567",
  "chat.whatsapp.com/AbCdEf",
  "check bestsignals.com",
  "visit my-site.io/vip for more",
  "signals.ng",
  "write to fxking@gmail.com",
  "telegram: @fx_king_signals",
  "@fxking sent you the account",
  "use bit.ly/3xYz",
];

/** Ordinary talk that looks a little like a link and is not one. */
export const NOT_LINKS = [
  "I agree. Good call",
  "entry at 1.0850, sl 1.0810",
  "what do you think of gold today?",
  "US30 is up 1.5% today",
  "thanks @Kay",
  "e.g. the London session",
  "ok.me too",
  "long vs. short",
  "that's the i.e. the plan",
  "see you at 9 a.m.",
  "win rate was 62.5%...not bad",
];

/** Messages a member may not send, because they carry a phone number. */
export const PHONES = [
  "call me 08031234567",
  "whatsapp 0803 123 4567",
  "0803-123-4567",
  "(0803) 123 4567",
  "+234 803 123 4567",
  "+2348031234567",
  "+1 (415) 555-2671",
  "my number is 2348031234567",
  "text 07911 123456",
];

/** Numbers traders write all day that are not phone numbers. */
export const NOT_PHONES = [
  "entry 1.08500 tp 1.09000 1.09500",
  "US30 44250 44300 44350",
  "gold 2650.50 then 2675",
  "BTC at 104250.50",
  "risk 0.5% per trade",
  "account is at 1,250,000 naira",
  "0850, 0900, 0950",
  "lot size 0.01",
  "session opens 08:30",
  "up 120 pips since 2024",
  "price 0.00012345",
];

// --- Names -----------------------------------------------------------------------------------
// The same split applies to the name a person goes by. The database decides, and the app checks
// first so it can say what is wrong. Both are tested against these.

/** Names that claim to be staff. */
export const STAFF_NAMES = ["Admin", "admin john", "Kay (Mentor)", "KD Official", "Floor", "Customer Care", "support-team", "Help Desk NG", "MODERATOR", "the mentors"];

/** Names that carry a way to reach someone outside Floor. */
export const CONTACT_NAMES = ["Ada t.me/ada", "ada@mail.com", "Ada @adafx1", "Ada +234 801 234 5678", "08012345678", "www.ada.com"];

/** Ordinary names, some of which only look close to the ones above. */
export const FINE_NAMES = ["Ada O.", "Kay", "Chukwuemeka Okonkwo-Bright", "Adminah", "Supporter", "Mentorship fan", "Floors", "Member", "Tunde 99"];
