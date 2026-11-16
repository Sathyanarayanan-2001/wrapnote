// Draws the app icons as PNG files with no image library: a page with a folded corner and text lines.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(dir, { recursive: true });

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // 4 x 4 supersampling for smooth edges.
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const c = paint((x + (sx + 0.5) / 4) / size, (y + (sy + 0.5) / 4) / size);
        r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = a ? Math.round(r / a) : 0; raw[o + 1] = a ? Math.round(g / a) : 0; raw[o + 2] = a ? Math.round(b / a) : 0; raw[o + 3] = Math.round(a / 16 * 255);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const EMERALD = [4, 120, 87], WHITE = [255, 255, 255], SLATE = [51, 65, 85], MINT = [167, 243, 208];
function roundRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= x0 && x <= x1 && y >= y0 && y <= y1;
}
// s scales the motif: 1 for normal icons, 0.62 for maskable (stays inside the 80% safe zone).
function art(full, s) {
  return (u, v) => {
    const bg = full ? true : roundRect(u, v, 0.02, 0.02, 0.98, 0.98, 0.2);
    if (!bg) return [0, 0, 0, 0];
    const x = (u - 0.5) / s + 0.5, y = (v - 0.5) / s + 0.5;
    const inPage = x >= 0.26 && x <= 0.74 && y >= 0.18 && y <= 0.82 && !(x + y > 0.74 + 0.18 + 0.14 - 0.0 && x > 0.6 && y < 0.32);
    const fold = x > 0.6 && y < 0.32 && x + y > 1.06 - 0.0 && x <= 0.74 && y >= 0.18 && x - 0.6 <= 0.32 - y + 0.14;
    if (fold && x + y <= 1.06 + 0.02) return [...MINT, 1];
    if (inPage) {
      const lines = [[0.36, 0.33, 0.56], [0.36, 0.43, 0.64], [0.36, 0.53, 0.64], [0.36, 0.63, 0.52]];
      for (const [x0, yy, x1] of lines) if (x >= x0 && x <= x1 && Math.abs(y - yy) <= 0.022) return [...(yy === 0.33 ? EMERALD : SLATE), 1];
      return [...WHITE, 1];
    }
    return [...EMERALD, 1];
  };
}
writeFileSync(join(dir, 'icon-192.png'), png(192, art(false, 1)));
writeFileSync(join(dir, 'icon-512.png'), png(512, art(false, 1)));
writeFileSync(join(dir, 'icon-maskable-512.png'), png(512, art(true, 0.62)));
console.log('icons written to public/icons');
