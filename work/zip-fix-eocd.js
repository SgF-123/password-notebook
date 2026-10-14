const fs = require('fs');
for (const f of process.argv.slice(2)) {
  const b = fs.readFileSync(f);
  const ePos = b.length - 22;
  if (b.readUInt32LE(ePos) !== 0x06054b50) { console.log(f + ' : EOCD 不在末尾，跳过'); continue; }
  const cdOff = b.readUInt32LE(ePos + 16);
  // 原 CD 起点处现在是新加的 local record，量一下它的长度
  const lhSig = b.readUInt32LE(cdOff);
  if (lhSig !== 0x04034b50) { console.log(f + ' : 该位置不是 local header，跳过'); continue; }
  const nameLen = b.readUInt16LE(cdOff + 26);
  const extraLen = b.readUInt16LE(cdOff + 28);
  const csize = b.readUInt32LE(cdOff + 18);
  const newCdOff = cdOff + 30 + nameLen + extraLen + csize;
  b.writeUInt32LE(newCdOff, ePos + 16);
  fs.writeFileSync(f, b);
  console.log(f.split('/').pop() + ' : CD 偏移 ' + cdOff + ' -> ' + newCdOff + ' 已修正');
}