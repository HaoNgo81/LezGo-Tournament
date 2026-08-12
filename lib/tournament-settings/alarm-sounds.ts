export type AlarmSoundId = "standard" | "whistle" | "bell" | "buzzer" | "digital";

export interface AlarmSoundOption {
  id: AlarmSoundId;
  label: string;
}

export const alarmSoundOptions: AlarmSoundOption[] = [
  { id: "standard", label: "Standard" },
  { id: "whistle", label: "Fløjte" },
  { id: "bell", label: "Klokke" },
  { id: "buzzer", label: "Buzzer" },
  { id: "digital", label: "Digital alarm" },
];

let activeAlarmContext: AudioContext | null = null;

export function isAlarmSoundId(value: unknown): value is AlarmSoundId {
  return typeof value === "string" && alarmSoundOptions.some((option) => option.id === value);
}

export function normalizeAlarmSoundId(value: unknown): AlarmSoundId {
  return isAlarmSoundId(value) ? value : "standard";
}

export async function playTournamentAlarmSound(soundId: AlarmSoundId, repeatCount = 1): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  const AudioContextClass = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) {
    return false;
  }

  try {
    if (activeAlarmContext) {
      await activeAlarmContext.close().catch(() => undefined);
      activeAlarmContext = null;
    }

    const audioContext = new AudioContextClass();
    activeAlarmContext = audioContext;

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const normalizedRepeatCount = Math.max(1, Math.floor(repeatCount));
    const alarmDurationSeconds = getAlarmPatternDuration(soundId);

    for (let index = 0; index < normalizedRepeatCount; index += 1) {
      playAlarmPattern(audioContext, soundId, index * (alarmDurationSeconds + 0.28));
    }

    window.setTimeout(() => {
      if (activeAlarmContext === audioContext) {
        activeAlarmContext = null;
      }
      void audioContext.close().catch(() => undefined);
    }, (normalizedRepeatCount * (alarmDurationSeconds + 0.28) + 0.2) * 1000);
    return true;
  } catch {
    return false;
  }
}

function playAlarmPattern(audioContext: AudioContext, soundId: AlarmSoundId, offsetSeconds: number): void {
  switch (soundId) {
    case "whistle":
      playToneSequence(audioContext, [1320, 1560, 1320], 0.18, 0.05, "square", offsetSeconds);
      return;
    case "bell":
      playToneSequence(audioContext, [880, 660, 880], 0.28, 0.08, "sine", offsetSeconds);
      return;
    case "buzzer":
      playToneSequence(audioContext, [180, 180, 180], 0.22, 0.06, "sawtooth", offsetSeconds);
      return;
    case "digital":
      playToneSequence(audioContext, [1040, 780, 1040, 780], 0.12, 0.04, "square", offsetSeconds);
      return;
    case "standard":
      playToneSequence(audioContext, [880, 880], 0.25, 0.08, "sine", offsetSeconds);
      return;
  }
}

function getAlarmPatternDuration(soundId: AlarmSoundId): number {
  switch (soundId) {
    case "whistle":
      return getToneSequenceDuration(3, 0.18, 0.05);
    case "bell":
      return getToneSequenceDuration(3, 0.28, 0.08);
    case "buzzer":
      return getToneSequenceDuration(3, 0.22, 0.06);
    case "digital":
      return getToneSequenceDuration(4, 0.12, 0.04);
    case "standard":
      return getToneSequenceDuration(2, 0.25, 0.08);
  }
}

function getToneSequenceDuration(toneCount: number, toneSeconds: number, gapSeconds: number): number {
  return toneCount * toneSeconds + Math.max(0, toneCount - 1) * gapSeconds;
}

function playToneSequence(audioContext: AudioContext, frequencies: number[], toneSeconds: number, gapSeconds: number, type: OscillatorType, offsetSeconds: number): void {
  const startedAt = audioContext.currentTime + offsetSeconds;

  frequencies.forEach((frequency, index) => {
    const startAt = startedAt + index * (toneSeconds + gapSeconds);
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + toneSeconds);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + toneSeconds + 0.02);
  });
}
