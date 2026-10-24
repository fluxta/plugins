import { describe, expect, it } from "vitest";

import { encodeWav, pcm16Wav, wavDuration } from "./wav";

describe("encodeWav", () => {
  it("writes a mono 16-bit PCM WAV", () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 1, -1]), 22_050);
    const view = new DataView(wav.buffer);
    const tag = (offset: number) =>
      String.fromCharCode(...wav.subarray(offset, offset + 4));

    expect(wav.byteLength).toBe(44 + 5 * 2);
    expect(tag(0)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(36 + 10);
    expect(tag(8)).toBe("WAVE");
    expect(tag(12)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(22_050);
    expect(view.getUint32(28, true)).toBe(44_100);
    expect(view.getUint16(34, true)).toBe(16);
    expect(tag(36)).toBe("data");
    expect(view.getUint32(40, true)).toBe(10);
    expect([0, 1, 2, 3, 4].map((i) => view.getInt16(44 + i * 2, true))).toEqual(
      [0, 16_384, -16_383, 32_767, -32_767],
    );
  });

  it("clamps samples outside -1 to 1", () => {
    const wav = encodeWav(new Float32Array([1.5, -3]), 16_000);
    const view = new DataView(wav.buffer);

    expect(view.getInt16(44, true)).toBe(32_767);
    expect(view.getInt16(46, true)).toBe(-32_767);
  });
});

describe("pcm16Wav", () => {
  it("puts an engine's 16-bit samples behind a WAV header, as they are", () => {
    const pcm = new Uint8Array([1, 0, 0xff, 0x7f, 0, 0x80]);
    const wav = pcm16Wav(pcm, 22_050);
    const view = new DataView(wav.buffer);

    expect(wav.byteLength).toBe(44 + 6);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(22_050);
    expect(view.getUint32(28, true)).toBe(44_100);
    expect(view.getUint32(40, true)).toBe(6);
    expect([...wav.subarray(44)]).toEqual([...pcm]);
    expect(wavDuration(pcm16Wav(new Uint8Array(44_100), 22_050))).toBe(1);
  });

  it("writes stereo, and leaves out half a sample", () => {
    const wav = pcm16Wav(new Uint8Array(9), 16_000, 2);
    const view = new DataView(wav.buffer);

    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(28, true)).toBe(64_000);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint32(40, true)).toBe(8);
  });
});

describe("wavDuration", () => {
  it("reads how long a WAV plays", () => {
    expect(wavDuration(encodeWav(new Float32Array(33_075), 22_050))).toBe(1.5);
  });

  it("skips chunks it does not need", () => {
    const plain = encodeWav(new Float32Array(16_000), 16_000);
    const list = new Uint8Array([
      ...new TextEncoder().encode("LIST"),
      3,
      0,
      0,
      0,
      1,
      2,
      3,
      0, // pad byte after an odd-sized chunk
    ]);
    const withList = new Uint8Array([
      ...plain.subarray(0, 36),
      ...list,
      ...plain.subarray(36),
    ]);

    expect(wavDuration(withList)).toBe(1);
  });

  it("reads anything else as 0", () => {
    expect(wavDuration(new TextEncoder().encode("not a wav at all"))).toBe(0);
    expect(wavDuration(new Uint8Array())).toBe(0);
  });
});
