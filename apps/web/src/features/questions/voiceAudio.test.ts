import { describe, expect, it } from "vitest";
import { encodeMonoPcmWav, VoiceTurnDetector } from "./voiceAudio";

describe("encodeMonoPcmWav", () => {
  it("writes mono 24 kHz PCM and resamples microphone audio", () => {
    const audio = encodeMonoPcmWav([new Float32Array([-1, 0, 1])], 24_000);
    const view = new DataView(audio);

    expect(new TextDecoder().decode(new Uint8Array(audio, 0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(new Uint8Array(audio, 8, 4))).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(24_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getInt16(44, true)).toBe(-32_768);
    expect(view.getInt16(46, true)).toBe(0);
    expect(view.getInt16(48, true)).toBe(32_767);

    const resampled = encodeMonoPcmWav([new Float32Array(48_000).fill(0.25)], 48_000);
    expect(new DataView(resampled).getUint32(40, true)).toBe(24_000 * 2);
  });

  it("rejects empty recordings and invalid sample rates", () => {
    expect(() => encodeMonoPcmWav([], 24_000)).toThrow("No microphone audio was captured.");
    expect(() => encodeMonoPcmWav([new Float32Array([0.1])], 0)).toThrow("sample rate is invalid");
  });

  it("encodes recordings longer than 60 seconds without truncating them", () => {
    const longRecording = encodeMonoPcmWav([new Float32Array(24_000 * 61)], 24_000);
    expect(new DataView(longRecording).getUint32(40, true)).toBe(24_000 * 61 * 2);
  });
});

describe("VoiceTurnDetector", () => {
  it("sends a spoken turn after 1.2 seconds of silence and listens for the next turn", () => {
    const detector = new VoiceTurnDetector(1_000, {
      silenceMs: 200,
      preRollMs: 100,
      silenceThreshold: 0.1,
    });

    expect(detector.push(new Float32Array(50))).toBeNull();
    expect(detector.push(new Float32Array(100).fill(0.5))).toBeNull();
    expect(detector.push(new Float32Array(100))).toBeNull();
    const completedTurn = detector.push(new Float32Array(100));

    expect(completedTurn?.map((chunk) => chunk.length)).toEqual([50, 100, 100, 100]);
    expect(detector.push(new Float32Array(100).fill(0.5))).toBeNull();
    expect(detector.push(new Float32Array(100))).toBeNull();
    const nextTurn = detector.push(new Float32Array(100));
    expect(nextTurn?.map((chunk) => chunk.length)).toEqual([100, 100, 100]);
  });
});
