import "server-only";

import webpush from "web-push";

import { WEB_PUSH, webPushConfigured } from "./env";

// Alerts to the web app on a phone's home screen, sent straight to the browser's push service
// (Apple's for an iPhone), by the Web Push standard. Floor's server signs each message with its
// own key pair, which the browser was given when it subscribed.

/** A web app's address for alerts: the subscription its browser gave, kept as JSON. */
export const isWebAddress = (token: string) => token.startsWith("{");

interface Words {
  title: string;
  body: string;
  data: Record<string, string>;
}

/**
 * Sends one alert to each web app address. Answers with how many went out, and the addresses
 * the browser said no longer exist (the web app was removed, or alerts switched off).
 */
export async function sendWebAlerts(addresses: string[], words: Words): Promise<{ sent: number; dead: string[]; failed: number }> {
  const result = { sent: 0, dead: [] as string[], failed: 0 };
  if (addresses.length === 0) return result;
  if (!webPushConfigured) return { ...result, failed: addresses.length };
  const message = JSON.stringify({ title: words.title, body: words.body, data: words.data });
  await Promise.all(
    addresses.map(async (address) => {
      try {
        const subscription = JSON.parse(address) as webpush.PushSubscription;
        await webpush.sendNotification(subscription, message, {
          vapidDetails: { subject: WEB_PUSH.subject, publicKey: WEB_PUSH.publicKey, privateKey: WEB_PUSH.privateKey },
          TTL: 24 * 60 * 60,
          urgency: "high",
        });
        result.sent += 1;
      } catch (problem) {
        const status = (problem as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410 || problem instanceof SyntaxError) result.dead.push(address);
        else result.failed += 1;
      }
    }),
  );
  return result;
}
