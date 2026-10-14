/* 往已有 zip 里追加一个文件（只追加，原有条目字节原样保留）
   用法： node work/zip-add.js <zip> <要加的文件> <zip 里的名字> */
const fs = require('fs');
const zlib = require('zlib');
const [, , zipPath, srcPath, entryName] = process.argv;
if (!zipPath || !srcPath || !entryName) { console.error('用法: node work/zip-add.js <zip> <file> <name>'); process.exit(1); }

const CRC_TABLE = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; }

const b = fs.readFileSync(zipPath);
let eocdPos = -1;
for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) { if (b.readUInt32LE(i) === 0x06054b50) { eocdPos = i; break; } }
if (eocdPos < 0) { console.error('找不到 EOCD，不是标准 zip'); process.exit(1); }
const count = b.readUInt16LE(eocdPos + 10);
const cdSize = b.readUInt32LE(eocdPos + 12);
const cdOff = b.readUInt32LE(eocdPos + 16);
const oldCd = b.slice(cdOff, cdOff + cdSize);

const STAMP = new Date(Date.UTC(2026, 9, 14, 7, 0, 0));
const dosTime = ((STAMP.getUTCHours() << 11) | (STAMP.getUTCMinutes() << 5) | (STAMP.getUTCSeconds() >> 1)) & 0xFFFF;
const dosDate = (((STAMP.getUTCFullYear() - 1980) << 9) | ((STAMP.getUTCMonth() + 1) << 5) | STAMP.getUTCDate()) & 0xFFFF;
const FLAG_UTF8 = 0x0800;

const content = fs.readFileSync(srcPath);
const nameBuf = Buffer.from(entryName, 'utf8');
const raw = zlib.deflateRawSync(content, { level: 6 });
const crc = crc32(content);
const mode = 0o100644;
const extAttr = ((mode & 0xFFFF) << 16) >>> 0;

const lh = Buffer.alloc(30);
lh.writeUInt32LE(0x04034b50, 0);
lh.writeUInt16LE(20, 4);
lh.writeUInt16LE(FLAG_UTF8, 6);
lh.writeUInt16LE(8, 8);
lh.writeUInt16LE(dosTime, 10);
lh.writeUInt16LE(dosDate, 12);
lh.writeUInt32LE(crc, 14);
lh.writeUInt32LE(raw.length, 18);
lh.writeUInt32LE(content.length, 22);
lh.writeUInt16LE(nameBuf.length, 26);

const cd = Buffer.alloc(46);
cd.writeUInt32LE(0x02014b50, 0);
cd.writeUInt16LE(0x031E, 4);
cd.writeUInt16LE(20, 6);
cd.writeUInt16LE(FLAG_UTF8, 8);
cd.writeUInt16LE(8, 10);
cd.writeUInt16LE(dosTime, 12);
cd.writeUInt16LE(dosDate, 14);
cd.writeUInt32LE(crc, 16);
cd.writeUInt32LE(raw.length, 20);
cd.writeUInt32LE(content.length, 24);
cd.writeUInt16LE(nameBuf.length, 28);
cd.writeUInt32LE(extAttr, 38);
cd.writeUInt32LE(cdOff, 42);          // 新的 local header 正好落在原 CD 起点

const newCd = Buffer.concat([oldCd, cd, nameBuf]);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(count + 1, 8);
eocd.writeUInt16LE(count + 1, 10);
eocd.writeUInt32LE(newCd.length, 12);
eocd.writeUInt32LE(cdOff, 16);

// 新 local record 插在原 CD 起点，所以新 CD 的起点 = 原 cdOff + 新 local record 的长度
const newCdOff = cdOff + lh.length + nameBuf.length + raw.length;
eocd.writeUInt32LE(newCdOff, 16);
const out = Buffer.concat([b.slice(0, cdOff), lh, nameBuf, raw, newCd, eocd]);
fs.writeFileSync(zipPath, out);
console.log('已追加 ' + entryName + ' -> ' + zipPath + '  (' + (out.length / 1024 / 1024).toFixed(1) + ' MB, 条目 ' + count + ' -> ' + (count + 1) + ')');

// 回读校验
const z = fs.readFileSync(zipPath);
const ePos = z.length - 22;
const n = z.readUInt16LE(ePos + 10);
const cSize = z.readUInt32LE(ePos + 12);
const cOff = z.readUInt32LE(ePos + 16);
let p = cOff, links = 0, exec = 0, found = -1;
for (let i = 0; i < n; i++) {
  const nl = z.readUInt16LE(p + 28), el = z.readUInt16LE(p + 30), cl = z.readUInt16LE(p + 32);
  const mode2 = (z.readUInt32LE(p + 38) >>> 16) & 0xFFFF;
  const nm = z.slice(p + 46, p + 46 + nl).toString('utf8');
  if ((mode2 & 0xF000) === 0xA000) links++;
  if ((mode2 & 0o111) === 0o111) exec++;
  if (nm === entryName) found = i;
  p += 46 + nl + el + cl;
}
console.log('  校验：条目 ' + n + '，符号链接 ' + links + '，可执行位 ' + exec + '，新条目序号 ' + found);