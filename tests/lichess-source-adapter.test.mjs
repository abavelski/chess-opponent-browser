import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  fetchLichessBroadcastPgn,
  fetchLichessBroadcastRoundPgn,
  fetchLichessBroadcastTour,
  fetchLichessFideBroadcasts,
  parseLichessFideBroadcastsHtml,
} from "../lib/local/sources/lichess.mjs";

const fixture = new URL("./fixtures/lichess-fide-player.html", import.meta.url);

describe("Lichess broadcast source adapter", () => {
  it("can export an individual round when a full tournament export is unavailable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('[Event "Round export"]\n\n1. e4 e5 *'));
    expect(await fetchLichessBroadcastRoundPgn("Round123", { fetchImpl })).toContain("Round export");
    expect(fetchImpl.mock.calls[0][0]).toBe("https://lichess.org/api/broadcast/round/Round123.pgn");
  });

  it("retries a PGN export whose response stream terminates early", async () => {
    vi.useFakeTimers();
    try {
      const brokenBody = new ReadableStream({ start(controller) { controller.error(new TypeError("terminated")); } });
      const fetchImpl = vi.fn()
        .mockResolvedValueOnce(new Response(brokenBody))
        .mockResolvedValueOnce(new Response('[Event "Recovered stream"]\n\n1. e4 e5 *'));
      const request = fetchLichessBroadcastPgn("Tour1234", { fetchImpl });
      await vi.advanceTimersByTimeAsync(2500);
      expect(await request).toContain("Recovered stream");
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("honors Retry-After before retrying a rate-limited request", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn()
        .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "120" } }))
        .mockResolvedValueOnce(new Response('[Event "Recovered"]\n\n1. e4 e5 *'));
      const request = fetchLichessBroadcastPgn("Tour1234", { fetchImpl });
      await vi.advanceTimersByTimeAsync(119_999);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(await request).toContain("Recovered");
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("parses recent broadcasts from a FIDE player page", async () => {
    const html = await readFile(fixture, "utf8");
    expect(parseLichessFideBroadcastsHtml(html)).toEqual([
      {
        lastActivityAt: "2026-09-13T11:46:40.555Z",
        roundId: "ox8sN2xk",
        roundUrl: "https://lichess.org/broadcast/nordic-school-team-chess-championships-2026-group-a-u17/round-5/ox8sN2xk",
        title: "Nordic School Team Chess Championships 2026 - Group A (U17)",
      },
      {
        lastActivityAt: null,
        roundId: "6lQVUyxa",
        roundUrl: "https://lichess.org/broadcast/danish-youth-championship-2025-u08-u10-u12/round-7/6lQVUyxa",
        title: "Danish Youth Championship 2025 & finals",
      },
    ]);
  });

  it("resolves a round to its tournament and downloads its PGN", async () => {
    const requests = [];
    const fetchImpl = async (url) => {
      requests.push(url);
      if (String(url).endsWith("/api/broadcast/example/round-1/AbCd1234")) {
        return new Response(JSON.stringify({ tour: { id: "Tour1234", name: "Example", url: "https://lichess.org/broadcast/example/Tour1234" } }));
      }
      return new Response('[Event "Example"]\n\n1. e4 e5 *', { headers: { "content-type": "application/x-chess-pgn" } });
    };

    const tour = await fetchLichessBroadcastTour(
      { roundId: "AbCd1234", roundUrl: "https://lichess.org/broadcast/example/round-1/AbCd1234", title: "Example" },
      { fetchImpl },
    );
    expect(tour.id).toBe("Tour1234");
    expect(await fetchLichessBroadcastPgn(tour.id, { fetchImpl })).toContain("1. e4");
    expect(requests).toEqual([
      "https://lichess.org/api/broadcast/example/round-1/AbCd1234",
      "https://lichess.org/api/broadcast/Tour1234.pgn",
    ]);
  });

  it("uses the official FIDE name to build the canonical profile URL", async () => {
    const requests = [];
    const html = await readFile(fixture, "utf8");
    const fetchImpl = async (url) => {
      requests.push(url);
      return String(url).includes("/api/fide/player/")
        ? new Response(JSON.stringify({ id: 1482475, name: "Tursic, Benjamin" }))
        : new Response(html);
    };

    const broadcasts = await fetchLichessFideBroadcasts("1482475", { fetchImpl });
    expect(broadcasts).toHaveLength(2);
    expect(requests).toEqual([
      "https://lichess.org/api/fide/player/1482475",
      "https://lichess.org/fide/1482475/Tursic_Benjamin",
    ]);
  });

  it("fails clearly when tournament cards no longer match the expected layout", () => {
    expect(() => parseLichessFideBroadcastsHtml('<div class="fide-player__tours"><a>Changed</a></div>'))
      .toThrow("page layout may have changed");
  });
});
