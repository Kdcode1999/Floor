// Dates, durations and money in words. Plain logic, tested in tests/.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "12 Dec 2026", in the phone's own language. */
export function formatDay(value: string | number, locale?: string): string {
  return new Date(value).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

/** "30 days", "1 day". */
export function days(count: number): string {
  return count === 1 ? "1 day" : `${count} days`;
}

/** How long ago something happened: "Just now", "12 min ago", "3 hours ago", "Yesterday", "5 days ago", then the date. */
export function timeAgo(value: string | number, now: number, locale?: string): string {
  const gap = now - new Date(value).getTime();
  if (gap < MINUTE) return "Just now";
  if (gap < HOUR) return `${Math.floor(gap / MINUTE)} min ago`;
  if (gap < DAY) {
    const hours = Math.floor(gap / HOUR);
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  if (gap < 2 * DAY) return "Yesterday";
  if (gap < 14 * DAY) return `${Math.floor(gap / DAY)} days ago`;
  return formatDay(value, locale);
}

/** Whole days from now until a moment, rounded up. Zero or less when it has passed. */
export function daysUntil(value: string | number, now: number): number {
  return Math.ceil((new Date(value).getTime() - now) / DAY);
}

/** "₦25,000", "$40", or "25 USDT" for money that is not an ordinary currency. */
export function formatPrice(cents: number, currency: string, locale?: string): string {
  const amount = cents / 100;
  const whole = Number.isInteger(amount);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(amount);
  } catch {
    // Not a currency the phone knows, such as USDT.
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount);
    return `${number} ${currency}`;
  }
}
