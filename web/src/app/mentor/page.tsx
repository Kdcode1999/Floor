import type { Metadata } from "next";

import { MentorApp } from "@/features/mentor/MentorApp";

export const metadata: Metadata = {
  title: "Mentor tools",
  description: "Build your course and upload lessons from a laptop.",
  robots: { index: false },
};

/** The mentor's laptop page. Everything on it happens in the browser, as the signed-in mentor. */
export default function MentorPage() {
  return <MentorApp />;
}
