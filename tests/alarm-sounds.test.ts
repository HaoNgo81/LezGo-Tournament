import { afterEach, describe, expect, it, vi } from "vitest";
import { alarmSoundOptions, playTournamentAlarmSound } from "../lib/tournament-settings";

class FakeGain {
  gain = {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };

  connect = vi.fn();
}

class FakeOscillator {
  type: OscillatorType = "sine";
  frequency = { value: 0 };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  static createdCount = 0;
  static lastInstance: FakeAudioContext | null = null;
  state: AudioContextState = "running";
  currentTime = 0;
  destination = {};
  close = vi.fn().mockResolvedValue(undefined);
  resume = vi.fn().mockResolvedValue(undefined);
  createOscillator = vi.fn(() => new FakeOscillator());
  createGain = vi.fn(() => new FakeGain());

  constructor() {
    FakeAudioContext.createdCount += 1;
    FakeAudioContext.lastInstance = this;
  }
}

describe("alarm sounds", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    FakeAudioContext.createdCount = 0;
    FakeAudioContext.lastInstance = null;
    Reflect.deleteProperty(window, "AudioContext");
  });

  it("provides at least three built-in alarm sounds", () => {
    expect(alarmSoundOptions.length).toBeGreaterThanOrEqual(3);
    expect(alarmSoundOptions.map((option) => option.id)).toContain("standard");
  });

  it("plays the selected alarm sound without throwing", async () => {
    Object.defineProperty(window, "AudioContext", { configurable: true, value: FakeAudioContext });

    await expect(playTournamentAlarmSound("bell")).resolves.toBe(true);

    expect(FakeAudioContext.createdCount).toBe(1);
    expect(FakeAudioContext.lastInstance?.createOscillator).toHaveBeenCalledTimes(3);
  });

  it("plays timer alarm sequences three times without creating extra trigger contexts", async () => {
    Object.defineProperty(window, "AudioContext", { configurable: true, value: FakeAudioContext });

    await expect(playTournamentAlarmSound("standard", 3)).resolves.toBe(true);

    expect(FakeAudioContext.createdCount).toBe(1);
    expect(FakeAudioContext.lastInstance?.createOscillator).toHaveBeenCalledTimes(6);
  });

  it("fails safely when browser audio is unavailable", async () => {
    await expect(playTournamentAlarmSound("standard")).resolves.toBe(false);
  });
});
