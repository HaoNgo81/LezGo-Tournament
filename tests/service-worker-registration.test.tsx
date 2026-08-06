import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceWorkerRegistration } from "../components/pwa/service-worker-registration";

describe("service worker registration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers the app service worker when supported", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "serviceWorker", {
      value: { register },
      configurable: true,
    });

    render(<ServiceWorkerRegistration />);

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith("/sw.js");
    });
  });
});
