import type { Metadata } from "next";

import { AccountApp } from "@/features/account/AccountApp";

export const metadata: Metadata = {
  title: "Your account",
  description: "Delete your Floor account and everything that goes with it.",
  robots: { index: false },
};

/** A person's own account on the web: where an account can be deleted without the app. */
export default function AccountPage() {
  return <AccountApp />;
}
