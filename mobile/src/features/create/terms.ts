// The Mentor Terms: what a mentor agrees to before their space is created.
//
// These are Floor's product rules in plain words. They are not yet a lawyer's document: a
// lawyer has to review them before launch (see docs/STATUS.md). When the wording changes,
// change MENTOR_TERMS_VERSION in rules.ts too, so the database records who agreed to what.

export interface Term {
  title: string;
  text: string;
}

export const MENTOR_TERMS: Term[] = [
  {
    title: "No promised profits",
    text: "Don't promise or hint that members will make money. Trading can lose money, and you say so.",
  },
  {
    title: "Never handle a member's trading money",
    text: "Don't take deposits to trade for members, don't run their accounts, and don't ask for their broker logins.",
  },
  {
    title: "Your claims are your own",
    text: "Results, track records and testimonials you post are your word. Floor doesn't check them or vouch for them. Don't fake results, testimonials or member numbers.",
  },
  {
    title: "Say when a link pays you",
    text: "If a broker or prop firm link earns you money, tell your members plainly.",
  },
  {
    title: "Members pay you, not Floor",
    text: "You are the seller. Refunds, taxes and any licence you need where you work are yours to handle. Floor never holds a member's money.",
  },
  {
    title: "Keep it legal and decent",
    text: "No scams, no pretending to be someone else, no harassment. Follow the law where you and your members live.",
  },
  {
    title: "Reports and closing a space",
    text: "Members can report a space to Floor. Floor can suspend or close a space that breaks these terms.",
  },
];
