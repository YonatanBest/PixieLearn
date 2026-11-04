const TARGET_SAMPLE_RATE = 24_000;

export class VoiceTurnDetector {
  private readonly silenceSampleCount: number;
  private readonly preRollSampleCount: number;
  private readonly silenceThreshold: number;
  private preRoll: Float32Array[] = [];
  private preRollSamples = 0;
  private turn: Float32Array[] = [];
  private speechDetected = false;
  private silentSamples = 0;

  constructor(
    sampleRate: number,
    { silenceMs = 1_200, preRollMs = 250, silenceThreshold = 0.012 } = {},
  ) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new Error("The microphone audio sample rate is invalid.");
    }
    this.silenceSampleCount = Math.round((sampleRate * silenceMs) / 1_000);
    this.preRollSampleCount = Math.round((sampleRate * preRollMs) / 1_000);
    this.silenceThreshold = silenceThreshold;
  }

  push(chunk: Float32Array): Float32Array[] | null {
    const rms = Math.sqrt(chunk.reduce((sum, sample) => sum + sample * sample, 0) / chunk.length);
    if (!this.speechDetected) {
      if (rms >= this.silenceThreshold) {
        this.speechDetected = true;
        this.turn = [...this.preRoll, new Float32Array(chunk)];
        this.preRoll = [];
        this.preRollSamples = 0;
      } else {
        this.preRoll.push(new Float32Array(chunk));
        this.preRollSamples += chunk.length;
        while (this.preRollSamples > this.preRollSampleCount && this.preRoll.length > 0) {
          this.preRollSamples -= this.preRoll.shift()!.length;
        }
      }
      return null;
    }

    this.turn.push(new Float32Array(chunk));
    this.silentSamples = rms >= this.silenceThreshold ? 0 : this.silentSamples + chunk.length;
    if (this.silentSamples < this.silenceSampleCount) return null;

    const completedTurn = this.turn;
    this.reset();
    return completedTurn;
  }

  reset(): void {
    this.preRoll = [];
    this.preRollSamples = 0;
    this.turn = [];
    this.speechDetected = false;
    this.silentSamples = 0;
  }
}

export function encodeMonoPcmWav(chunks: Float32Array[], sampleRate: number): ArrayBuffer {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error("The microphone audio sample rate is invalid.");
  }
  const inputLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  if (!inputLength) throw new Error("No microphone audio was captured.");
  const input = new Float32Array(inputLength);
  let inputOffset = 0;
  for (const chunk of chunks) {
    input.set(chunk, inputOffset);
    inputOffset += chunk.length;
  }

  const outputLength = Math.floor((input.length * TARGET_SAMPLE_RATE) / sampleRate);
  if (!outputLength) throw new Error("The recording is too short to transcribe.");
  const dataLength = outputLength * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataLength, true);

  for (let index = 0; index < outputLength; index += 1) {
    const sourcePosition = (index * sampleRate) / TARGET_SAMPLE_RATE;
    const leftIndex = Math.min(Math.floor(sourcePosition), input.length - 1);
    const rightIndex = Math.min(leftIndex + 1, input.length - 1);
    const fraction = sourcePosition - leftIndex;
    const sample = input[leftIndex] + (input[rightIndex] - input[leftIndex]) * fraction;
    const clipped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true);
  }
  return buffer;
}
