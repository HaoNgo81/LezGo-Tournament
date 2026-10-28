import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppVersionLabel, formatAppVersionLabel } from "../components/layout/app-version-label";

describe("app version label", () => {
  it("shows the short commit and marks preview builds as test versions", () => {
    expect(formatAppVersionLabel("25137f782a41ba8d92327a24b13793a4ac026332", "production")).toBe("Version 25137f7");
    expect(formatAppVersionLabel("25137f782a41ba8d92327a24b13793a4ac026332", "preview")).toBe("Version 25137f7 · Testversion");
    expect(formatAppVersionLabel("", "development")).toBe("Version lokal · Udvikling");
    expect(formatAppVersionLabel(undefined, undefined)).toBe("Version lokal · Udvikling");
  });

  it("renders the label", () => {
    render(<AppVersionLabel />);

    expect(screen.getByTestId("app-version-label")).toHaveTextContent(/^Version /);
  });
});
