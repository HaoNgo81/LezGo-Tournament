import { describe, expect, it } from "vitest";
import manifest from "../app/manifest";

describe("manifest", () => {
  it("allows both horizontal and vertical display orientations", () => {
    expect(manifest().orientation).toBe("any");
  });
});
