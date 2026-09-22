/** Bounded, deterministic parser: unsupported/ambiguous requests ask for clarification. */
export function parseRequest(
  text: string,
  location: string,
  memories: string[],
  now: number,
) {
  if (
    !/\bmassage\b/i.test(text) ||
    /\b(dinner|flight|hotel|haircut)\b/i.test(text)
  )
    throw new Error(
      "This demo supports massage inquiries only. Try: Thai massage near Tanjong Pagar this Saturday afternoon under S$100.",
    );
  const areaMatch = text.match(
    /\b(?:near|in|around)\s+(.+?)(?=\s+(?:this|next|on|tomorrow|today|under|below|for|with|at|please)\b|[,.;!?]|$)/i,
  );
  const area =
    areaMatch && !/^(me|my location)$/i.test(areaMatch[1].trim())
      ? areaMatch[1].trim()
      : location;
  if (!/tanjong pagar/i.test(area))
    throw new Error(
      "This demo researches Tanjong Pagar, Singapore only. Specify that area in your request; your saved location has not been changed.",
    );
  const budgetMatch = text.match(
    /(?:under|below|budget(?:\s+of)?|up to)\s*(?:S\$|SGD\s*|\$)?(\d+(?:\.\d{1,2})?)/i,
  );
  const budgetCents = budgetMatch
    ? Math.round(Number(budgetMatch[1]) * 100)
    : undefined;
  if (budgetCents !== undefined && (budgetCents <= 0 || budgetCents > 100000))
    throw new Error("Please use a massage budget between S$1 and S$1,000.");
  const sg = new Date(now + 8 * 3600000);
  const date = new Date(
    Date.UTC(sg.getUTCFullYear(), sg.getUTCMonth(), sg.getUTCDate()),
  );
  const explicit = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const day = days.findIndex((d) => new RegExp(`\\b${d}\\b`, "i").test(text));
  if (explicit) {
    const parsed = new Date(explicit[1] + "T00:00:00Z");
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== explicit[1]
    )
      throw new Error("Please provide a valid date.");
    date.setTime(parsed.getTime());
  } else if (/\btomorrow\b/i.test(text)) date.setUTCDate(date.getUTCDate() + 1);
  else if (/\btoday\b/i.test(text)) {
    /* current Singapore date */
  } else if (day >= 0) {
    let delta = (day - date.getUTCDay() + 7) % 7;
    if (/\bnext\b/i.test(text)) delta += 7;
    date.setUTCDate(date.getUTCDate() + delta);
  } else
    throw new Error(
      "Please include a weekday, today, tomorrow, or a date such as 2026-09-26.",
    );
  if (/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(text))
    throw new Error(
      "For this demo, request morning, afternoon, or evening rather than an exact appointment time.",
    );
  const period = /\bmorning\b/i.test(text)
    ? "morning"
    : /\bevening\b/i.test(text)
      ? "evening"
      : /\bafternoon\b/i.test(text)
        ? "afternoon"
        : null;
  if (!period)
    throw new Error(
      "Please specify morning, afternoon, or evening. These are requested times, not confirmed availability.",
    );
  const hours = { morning: [9, 12], afternoon: [12, 18], evening: [18, 21] }[
    period
  ];
  const iso = date.toISOString().slice(0, 10);
  const requestedStart = `${iso}T${String(hours[0]).padStart(2, "0")}:00:00+08:00`;
  const requestedEnd = `${iso}T${String(hours[1]).padStart(2, "0")}:00:00+08:00`;
  if (Date.parse(requestedStart) <= now)
    throw new Error("Please choose a future date and time window.");
  const explicitStyle = text.match(/\b(Thai|deep[ -]tissue|Swedish)\b/i)?.[0];
  const style =
    explicitStyle ?? (memories.some((m) => /Thai/i.test(m)) ? "Thai" : "");
  return {
    area: "Tanjong Pagar, Singapore",
    style,
    requestedWindow: `${iso} ${period} (Singapore time)`,
    requestedStart,
    requestedEnd,
    ...(budgetCents === undefined ? {} : { budgetCents }),
  };
}
