/** Someone asking for VIP: they paid outside the app, or opened an account with the mentor's broker. */
export interface AccessRequest {
  id: string;
  /** The member's display name. */
  name: string;
  kind: "payment" | "broker";
  /** What the member wrote with their proof. */
  detail: string;
}

// Sample requests, so the queue can be seen before it is connected to the database.
export const sampleRequests: AccessRequest[] = [
  { id: "request-1", name: "Ada O.", kind: "broker", detail: "Account ID 4830 2291" },
  { id: "request-2", name: "Sam K.", kind: "payment", detail: "USDT transfer, screenshot attached" },
];
