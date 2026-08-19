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
    expect(qrCode.size).toBe(37);

    expectAlignmentPattern(qrCode.modules, 30, 30);
  });

  it("encodes final result QR payload as the public result URL only", () => {
    const resultUrl = "https://lezgotournament.vercel.app/result/ABCDEFGHJKLM2345";
    const qrCode = createQrCodeMatrix(resultUrl);

    expect(qrCode.payload).toBe(resultUrl);
    expect(qrCode.payload).toContain("/result/ABCDEFGHJKLM2345");
    expect(qrCode.payload).not.toMatch(/token|secret|pin|share|SUPABASE/i);
  });
});

function expectAlignmentPattern(modules: boolean[][], centerX: number, centerY: number): void {
  const expected = [
    [true, true, true, true, true],
    [true, false, false, false, true],
    [true, false, true, false, true],
    [true, false, false, false, true],
    [true, true, true, true, true],
  ];

  for (let y = 0; y < expected.length; y += 1) {
    for (let x = 0; x < expected[y].length; x += 1) {
      expect(modules[centerY - 2 + y][centerX - 2 + x]).toBe(expected[y][x]);
    }
  }
}
