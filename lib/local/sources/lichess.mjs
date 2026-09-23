import { htmlText } from "./html.mjs";

const LICHESS_ORIGIN = "https://lichess.org";
const ROUND_PATH = /^\/broadcast\/([^/]+)\/([^/]+)\/([A-Za-z0-9]{8})$/;

function requestHeaders(token, accept) {
  const headers = {
    accept,
    "user-agent": "chess-opponent-browser/1.0",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

async function lichessRequest(url, { fetchImpl = fetch, token = "", accept, timeoutMs = 30_000 }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(url, {
      headers: requestHeaders(token, accept),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Lichess request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const retryAfter = response.headers?.get?.("retry-after");
    const suffix = retryAfter ? ` Retry after ${retryAfter} seconds.` : "";
    const error = new Error(`Lichess request failed with HTTP ${response.status}.${suffix}`);
    error.status = response.status;
    throw error;
  }
  return response;
}

export function parseLichessFideBroadcastsHtml(html) {
  const broadcasts = [];
  const seen = new Set();
  const anchorPattern = /<a\b([^>]*\bclass="[^"]*\brelay-card\b[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorPattern.exec(String(html ?? "")))) {
    const hrefMatch = match[1].match(/\bhref="([^"]+)"/i);
    if (!hrefMatch) continue;

    let url;
    try {
      url = new URL(hrefMatch[1], LICHESS_ORIGIN);
    } catch {
      continue;
    }
    if (url.origin !== LICHESS_ORIGIN) continue;

    const pathMatch = url.pathname.match(ROUND_PATH);
    if (!pathMatch || seen.has(pathMatch[3])) continue;
    seen.add(pathMatch[3]);

    const titleMatch = match[2].match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i);
    const activityMatch = match[2].match(/<time\b[^>]*\bdatetime="([^"]+)"/i);
    broadcasts.push({
      roundId: pathMatch[3],
      roundUrl: url.toString(),
      title: htmlText(titleMatch?.[1] ?? "Lichess broadcast"),
      lastActivityAt: activityMatch?.[1] ?? null,
    });
  }

  if (String(html ?? "").includes("fide-player__tours") && broadcasts.length === 0) {
    throw new Error("Lichess FIDE tournament cards were present but could not be parsed; the page layout may have changed.");
  }

  return broadcasts;
}

export async function fetchLichessFideBroadcasts(
  fideId,
  { fetchImpl = fetch, token = "" } = {},
) {
  const normalizedId = String(fideId ?? "").trim();
  if (!/^\d{4,12}$/.test(normalizedId)) throw new Error("A numeric FIDE ID is required.");

  try {
    const playerResponse = await lichessRequest(`${LICHESS_ORIGIN}/api/fide/player/${normalizedId}`, {
      fetchImpl,
      token,
      accept: "application/json",
    });
    const player = await playerResponse.json();
    const slug = String(player?.name ?? "")
      .normalize("NFKC")
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "_")
      .replace(/^_+|_+$/g, "");
    if (!slug) throw new Error("Lichess did not return the FIDE player's name.");

    const response = await lichessRequest(`${LICHESS_ORIGIN}/fide/${normalizedId}/${encodeURIComponent(slug)}`, {
      fetchImpl,
      token,
      accept: "text/html",
    });
    return parseLichessFideBroadcastsHtml(await response.text());
  } catch (error) {
    if (error?.status === 404) return [];
    throw error;
  }
}

export async function fetchLichessBroadcastTour(
  reference,
  { fetchImpl = fetch, token = "" } = {},
) {
  const roundUrl = new URL(reference.roundUrl, LICHESS_ORIGIN);
  if (roundUrl.origin !== LICHESS_ORIGIN || !ROUND_PATH.test(roundUrl.pathname)) {
    throw new Error("The Lichess broadcast round URL is invalid.");
  }

  const response = await lichessRequest(`${LICHESS_ORIGIN}/api${roundUrl.pathname}`, {
    fetchImpl,
    token,
    accept: "application/json",
  });
  const payload = await response.json();
  if (!payload?.tour?.id || !/^[A-Za-z0-9]{8}$/.test(payload.tour.id)) {
    throw new Error("Lichess did not return a broadcast tournament ID.");
  }

  return {
    id: payload.tour.id,
    name: payload.tour.name || reference.title,
    url: payload.tour.url || `${LICHESS_ORIGIN}/broadcast/${payload.tour.id}`,
    discoveredFromRoundId: reference.roundId,
    lastActivityAt: reference.lastActivityAt ?? null,
  };
}

export async function fetchLichessBroadcastPgn(
  tourId,
  { fetchImpl = fetch, token = "", timeoutMs = 45_000 } = {},
) {
  const normalizedId = String(tourId ?? "").trim();
  if (!/^[A-Za-z0-9]{8}$/.test(normalizedId)) {
    throw new Error("The Lichess broadcast tournament ID is invalid.");
  }

  const response = await lichessRequest(`${LICHESS_ORIGIN}/api/broadcast/${normalizedId}.pgn`, {
    fetchImpl,
    token,
    accept: "application/x-chess-pgn",
    timeoutMs,
  });
  return response.text();
}
