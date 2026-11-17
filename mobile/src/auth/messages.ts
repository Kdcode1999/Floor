// Turns what the sign-in service says into words a person can act on. Plain logic, tested in tests/.

/** The parts of a sign-in error this file looks at. */
export interface AuthFailure {
  /** The service's short code, for example "otp_expired". */
  code?: string | null;
  /** The HTTP status, when there was a reply at all. */
  status?: number | null;
  /** The error's class name. "AuthRetryableFetchError" means the request never got through. */
  name?: string | null;
  message?: string | null;
}

export const CODE_LENGTH = 6;

/** A light check before asking the server. The server has the final say. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** Keeps only the digits of what was typed or pasted, up to the length of a code. */
export function cleanCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

function offline(failure: AuthFailure): boolean {
  return failure.name === "AuthRetryableFetchError" || failure.status === 0;
}

/** What to say when sending the code failed. */
export function sendCodeMessage(failure: AuthFailure): string {
  if (offline(failure)) return "No connection. Check your internet and try again.";
  switch (failure.code) {
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many codes asked for. Wait a minute, then try again.";
    case "email_address_invalid":
    case "validation_failed":
      return "That email address doesn't look right.";
    case "email_address_not_authorized":
      return "Floor can't send email to this address yet.";
    case "signup_disabled":
    case "email_provider_disabled":
    case "otp_disabled":
      return "Sign-in isn't open right now.";
    case "user_banned":
      return "This account has been closed.";
    default:
      return failure.status === 429
        ? "Too many codes asked for. Wait a minute, then try again."
        : "The code couldn't be sent. Try again.";
  }
}

/** What to say when checking the code failed. */
export function verifyCodeMessage(failure: AuthFailure): string {
  if (offline(failure)) return "No connection. Check your internet and try again.";
  switch (failure.code) {
    case "otp_expired":
    case "invalid_credentials":
    case "validation_failed":
      return "That code is wrong or has run out. Check it, or send a new one.";
    case "over_request_rate_limit":
      return "Too many tries. Wait a minute, then try again.";
    case "user_banned":
      return "This account has been closed.";
    default:
      return failure.status === 429
        ? "Too many tries. Wait a minute, then try again."
        : "The code couldn't be checked. Try again.";
  }
}
