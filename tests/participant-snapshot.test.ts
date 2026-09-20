import { describe, expect, it } from "vitest";

import { parseParticipantSnapshot } from "@/lib/participants/snapshot";

describe("parseParticipantSnapshot", () => {
  it("normalizes a valid local participant snapshot", () => {
    expect(parseParticipantSnapshot({
      tournamentNickname: "furesoe-open",
      participantGroup: "U-14",
      sourceUrl: "https://turnering.skak.dk/example",
      extractedAt: "2026-09-18T10:00:00Z",
      ratingsUpdatedAt: null,
      players: [{
        name: "  Player One  ",
        dsuId: "1234",
        fideId: "1500000",
        club: "Club",
        group: "A",
        tournamentDsuRating: 1900,
        tournamentFideRating: 1850,
        actualDsuRating: 1912,
        actualFideRating: 1864,
        registeredAt: "18-09-2026",
        dsuProfileUrl: "https://rating.skak.dk/1234",
        fideProfileUrl: "https://ratings.fide.com/profile/1500000",
      }],
    })).toMatchObject({
      tournamentNickname: "furesoe-open",
      participantGroup: "U-14",
      players: [expect.objectContaining({ name: "Player One", actualDsuRating: 1912 })],
    });
  });

  it("rejects invalid ratings and duplicate federation ids", () => {
    expect(() => parseParticipantSnapshot({ players: [{ name: "A", actualDsuRating: 5000 }] }))
      .toThrow("Ratings must be whole numbers");
    expect(() => parseParticipantSnapshot({ players: [
      { name: "A", fideId: "42" },
      { name: "B", fideId: "42" },
    ] })).toThrow("Duplicate FIDE ID 42");
  });

  it("removes a tournament seed number from player names", () => {
    expect(parseParticipantSnapshot({
      players: [{ name: "19. Nikolaj Bavelski", dsuId: "100105169" }],
    }).players[0].name).toBe("Nikolaj Bavelski");
  });

  it("normalizes and validates tournament nicknames", () => {
    expect(parseParticipantSnapshot({
      tournamentNickname: " FURESOE-OPEN ",
      players: [],
    }).tournamentNickname).toBe("furesoe-open");
    expect(() => parseParticipantSnapshot({
      tournamentNickname: "../other-tournament",
      players: [],
    })).toThrow("Tournament nickname is invalid");
  });
});
