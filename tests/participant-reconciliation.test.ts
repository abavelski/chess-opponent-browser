import { describe, expect, it } from "vitest";

import { calculateRemovalSafety, ratingChanged, reconciledProviderRating } from "@/lib/participants/reconciliation";

describe("participant reconciliation safety", () => {
  it("requires force when more than a quarter of a roster would be removed", () => {
    expect(calculateRemovalSafety(40, 11)).toMatchObject({
      removalPercent: 27.5,
      requiresForce: true,
    });
    expect(calculateRemovalSafety(40, 10).requiresForce).toBe(false);
  });

  it("does not treat an empty existing roster as a destructive removal", () => {
    expect(calculateRemovalSafety(0, 0)).toMatchObject({
      removalPercent: 0,
      requiresForce: false,
    });
  });

  it("detects DSU and FIDE rating changes", () => {
    expect(ratingChanged(1800, 1750, 1800, 1750)).toBe(false);
    expect(ratingChanged(1800, 1750, 1810, 1750)).toBe(true);
  });

  it("preserves a known rating unless that provider was successfully refreshed", () => {
    expect(reconciledProviderRating(1800, null, null)).toBe(1800);
    expect(reconciledProviderRating(1800, null, "2026-09-20T10:00:00.000Z")).toBeNull();
    expect(reconciledProviderRating(1800, 1812, "2026-09-20T10:00:00.000Z")).toBe(1812);
  });
});
