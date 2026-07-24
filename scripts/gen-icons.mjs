/**
 * Generates PWA icons without external dependencies (pure Node + zlib PNG encoding).
 * Draws the NeoOS mark: rounded near-black tile with a cyan→green diagonal gradient bar.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixelFn) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y, size);
      const off = y * (size * 4 + 1) + 1 + x * 4;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const lerp = (a, b, t) => Math.round(a + (b - a) * t);

function neoosPixel(x, y, size) {
  const radius = size * 0.22;
  // Rounded-rect mask
  const cx = Math.max(radius, Math.min(size - radius, x + 0.5));
  const cy = Math.max(radius, Math.min(size - radius, y + 0.5));
  const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
  if (dist > radius) return [0, 0, 0, 0];

  // Near-black panel base with a faint cyan glow top-right
  const glow = Math.max(0, 1 - Math.hypot(x - size * 0.85, y - size * 0.1) / (size * 0.7));
  let r = lerp(5, 12, glow);
  let g = lerp(6, 22, glow);
  let b = lerp(7, 30, glow);

  // Diagonal gauge bar: cyan #54d6ff → green #64f0a5
  const t = (x + y) / (2 * size);
  const bandCenter = 0.52;
  const bandHalf = 0.09;
  const d = Math.abs((y - x * 0.35) / size - bandCenter + 0.18);
  if (d < bandHalf) {
    const edge = Math.min(1, (bandHalf - d) / (bandHalf * 0.35));
    r = lerp(r, lerp(0x54, 0x64, t), edge);
    g = lerp(g, lerp(0xd6, 0xf0, t), edge);
    b = lerp(b, lerp(0xff, 0xa5, t), edge);
  }
  return [r, g, b, 255];
}

mkdirSync("public", { recursive: true });
for (const [file, size] of [
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
  ["public/apple-touch-icon.png", 180],
]) {
  writeFileSync(file, encodePng(size, neoosPixel));
  console.log(`wrote ${file} (${size}x${size})`);
}
