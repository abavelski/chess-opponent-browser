import { describe, expect, it } from "vitest";

import {
  aliasCanBelongToPlayer,
  hasDirectFideConflict,
  normalizeAliasKey,
  sameIdentityEvidence,
} from "../lib/identities/domain";
import {
  buildIdentityIndex,
  resolveImportedSide,
} from "../lib/imports/persist";

const players = [
  { id: 1, name: "Jan Kowalski", fideId: "111" },
  { id: 2, name: "Anna Nowak", fideId: "222" },
  { id: 3, name: "Common Name", fideId: null },
  { id: 4, name: "Common Name", fideId: null },
];

describe("player identity resolution", () => {
  it("normalizes aliases deterministically", () => {
    expect(normalizeAliasKey("  J.\u00a0KOWALSKI  ")).toBe("j. kowalski");
    expect(normalizeAliasKey("J. Kowalski")).toBe("j. kowalski");
  });

  it("uses an exact safe alias before canonical-name fallback", () => {
    const index = buildIdentityIndex(players, [
      { playerId: 1, normalizedKey: "j. kowalski" },
    ]);

    expect(resolveImportedSide({ name: "J. Kowalski", fideId: null }, index)).toEqual({
      playerId: 1,
      method: "alias",
    });
  });

  it("keeps exact FIDE ID stronger than an alias", () => {
    const index = buildIdentityIndex(players, [
      { playerId: 1, normalizedKey: "anna nowak" },
    ]);

    expect(resolveImportedSide({ name: "Anna Nowak", fideId: "222" }, index)).toEqual({
      playerId: 2,
      method: "fide",
    });
  });

  it("does not let an alias contradict non-empty FIDE evidence", () => {
    const index = buildIdentityIndex(players, [
      { playerId: 1, normalizedKey: "j. kowalski" },
    ]);

    expect(resolveImportedSide({ name: "J. Kowalski", fideId: "999" }, index)).toEqual({
      playerId: null,
      method: null,
    });
  });

  it("does not auto-resolve an ambiguous alias", () => {
    const index = buildIdentityIndex(players, [
      { playerId: 1, normalizedKey: "j. kowalski" },
      { playerId: 2, normalizedKey: "j. kowalski" },
    ]);

    expect(resolveImportedSide({ name: "J. Kowalski", fideId: null }, index)).toEqual({
      playerId: null,
      method: null,
    });
  });

  it("keeps ambiguous canonical names unresolved", () => {
    const index = buildIdentityIndex(players);
    expect(resolveImportedSide({ name: "Common Name", fideId: null }, index)).toEqual({
      playerId: null,
      method: null,
    });
  });

  it("recognizes direct FIDE conflicts before bulk resolution", () => {
    expect(hasDirectFideConflict("111", "222")).toBe(true);
    expect(hasDirectFideConflict("111", "111")).toBe(false);
    expect(hasDirectFideConflict("111", null)).toBe(false);
  });

  it("allows an alias only when it is unclaimed or already belongs to the target", () => {
    expect(aliasCanBelongToPlayer([], 1)).toBe(true);
    expect(aliasCanBelongToPlayer([1], 1)).toBe(true);
    expect(aliasCanBelongToPlayer([2], 1)).toBe(false);
  });

  it("keeps unresolved grouping separated by FIDE evidence", () => {
    expect(
      sameIdentityEvidence(
        { normalizedName: "j. kowalski", sourceFideId: "111" },
        { normalizedName: "j. kowalski", sourceFideId: "222" },
      ),
    ).toBe(false);
  });
});
