import { describe, expect, it } from "vitest";

import { calculateRemovalSafety, ratingChanged } from "@/lib/participants/reconciliation";

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
});
