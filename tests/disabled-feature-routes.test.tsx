import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RemotePage from "../app/remote/page";
import RemoteHandoffPage from "../app/remote/handoff/[reference]/page";
import QrPage from "../app/qr/page";
import SharePage from "../app/share/page";
import TemplatesPage from "../app/templates/page";
import TvPage from "../app/tv/page";

describe("STEP 25V disabled sharing/template routes", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a controlled disabled state for legacy remote entry points", async () => {
    render(<RemotePage />);
    expect(screen.getByTestId("disabled-feature-page")).toHaveTextContent("Denne funktion er ikke længere tilgængelig.");
    expect(screen.queryByLabelText("Turneringskode")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Adgangskode")).not.toBeInTheDocument();

    cleanup();
    render(await RemoteHandoffPage({ params: Promise.resolve({ reference: "OLD_HANDOFF_REFERENCE" }) }));
    expect(screen.getByTestId("disabled-feature-page")).toHaveTextContent("Denne funktion er ikke længere tilgængelig.");
    expect(screen.queryByText(/skrivebeskyttet turnering/i)).not.toBeInTheDocument();
  });

  it("shows a controlled disabled state for QR, share, templates and TV pages", () => {
    for (const Page of [QrPage, SharePage, TemplatesPage, TvPage]) {
      cleanup();
      render(<Page />);
      expect(screen.getByTestId("disabled-feature-page")).toHaveTextContent("Denne funktion er ikke længere tilgængelig.");
      expect(screen.getByRole("link", { name: "Ny turnering" })).toHaveAttribute("href", "/new-tournament");
      expect(screen.getByRole("link", { name: "Turneringer" })).toHaveAttribute("href", "/tournaments");
      expect(screen.queryByText(/QR-kode klar|TV \/ Livescore|Scoreindtastning|Turneringsskabeloner|Del \/ vis på anden enhed/i)).not.toBeInTheDocument();
    }
  });
});
