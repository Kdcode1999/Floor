// The account page's plain logic: what deleting an account takes with it, in words, and how
// refusals are worded. Tested in tests/.

/** What the database says deleting the account would take with it. */
export interface AccountSummary {
  user_id: string;
  email: string;
  /** The space this person owns, if they are a mentor. */
  space_id: string | null;
  space_name: string | null;
  /** How many other people are in that space. */
  members: number | null;
}

/** What the person is told before they decide. One sentence per thing that goes. */
export function whatGoes(summary: AccountSummary): string[] {
  const lines = ["Your name, your email address and your sign-in."];
  if (summary.space_id && summary.space_name) {
    const count = summary.members ?? 0;
    const people = count === 0 ? "" : count === 1 ? " Its 1 member loses it." : ` Its ${count} members lose it.`;
    lines.push(`${summary.space_name}, the space you run, with every post, lesson, video and chat in it.${people}`);
    lines.push("Your place in any other space, with everything you wrote in its groups and anything you uploaded there.");
  } else {
    lines.push("Your place in every space you joined, with any VIP time you have left.");
    lines.push("Everything you wrote in groups.");
    lines.push("Anything you uploaded, such as payment proofs.");
  }
  return lines;
}

/** True when what was typed is the space's name, give or take capitals and spaces. */
export function nameMatches(typed: string, name: string | null): boolean {
  const plain = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();
  return name !== null && plain(typed) !== "" && plain(typed) === plain(name);
}

/** What to say when deleting the account failed. */
export function deleteMessage(code: string | null | undefined): string {
  if (code === "name_needed") return "Type your space's name exactly, to show you mean it.";
  if (code === "signed_out") return "Sign in again, then delete your account.";
  if (code === "offline") return "Check your connection and try again.";
  if (code === "not_set_up") return "Accounts cannot be deleted from this copy of Floor yet.";
  if (code === "sample") return "This is the sample space. There is no account here to delete.";
  return "Your account couldn't be deleted just now. Nothing is half done: try again.";
}
