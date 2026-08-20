import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDashboard } from "../components/admin/admin-dashboard";
import type { ManagedTournament } from "../lib/admin/tournaments";
import type { ManagedAccountUser } from "../lib/admin/users";

describe("STEP 25I-C1-C8B admin tournament management UI", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("adds a Turneringer tab with all-tournament search, filters and safe inspection", () => {
    render(<AdminDashboard users={users} tournaments={tournaments} currentUserId={adminUserId} />);

    fireEvent.click(screen.getByRole("button", { name: "Turneringer" }));

    expect(screen.getByText("TURNERINGSSTYRING")).toBeInTheDocument();
    expect(screen.getAllByText("Creator Cup").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Creator One").length).toBeGreaterThan(0);
    expect(screen.getAllByText("@creator").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Controller Two").length).toBeGreaterThan(0);
    expect(screen.getByText("Ingen turneringer kan slettes her.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Overtag styring" })[0]).toHaveClass("whitespace-nowrap");
    expect(screen.getAllByRole("button", { name: "Åbn" })[0]).toHaveClass("whitespace-nowrap");

    fireEvent.change(screen.getByLabelText("Søg"), { target: { value: "fast makker" } });
    expect(screen.getAllByText("Partner Cup").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Creator Cup")).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Søg"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "finished" } });
    expect(screen.getAllByText("Partner Cup").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Creator Cup")).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Format"), { target: { value: "mexicano" } });
    expect(screen.getAllByText("Creator Cup").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Partner Cup")).toHaveLength(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Åbn" })[0]);
    expect(screen.getAllByTestId("admin-tournament-inspection")[0]).toHaveTextContent("Inspektion");
    expect(screen.getAllByTestId("admin-tournament-inspection")[0]).toHaveTextContent("Runde");
  });

  it("requires confirmation and refreshes the row after admin takeover", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      tournament: {
        ...tournaments[0],
        controller: { userId: adminUserId, displayName: "Admin One", username: "admin" },
        isControlledByCurrentAdmin: true,
      },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminDashboard users={users} tournaments={tournaments} currentUserId={adminUserId} />);

    fireEvent.click(screen.getByRole("button", { name: "Turneringer" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Overtag styring" })[0]);

    const dialog = screen.getByRole("dialog", { name: "Overtag styring af turnering?" });
    expect(within(dialog).getByText("Creator Cup")).toBeInTheDocument();
    expect(within(dialog).getByText("Creator One (@creator)")).toBeInTheDocument();
    expect(within(dialog).getByText("Controller Two (@controller)")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Overtag styring" }));

    await screen.findByText("Du styrer nu denne turnering.");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getAllByText("Admin One").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Du styrer").length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/tournaments/${tournaments[0].id}/takeover`, { method: "POST" });
  });
});

const adminUserId = "00000000-0000-4000-8000-00000000ad01";

const users: ManagedAccountUser[] = [{
  userId: adminUserId,
  displayName: "Admin One",
  username: "admin",
  email: "admin@example.com",
  role: "admin",
  emailVerified: true,
  status: "active",
}];

const tournaments: ManagedTournament[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    name: "Creator Cup",
    format: "mexicano",
    status: "active",
    activeRoundNumber: 1,
    courtCount: 2,
    configuredRounds: 5,
    createdAt: "2026-08-20T10:00:00.000Z",
    updatedAt: "2026-08-20T11:00:00.000Z",
    creator: { userId: "00000000-0000-4000-8000-0000000000a1", displayName: "Creator One", username: "creator" },
    controller: { userId: "00000000-0000-4000-8000-0000000000b2", displayName: "Controller Two", username: "controller" },
    isControlledByCurrentAdmin: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    name: "Partner Cup",
    format: "fixed-partner-mexicano",
    status: "finished",
    activeRoundNumber: 5,
    courtCount: 2,
    configuredRounds: 5,
    createdAt: "2026-08-19T10:00:00.000Z",
    updatedAt: "2026-08-19T11:00:00.000Z",
    creator: { userId: adminUserId, displayName: "Admin One", username: "admin" },
    controller: { userId: adminUserId, displayName: "Admin One", username: "admin" },
    isControlledByCurrentAdmin: true,
  },
];
