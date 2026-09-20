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
  return { status: "updated", profileUrl: url, ...parseFideProfileHtml(await page.content()) };
}
