const HEX_COLOR = /^#?([0-9a-f]{6})$/i;

/**
 * OBS stores a Color Source's color as a signed 32-bit ABGR integer
 * (0xAABBGGRR), not the RGBA a hex picker gives you — alpha is always fully
 * opaque here, this plugin has no editor field for transparency.
 */
export function hexToObsColor(hex: string): number {
  const match = HEX_COLOR.exec(hex.trim());

  if (!match) {
    throw new Error(`"${hex}" is not a #RRGGBB color`);
  }

  const rgb = Number.parseInt(match[1]!, 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;

  return argbToObsColor(r, g, b);
}

export function randomObsColor(): number {
  const channel = () => Math.floor(Math.random() * 256);
  return argbToObsColor(channel(), channel(), channel());
}

function argbToObsColor(r: number, g: number, b: number): number {
  // `| 0` forces the result back to a signed 32-bit int — the top bit set by
  // 0xff000000 would otherwise read as an (incorrect) positive double.
  return (0xff000000 | (b << 16) | (g << 8) | r) | 0;
}
