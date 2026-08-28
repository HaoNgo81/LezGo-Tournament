import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const globalCss = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const tabletLandscapeQuery = "@media (orientation: landscape) and (min-width: 900px) and (max-width: 1199px) and (min-height: 650px) and (max-height: 900px)";

describe("tablet landscape live tournament layout", () => {
  it("limits compact mode by orientation, width, and viewport height", () => {
    expect(globalCss).toContain(tabletLandscapeQuery);
    expect(globalCss).not.toContain("@media (orientation: portrait) and (min-width: 900px)");
  });

  it("places the courts in a 2 by 2 grid beside standings", () => {
    const compactRules = globalCss.slice(globalCss.indexOf(tabletLandscapeQuery));

    expect(compactRules).toMatch(/\[data-testid="live-desktop-content-grid"\][\s\S]*?grid-template-columns: minmax\(0, 1\.3fr\) minmax\(0, 1fr\)/);
    expect(compactRules).toMatch(/\[data-testid="live-match-card-grid"\][\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  });

  it("compacts court controls and standings rows without hiding them", () => {
    const compactRules = globalCss.slice(globalCss.indexOf(tabletLandscapeQuery));

    expect(compactRules).toMatch(/\[data-testid="live-court-card"\] > button[\s\S]*?min-height: 2\.75rem/);
    expect(compactRules).toMatch(/\[data-testid="live-compact-standings-row"\][\s\S]*?padding: 0\.375rem 0\.5rem/);
    expect(compactRules).not.toMatch(/\[data-testid="live-court-card"\][\s\S]*?display: none/);
    expect(compactRules).not.toMatch(/\[data-testid="live-standings-section"\][\s\S]*?display: none/);
  });
});
