import type { RequestItem } from "./api";

// Sample requests, shown only on the sample space so the queue can be looked at with no setup.
export const sampleRequests: RequestItem[] = [
  {
    id: "request-1",
    name: "Ada O.",
    kind: "broker",
    note: "Account ID 4830 2291",
    days: 30,
    proofPath: null,
    createdAt: "2026-11-17T09:00:00Z",
  },
  {
    id: "request-2",
    name: "Sam K.",
    kind: "payment",
    note: "USDT transfer, screenshot attached",
    days: 30,
    proofPath: null,
    createdAt: "2026-11-17T08:00:00Z",
  },
];
