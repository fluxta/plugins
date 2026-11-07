import { expect, it, vi } from "vitest";
import { discoverPorts } from "./discovery";

it("discovers a dynamic Windows port before fallback ports", async () => {
  const read = vi.fn(async () => '{"port":53832}');
  expect(
    (
      await discoverPorts(
        "win32",
        { LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local" },
        read,
      )
    )[0],
  ).toBe(53832);
  expect(read).toHaveBeenCalledWith(
    "C:\\Users\\test\\AppData\\Local\\Packages\\Elgato.WaveLink_g54w8ztgkx496\\LocalState\\ws-info.json",
  );
});
it.each(['{"port":0}', '{"port":65536}', '{"port":"1884"}', "invalid"])(
  "ignores invalid port metadata: %s",
  async (text) => {
    expect(
      await discoverPorts(
        "win32",
        { APPDATA: "C:\\AppData\\Roaming" },
        async () => text,
      ),
    ).toEqual(Array.from({ length: 10 }, (_, i) => 1884 + i));
  },
);
it("uses the bounded macOS range without reading Windows paths", async () => {
  const read = vi.fn();
  expect(await discoverPorts("darwin", {}, read)).toHaveLength(10);
  expect(read).not.toHaveBeenCalled();
});
