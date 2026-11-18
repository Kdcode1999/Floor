// What the Chat tab shows in the sample space, before the app is connected to anything.

import type { Group } from "./types";

export const sampleGroups: Group[] = [
  {
    id: "sample-general",
    name: "General",
    about: "Open to everyone in the space.",
    audience: "everyone",
    posting: "all",
    canOpen: true,
    canPost: true,
    lastAt: null,
    lastName: null,
    lastBody: null,
    lastHasImage: false,
    unread: 0,
  },
  {
    id: "sample-vip",
    name: "VIP room",
    about: "For VIP members.",
    audience: "vip",
    posting: "all",
    canOpen: true,
    canPost: true,
    lastAt: null,
    lastName: null,
    lastBody: null,
    lastHasImage: false,
    unread: 0,
  },
];
