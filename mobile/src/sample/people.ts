// Who is in the sample space, by id. Kept apart from what the space holds, so the little that
// the rest of the app needs to know about the sample does not bring all of it along.

import { fixedId } from "./world";

/** The sample space. */
export const SPACE = fixedId(0x100);

/** The people in it. The first three are the ones the app can be looked at as. */
export const PEOPLE = {
  kay: fixedId(1),
  tobi: fixedId(2),
  vee: fixedId(3),
  /** Someone who joined an hour ago, has not paid, and has not chosen a name yet. */
  newcomer: fixedId(4),
  chidi: fixedId(5),
  ada: fixedId(6),
  sam: fixedId(7),
  ngozi: fixedId(8),
  femi: fixedId(9),
  zainab: fixedId(10),
  emeka: fixedId(11),
  dayo: fixedId(12),
  bola: fixedId(13),
} as const;
