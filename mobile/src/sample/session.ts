// Who the sample space is being looked at as. The app starts as the mentor, and the Account
// screen can change that to a VIP member or to someone who has just joined and not paid.
//
// No phone code.

import { PEOPLE } from "./people";

export type Persona = "mentor" | "vip" | "free";

export interface SamplePerson {
  persona: Persona;
  id: string;
  email: string;
  /** How the Account screen names the choice. */
  label: string;
  /** Who this is, in a few words. */
  detail: string;
}

export const SAMPLE_PEOPLE: SamplePerson[] = [
  { persona: "mentor", id: PEOPLE.kay, email: "kay@example.com", label: "Mentor", detail: "Kay, who runs the space" },
  { persona: "vip", id: PEOPLE.vee, email: "vee@example.com", label: "VIP member", detail: "Vee, who has paid" },
  { persona: "free", id: PEOPLE.newcomer, email: "newcomer@example.com", label: "Free member", detail: "Someone who joined an hour ago and has not paid" },
];

let current: SamplePerson = SAMPLE_PEOPLE[0];
const listeners = new Set<() => void>();

export const sampleSession = {
  /** The person the sample is being looked at as. */
  person: (): SamplePerson => current,

  /** Looks at the sample as someone else. */
  become(persona: Persona): void {
    const next = SAMPLE_PEOPLE.find((each) => each.persona === persona);
    if (!next || next === current) return;
    current = next;
    for (const listener of listeners) listener();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
