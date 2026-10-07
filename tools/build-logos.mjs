/*
 * NovaWatermark - 厂商 Logo 资源构建脚本
 * 用法：node tools/build-logos.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC = path.join(ROOT, 'image');
const OUT = path.join(ROOT, 'js', 'logo-data.js');
const MAX_EDGE = 560;

/* ---------- PNG 解码（只处理 8bit RGBA，非隔行） ---------- */
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let pos = 8, w = 0, h = 0, bd = 0, ct = 0, il = 0;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bd = data[8]; ct = data[9]; il = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bd !== 8 || ct !== 6 || il !== 0) {
    throw new Error('unsupported png: depth=' + bd + ' color=' + ct + ' interlace=' + il);
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[p++];
    const line = raw.subarray(p, p + stride);
    p += stride;
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? cur[i - 4] : 0;
      const b = prev[i];
      const c = i >= 4 ? prev[i - 4] : 0;
      let v = line[i];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { w, h, data: out };
}

/* ---------- 指标 ---------- */
function metrics(rgba, w, h) {
  let sumW = 0, lumSum = 0, satSum = 0, count = 0;
  const total = w * h;
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a < 16) continue;
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const wt = a / 255;
    lumSum += ((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255) * wt;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    satSum += (mx === 0 ? 0 : (mx - mn) / mx) * wt;
    sumW += wt; count++;
  }
  if (!sumW) return { lum: 0.5, sat: 0, cov: 0 };
  return {
    lum: +(lumSum / sumW).toFixed(4),
    sat: +(satSum / sumW).toFixed(4),
    cov: +(count / total).toFixed(4)
  };
}

/* ---------- 缩放（alpha 加权面积平均） ---------- */
function resize(rgba, w, h, nw, nh) {
  const out = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const sy0 = Math.floor((y * h) / nh);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * h) / nh));
    for (let x = 0; x < nw; x++) {
      const sx0 = Math.floor((x * w) / nw);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * w) / nw));
      let r = 0, g = 0, b = 0, aSum = 0, wSum = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * w + sx) * 4;
          const al = rgba[i + 3] / 255;
          r += rgba[i] * al; g += rgba[i + 1] * al; b += rgba[i + 2] * al;
          aSum += rgba[i + 3]; wSum += al; n++;
        }
      }
      const o = (y * nw + x) * 4;
      if (wSum > 0) {
        out[o] = Math.round(r / wSum);
        out[o + 1] = Math.round(g / wSum);
        out[o + 2] = Math.round(b / wSum);
      }
      out[o + 3] = Math.round(aSum / n);
    }
  }
  return out;
}

/* ---------- PNG 编码 ---------- */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
function encodePNG(rgba, w, h) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- 主流程 ---------- */
const files = fs.readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.png')).sort();
const meta = {};
const data = {};
let srcBytes = 0, outBytes = 0;
const rows = [];

for (const f of files) {
  const buf = fs.readFileSync(path.join(SRC, f));
  srcBytes += buf.length;
  const img = decodePNG(buf);
  const m = metrics(img.data, img.w, img.h);
  let w = img.w, h = img.h, px = img.data;
  const edge = Math.max(w, h);
  if (edge > MAX_EDGE) {
    const k = MAX_EDGE / edge;
    const nw = Math.max(2, Math.round(w * k));
    const nh = Math.max(2, Math.round(h * k));
    px = resize(px, w, h, nw, nh);
    w = nw; h = nh;
  }
  const png = encodePNG(px, w, h);
  outBytes += png.length;
  rows.push({ f, w, h, lum: m.lum, sat: m.sat, cov: m.cov, src: buf.length, out: png.length });
  meta[f] = { w, h, lum: m.lum, sat: m.sat, cov: m.cov };
  data[f] = 'data:image/png;base64,' + png.toString('base64');
}

const lines = [];
lines.push('/* 由 tools/build-logos.mjs 生成，请勿手工修改。源文件：image/*.png */');
lines.push('(function (global) {');
lines.push("  'use strict';");
lines.push('  var NW = (global.NW = global.NW || {});');
lines.push('');
lines.push('  /* w/h：缩放后尺寸（等比，最大边 ' + MAX_EDGE + 'px）；lum：不透明像素平均亮度；');
lines.push('     sat：平均饱和度（接近 0 = 单色标识）；cov：不透明像素占比 */');
lines.push('  NW.LOGO_META = {');
lines.push(files.map((f) => {
  const m = meta[f];
  return '    ' + JSON.stringify(f) + ': { w: ' + m.w + ', h: ' + m.h +
    ', lum: ' + m.lum + ', sat: ' + m.sat + ', cov: ' + m.cov + ' }';
}).join(',\n'));
lines.push('  };');
lines.push('');
lines.push('  NW.LOGO_DATA = {');
lines.push(files.map((f) => '    ' + JSON.stringify(f) + ': ' + JSON.stringify(data[f])).join(',\n'));
lines.push('  };');
lines.push('})(window);');
lines.push('');
fs.writeFileSync(OUT, lines.join('\n'), 'utf8');

rows.sort((a, b) => b.out - a.out);
console.log('标识数量: ' + files.length);
console.log('源 PNG 体积: ' + (srcBytes / 1048576).toFixed(2) + ' MB  ->  内嵌后: ' + (outBytes / 1048576).toFixed(2) + ' MB');
console.log('js/logo-data.js: ' + (fs.statSync(OUT).size / 1048576).toFixed(2) + ' MB');
console.log('体积最大的 5 个:');
rows.slice(0, 5).forEach((r) => console.log('  ' + r.f + '  ' + r.src + ' -> ' + r.out + '  (' + r.w + 'x' + r.h + '  lum=' + r.lum + ' sat=' + r.sat + ')'));