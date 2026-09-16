import { describe, expect, it } from "vitest";

import { getEnvironmentLabel } from "@/lib/environment";

describe("getEnvironmentLabel", () => {
  it("uses Vercel's production environment when present", () => {
    expect(getEnvironmentLabel("production", "development")).toBe("Production");
  });

  it("uses Vercel's preview environment when present", () => {
    expect(getEnvironmentLabel("preview", "production")).toBe("Preview");
  });

  it("defaults to development for local development", () => {
    expect(getEnvironmentLabel(undefined, "development")).toBe("Development");
  });
});
