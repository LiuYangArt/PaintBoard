/**
 * Converts a Hex color string to HSVA object
 * @param hex Hex string (e.g. "#FFFFFF" or "FFFFFF")
 * @returns Object {h, s, v, a} where h in [0, 360], s,v,a in [0, 1]
 */
export const hexToHsva = (hex: string): { h: number; s: number; v: number; a: number } => {
  let c = hex.startsWith('#') ? hex.slice(1) : hex;
  if (c.length === 3) {
    c = c
      .split('')
      .map((x) => x + x)
      .join('');
  }

  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  const v = max;
  const s = max === 0 ? 0 : d / max;

  let h = 0;
  if (max === min) {
    h = 0;
  } else {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h: h * 360, s: s * 100, v: v * 100, a: 1 };
};

/**
 * Converts HSVA object to Hex string
 * @param hsv Object {h, s, v} h in [0, 360], s,v in [0, 100]
 * @returns Hex string (e.g. "#FFFFFF")
 */
export const hsvaToHex = ({ h, s, v }: { h: number; s: number; v: number; a?: number }): string => {
  const S = s / 100;
  const V = v / 100;

  const c = V * S;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = V - c;

  let r = 0,
    g = 0,
    b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (h >= 300 && h < 360) {
    r = c;
    g = 0;
    b = x;
  }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
};
