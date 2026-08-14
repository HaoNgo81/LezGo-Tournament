import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceWorkerRegistration } from "../components/pwa/service-worker-registration";

describe("service worker registration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not register the app service worker outside production and removes stale registrations", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const unregister = vi.fn().mockResolvedValue(true);
    const getRegistrations = vi.fn().mockResolvedValue([{ unregister }]);
    Object.defineProperty(window.navigator, "serviceWorker", {
      value: { getRegistrations, register },
      configurable: true,
    });

    render(<ServiceWorkerRegistration />);

    await waitFor(() => {
      expect(getRegistrations).toHaveBeenCalled();
      expect(unregister).toHaveBeenCalled();
    });
    expect(register).not.toHaveBeenCalled();
  });
});
