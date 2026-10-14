/* 把 packager 产出的 .app 收拾成能发给 Mac 用户的 zip：
   1) 修 Info.plist：图标改成我们的 icon.icns、分类改成 productivity、asar 完整性校验的键改成 macOS 认的路径
   2) 打 zip：保留符号链接（macOS 框架全靠它）+ 可执行位（Mach-O 才给 755）+ UTF-8 文件名
      —— Windows 自带的压缩工具会把这三样弄坏，所以这里自己写 zip
   用法： node work/pack-mac.js dist-mac/密码本-darwin-arm64 1.0.0 arm64
*/
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const [, , inDirArg, version = '1.0.0', arch = 'arm64'] = process.argv;
const IN = path.resolve(inDirArg || 'dist-mac/密码本-darwin-arm64');
const APP_NAME = '密码本.app';
const APP = path.join(IN, APP_NAME);
if (!fs.existsSync(APP)) { console.error('找不到 ' + APP); process.exit(1); }

// ---------- 1) Info.plist / 图标 ----------
const plistPath = path.join(APP, 'Contents', 'Info.plist');
let pl = fs.readFileSync(plistPath, 'utf8');
const asarPath = path.join(APP, 'Contents', 'Resources', 'app.asar');
const asarHash = crypto.createHash('sha256').update(fs.readFileSync(asarPath)).digest('hex');

pl = pl.replace(/(<key>CFBundleIconFile<\/key>\s*<string>)[^<]*(<\/string>)/, '$1icon.icns$2');
pl = pl.replace(/(<key>LSApplicationCategoryType<\/key>\s*<string>)[^<]*(<\/string>)/, '$1public.app-category.productivity$2');
// ElectronAsarIntegrity 的键必须是 macOS 认的相对路径，packager 在 Windows 上写成了临时目录
pl = pl.replace(/(<key>ElectronAsarIntegrity<\/key>[\s\S]*?<dict>\s*<key>)[^<]*(<\/key>\s*<dict>\s*<key>algorithm<\/key>\s*<string>SHA256<\/string>\s*<key>hash<\/key>\s*<string>)[^<]*(<\/string>)/,
  '$1Resources/app.asar$2' + asarHash + '$3');
fs.writeFileSync(plistPath, pl, 'utf8');

const icnsSrc = path.join(__dirname, '..', 'build', 'icon.icns');
fs.copyFileSync(icnsSrc, path.join(APP, 'Contents', 'Resources', 'icon.icns'));
const oldIcns = path.join(APP, 'Contents', 'Resources', 'electron.icns');
if (fs.existsSync(oldIcns)) fs.unlinkSync(oldIcns);
console.log('Info.plist / icon.icns 处理完；asar sha256 =', asarHash.slice(0, 16) + '…');

// ---------- 2) 自己写 zip ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
  return t;
})();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; }

const STAMP = new Date(Date.UTC(2026, 9, 14, 7, 0, 0));
const dosTime = ((STAMP.getUTCHours() << 11) | (STAMP.getUTCMinutes() << 5) | (STAMP.getUTCSeconds() >> 1)) & 0xFFFF;
const dosDate = (((STAMP.getUTCFullYear() - 1980) << 9) | ((STAMP.getUTCMonth() + 1) << 5) | STAMP.getUTCDate()) & 0xFFFF;
const FLAG_UTF8 = 0x0800;

function isExecutable(buf) {
  if (buf.length < 4) return false;
  if (buf[0] === 0x23 && buf[1] === 0x21) return true;             // #! 脚本
  const m = buf.readUInt32BE(0);
  return m === 0xFEEDFACF || m === 0xFEEDFACE || m === 0xCAFEBABE || m === 0xCEFAEDFE || m === 0xCFFAEDFE;
}

function collect(rootAbs, rootName) {
  const out = [];
  (function walk(dir, rel) {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      const relPath = rel ? rel + '/' + name : name;
      const st = fs.lstatSync(abs);
      if (st.isSymbolicLink()) {
        // macOS 上反斜杠不是分隔符，必须换成正斜杠
        const target = fs.readlinkSync(abs).split('\\').join('/');
        out.push({ name: relPath, target, mode: 0o120777 });
      } else if (st.isDirectory()) {
        out.push({ name: relPath + '/', dir: true, mode: 0o40755 });
        walk(abs, relPath);
      } else {
        const data = fs.readFileSync(abs);
        out.push({ name: relPath, data, mode: isExecutable(data) ? 0o100755 : 0o100644 });
      }
    }
  })(rootAbs, rootName);
  return out;
}

const entries = collect(APP, APP_NAME);
const note = '首次打开怎么弄（未签名，macOS 会拦一下）\n\n' +
  '1. 把这个「密码本.app」拖到「应用程序」文件夹（或你想放的地方）\n' +
  '2. 第一次打开不要双击：在 Finder 里右键（或按住 Control 点它）→ 选「打开」→ 弹窗里再点一次「打开」\n' +
  '   以后就能正常双击打开了\n' +
  '   （如果系统说「已损坏，无法打开」，在「终端」里跑一句：\n' +
  '     xattr -dr com.apple.quarantine /Applications/密码本.app  ）\n\n' +
  '密码库放在：~/Library/Application Support/密码本/data/vault.dat\n' +
  '（也可以直接拷别人给的 vault.dat 进来，主密码跟着文件走）\n';
entries.push({ name: '首次打开请看这里.txt', data: Buffer.from(note, 'utf8'), mode: 0o100644 });

const localParts = [];
const centralParts = [];
let offset = 0;
for (const e of entries) {
  const isLink = !!e.target;
  const nameBuf = Buffer.from(e.name, 'utf8');
  const content = isLink ? Buffer.from(e.target, 'utf8') : (e.dir ? Buffer.alloc(0) : e.data);
  const method = (!isLink && !e.dir && content.length > 64) ? 8 : 0;
  const raw = method === 8 ? zlib.deflateRawSync(content, { level: 6 }) : content;
  const crc = crc32(content);
  const extAttr = (((e.mode & 0xFFFF) << 16) | (e.dir ? 0x10 : 0)) >>> 0;

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(FLAG_UTF8, 6);
  lh.writeUInt16LE(method, 8);
  lh.writeUInt16LE(dosTime, 10);
  lh.writeUInt16LE(dosDate, 12);
  lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(raw.length, 18);
  lh.writeUInt32LE(content.length, 22);
  lh.writeUInt16LE(nameBuf.length, 26);
  lh.writeUInt16LE(0, 28);
  localParts.push(lh, nameBuf, raw);

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(0x031E, 4);          // 3 = Unix，30 = zip 3.0
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(FLAG_UTF8, 8);
  cd.writeUInt16LE(method, 10);
  cd.writeUInt16LE(dosTime, 12);
  cd.writeUInt16LE(dosDate, 14);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(raw.length, 20);
  cd.writeUInt32LE(content.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt32LE(extAttr, 38);
  cd.writeUInt32LE(offset, 42);
  centralParts.push(cd, nameBuf);

  offset += lh.length + nameBuf.length + raw.length;
}

const cdBuf = Buffer.concat(centralParts);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(entries.length, 8);
eocd.writeUInt16LE(entries.length, 10);
eocd.writeUInt32LE(cdBuf.length, 12);
eocd.writeUInt32LE(offset, 16);

const out = path.join(IN, '..', '密码本-' + version + '-' + arch + '-mac.zip');
fs.writeFileSync(out, Buffer.concat([...localParts, cdBuf, eocd]));
console.log('写出 ' + out + '  ' + (fs.statSync(out).size / 1024 / 1024).toFixed(1) + ' MB，条目 ' + entries.length);

// ---------- 3) 回读校验 ----------
const zipBuf = fs.readFileSync(out);
const eocdPos = zipBuf.length - 22;
const count = zipBuf.readUInt16LE(eocdPos + 10);
const cdOff = zipBuf.readUInt32LE(eocdPos + 16);
let p = cdOff; let links = 0; let exec = 0; const linkSamples = []; let badLinks = 0;
for (let i = 0; i < count; i++) {
  const nameLen = zipBuf.readUInt16LE(p + 28);
  const extLen = zipBuf.readUInt16LE(p + 30);
  const cmtLen = zipBuf.readUInt16LE(p + 32);
  const ext = zipBuf.readUInt32LE(p + 38);
  const mode = (ext >>> 16) & 0xFFFF;
  const name = zipBuf.slice(p + 46, p + 46 + nameLen).toString('utf8');
  if ((mode & 0xF000) === 0xA000) {
    links++;
    const lho = zipBuf.readUInt32LE(p + 42);
    const lnl = zipBuf.readUInt16LE(lho + 26);
    const lel = zipBuf.readUInt16LE(lho + 28);
    const lmethod = zipBuf.readUInt16LE(lho + 8);
    const lsize = zipBuf.readUInt32LE(lho + 18);
    const rawData = zipBuf.slice(lho + 30 + lnl + lel, lho + 30 + lnl + lel + lsize);
    const target = lmethod === 8 ? zlib.inflateRawSync(rawData).toString('utf8') : rawData.toString('utf8');
    if (target.includes('\\')) badLinks++;
    if (linkSamples.length < 3) linkSamples.push(name + ' -> ' + target);
  }
  if ((mode & 0o111) === 0o111) exec++;
  p += 46 + nameLen + extLen + cmtLen;
}
console.log('校验：条目 ' + count + ' 个，符号链接 ' + links + ' 个（目标含反斜杠的 ' + badLinks + ' 个），带可执行位 ' + exec + ' 个');
linkSamples.forEach((s) => console.log('  ' + s));
console.log('  MacOS/密码本 可执行位：' + (((zipBuf.readUInt32LE(cdOff + 38) >>> 16) & 0o111) === 0o111 ? '是' : '否'));