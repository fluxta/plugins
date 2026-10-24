import type { Audio } from "./provider";

const HEADER_BYTES = 44;

/** Mono samples from -1 to 1 as a 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Audio {
  const wav = wavOf(samples.length * 2, sampleRate, 1);
  const view = new DataView(wav.buffer);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(HEADER_BYTES + i * 2, Math.round(sample * 32767), true);
  }
  return wav;
}

/** 16-bit little-endian PCM, as an engine writes it, as a WAV. */
export function pcm16Wav(
  pcm: Uint8Array,
  sampleRate: number,
  channels = 1,
): Audio {
  // A sample is two bytes: an odd last byte is half a sample.
  const dataBytes = pcm.byteLength - (pcm.byteLength % 2);
  const wav = wavOf(dataBytes, sampleRate, channels);
  wav.set(pcm.subarray(0, dataBytes), HEADER_BYTES);
  return wav;
}

/** A 16-bit PCM WAV's header, and room for `dataBytes` after it. */
function wavOf(dataBytes: number, sampleRate: number, channels: number): Audio {
  const wav = new Uint8Array(HEADER_BYTES + dataBytes);
  const view = new DataView(wav.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };
  const blockAlign = channels * 2;
  ascii(0, "RIFF");
  view.setUint32(4, HEADER_BYTES - 8 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  return wav;
}

/**
 * How long a WAV plays, in seconds, read from its `fmt ` and `data` chunks.
 * Anything that is not a PCM WAV reads as 0.
 */
export function wavDuration(wav: Audio): number {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const tag = (offset: number) =>
    String.fromCharCode(...wav.subarray(offset, offset + 4));
  if (wav.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") {
    return 0;
  }
  let bytesPerSecond = 0;
  let dataBytes = 0;
  for (let offset = 12; offset + 8 <= wav.byteLength;) {
    const size = view.getUint32(offset + 4, true);
    if (tag(offset) === "fmt " && offset + 16 <= wav.byteLength) {
      bytesPerSecond = view.getUint32(offset + 16, true);
    } else if (tag(offset) === "data") {
      dataBytes = Math.min(size, wav.byteLength - offset - 8);
    }
    // Chunks are word-aligned: an odd size is followed by a pad byte.
    offset += 8 + size + (size % 2);
  }
  return bytesPerSecond > 0 ? dataBytes / bytesPerSecond : 0;
}
