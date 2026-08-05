import { describe, expect, it } from "vitest";
import { createQrCodeMatrix, createShareUrl } from "../lib/sharing";

describe("sharing", () => {
  it("creates a share url for the QR read-only page", () => {
    expect(createShareUrl("https://lezgo.example", "/qr")).toBe("https://lezgo.example/qr");
  });

  it("creates a QR matrix with finder patterns", () => {
    const qrCode = createQrCodeMatrix("https://lezgo.example/qr");

    expect(qrCode.size).toBeGreaterThanOrEqual(21);
    expect(qrCode.modules).toHaveLength(qrCode.size);
    expect(qrCode.modules[0][0]).toBe(true);
    expect(qrCode.modules[6][6]).toBe(true);
    expect(qrCode.modules[qrCode.size - 7][0]).toBe(true);
    expect(qrCode.modules[0][qrCode.size - 7]).toBe(true);
  });
});
