// 스크린샷 여백 자르기: 왼쪽 위에서 N×N 만 남긴다.
import { readFileSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const CRC = (() => { const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t; })();
const crc32 = (b) => { let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0; };

function decode(buf) {
  let p = 8, w = 0, h = 0, ct = 6; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; }
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const ch = ct === 2 ? 3 : 4;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch, flat = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++], row = raw.subarray(pos, pos + stride); pos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? flat[y * stride + x - ch] : 0;
      const b = y > 0 ? flat[(y - 1) * stride + x] : 0;
      const c = x >= ch && y > 0 ? flat[(y - 1) * stride + x - ch] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pr = a + b - c, pa = Math.abs(pr - a), pb = Math.abs(pr - b), pc = Math.abs(pr - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      flat[y * stride + x] = v & 0xff;
    }
  }
  if (ch === 4) return { w, h, rgba: flat };
  const rgba = Buffer.alloc(w * h * 4, 0xff);
  for (let i = 0, j = 0; i < flat.length; i += 3, j += 4) {
    rgba[j] = flat[i]; rgba[j + 1] = flat[i + 1]; rgba[j + 2] = flat[i + 2];
  }
  return { w, h, rgba };
}

function encode(w, h, rgba) {
  const chunk = (type, data) => {
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const stride = w * 4, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const [, , file, sizeStr, outFile] = process.argv;
const size = Number(sizeStr);
const img = decode(readFileSync(file));
const out = Buffer.alloc(size * size * 4);
for (let y = 0; y < size; y++)
  img.rgba.copy(out, y * size * 4, y * img.w * 4, y * img.w * 4 + size * 4);
writeFileSync(outFile ?? file, encode(size, size, out));
console.log(`${outFile ?? file}: ${size}x${size}`);
