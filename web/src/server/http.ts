import "server-only";

// The phone app calls these routes from its own address, and sends the person's login as a
// header, never as a cookie. So any address may call them: the login is what counts.
const OPEN = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export function reply(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: OPEN });
}

/** A refusal. `error` is a short code the apps turn into a sentence. */
export function refuse(status: number, error: string): Response {
  return reply({ error }, status);
}

/** The answer to a browser asking whether it may call a route. */
export function preflight(): Response {
  return new Response(null, { status: 204, headers: OPEN });
}

/** The login sent with a request, or null. */
export function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token.split(".").length === 3 ? token : null;
}

/** The request's JSON body as an object. Anything else reads as empty. */
export async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A field of the body, when it is an id. */
export function id(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

/**
 * Turns the database's answer to a call made as the person into a refusal, or null when the
 * call went through. The database's own short codes are passed on.
 */
export function refusalFor(error: { message: string; code?: string } | null): Response | null {
  if (!error) return null;
  if (error.code === "42501" || error.message === "not_allowed") return refuse(403, "not_allowed");
  if (error.code === "PGRST301" || /jwt/i.test(error.message)) return refuse(401, "signed_out");
  if (/^[a-z_]{3,40}$/.test(error.message)) return refuse(400, error.message);
  return refuse(502, "database_unavailable");
}
