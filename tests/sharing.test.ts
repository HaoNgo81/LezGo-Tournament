import { describe, expect, it } from "vitest";
import { createQrCodeMatrix, createShareUrl } from "../lib/sharing";

describe("sharing", () => {
  it("creates a share url for the QR read-only page", () => {
    expect(createShareUrl("https://lezgo.example", "/qr")).toBe("https://lezgo.example/qr");
  });

  it("creates a QR matrix with finder patterns", () => {
    const qrCode = createQrCodeMatrix("https://lezgo.example/qr");

    expect(qrCode.size).toBeGreaterThanOrEqual(21);
    expect(qrCode.payload).toBe("https://lezgo.example/qr");
    expect(qrCode.modules).toHaveLength(qrCode.size);
    expect(qrCode.modules[0][0]).toBe(true);
    expect(qrCode.modules[6][6]).toBe(true);
    expect(qrCode.modules[qrCode.size - 7][0]).toBe(true);
    expect(qrCode.modules[0][qrCode.size - 7]).toBe(true);
  });

  it("encodes the exact TV handoff URL payload with alignment patterns for dense QR codes", () => {
    const handoffUrl = "http://192.168.0.60:3015/remote/handoff/1V5PJUUrWN-F4nYEwHrzLfzXVZWaiBLgu_Fm6Y?display=scoreboard";
    const qrCode = createQrCodeMatrix(handoffUrl);

    expect(qrCode.payload).toBe(handoffUrl);
    expect(qrCode.payload).toContain("display=scoreboard");
    expect(qrCode.payload).toContain("/remote/handoff/");
    expect(qrCode.payload).not.toContain("0.0.0.0");
    expect(qrCode.payload).not.toMatch(/\s|["']/);
    expect(qrCode.size).toBeGreaterThanOrEqual(37);
    expect(qrCode.modules).toHaveLength(qrCode.size);
  });

  it("encodes a production-sized canonical TV handoff URL exactly", () => {
    const handoffUrl = "https://lezgotournament.vercel.app/remote/handoff/STEP_25U_FIX5_REFERENCE_WITH_ENTROPY_1234567890?display=scoreboard";
    const qrCode = createQrCodeMatrix(handoffUrl);

    expect(qrCode.payload).toBe(handoffUrl);
    expect(qrCode.payload).toContain("https://lezgotournament.vercel.app/remote/handoff/");
    expect(qrCode.payload).toContain("display=scoreboard");
    expect(qrCode.payload).not.toContain("lez-go-tournament");
    expect(qrCode.modules).toHaveLength(qrCode.size);
    expect(qrCode.modules.every((row) => row.length === qrCode.size)).toBe(true);
    expect(qrCode.modules.flat().some(Boolean)).toBe(true);
  });

  it("encodes final result QR payload as the public result URL only", () => {
    const resultUrl = "https://lezgotournament.vercel.app/result/ABCDEFGHJKLM2345";
    const qrCode = createQrCodeMatrix(resultUrl);

    expect(qrCode.payload).toBe(resultUrl);
    expect(qrCode.payload).toContain("/result/ABCDEFGHJKLM2345");
    expect(qrCode.payload).not.toMatch(/token|secret|pin|share|SUPABASE/i);
  });
});
