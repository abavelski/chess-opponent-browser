import { htmlText, ratingFromText } from "./html.mjs";

export function parseFideProfileHtml(html) {
  const text = htmlText(html);
  const match = text.match(/(\d{3,4}|Not rated)\s*STANDARD/i);
  if (!match) throw new Error("FIDE profile layout changed: Standard rating was not found.");
  return { fideRating: ratingFromText(match[1]) };
}

export async function fetchFideProfile(page, player) {
  const url = player.fideProfileUrl ?? (player.fideId ? `https://ratings.fide.com/profile/${player.fideId}` : null);
  if (!url) return { status: "skipped", reason: "No FIDE identity." };
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  let html = await page.content();
  // FIDE occasionally serves a cached, empty HTTP 200 for a valid profile.
  // Retry that response once with a fresh URL, retaining the canonical URL.
  if (!htmlText(html)) {
    const retryUrl = new URL(url);
    retryUrl.searchParams.set("sync-refresh", String(Date.now()));
    await page.goto(retryUrl.href, { waitUntil: "domcontentloaded", timeout: 30000 });
    html = await page.content();
  }
  return { status: "updated", profileUrl: url, ...parseFideProfileHtml(html) };
}
