import { unzipSync } from "fflate";
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
// Inspect central directory before allocating any decompressed data (ZIP64 rejected).
export function safeUnzip(
  bytes: Uint8Array,
  limit = 96 * 1024 * 1024,
): Record<string, Uint8Array> {
  if (bytes.length > limit) throw Error("Архів завеликий.");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let e = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (
      v.getUint32(i, true) === 0x06054b50 &&
      i + 22 + v.getUint16(i + 20, true) === bytes.length
    ) {
      e = i;
      break;
    }
  if (e < 0) throw Error("Пошкоджений ZIP/JAR.");
  const count = v.getUint16(e + 10, true),
    start = v.getUint32(e + 16, true),
    size = v.getUint32(e + 12, true);
  if (
    v.getUint16(e + 4, true) ||
    v.getUint16(e + 6, true) ||
    count > 10000 ||
    start + size > e
  )
    throw Error("Непідтримуваний ZIP.");
  let at = start,
    total = 0;
  const names = new Set<string>();
  const checks = new Map<string, { size: number; crc: number }>();
  for (let n = 0; n < count; n++) {
    if (at + 46 > e || v.getUint32(at, true) !== 0x02014b50)
      throw Error("Пошкоджений каталог ZIP.");
    const compressed = v.getUint32(at + 20, true),
      expanded = v.getUint32(at + 24, true),
      len = v.getUint16(at + 28, true),
      extra = v.getUint16(at + 30, true),
      comment = v.getUint16(at + 32, true),
      offset = v.getUint32(at + 42, true);
    const name = new TextDecoder().decode(
      bytes.subarray(at + 46, at + 46 + len),
    );
    if (
      !name ||
      name.includes("\\") ||
      name.startsWith("/") ||
      name.split("/").some((p) => p === ".." || p === ".") ||
      name.includes("\0") ||
      names.has(name)
    )
      throw Error("Небезпечний шлях в архіві.");
    names.add(name);
    checks.set(name, { size: expanded, crc: v.getUint32(at + 16, true) });
    total += expanded;
    if (
      total > limit ||
      expanded > 32 * 1024 * 1024 ||
      expanded > Math.max(1024 * 1024, compressed * 200) ||
      v.getUint16(at + 8, true) & 1
    )
      throw Error("Перевищено безпечні межі розпакування.");
    if (offset + 30 > start || v.getUint32(offset, true) !== 0x04034b50)
      throw Error("Некоректний запис ZIP.");
    const localNameLen = v.getUint16(offset + 26, true),
      localExtra = v.getUint16(offset + 28, true);
    if (
      new TextDecoder().decode(
        bytes.subarray(offset + 30, offset + 30 + localNameLen),
      ) !== name ||
      offset + 30 + localNameLen + localExtra + compressed > start
    )
      throw Error("Некоректний запис ZIP.");
    at += 46 + len + extra + comment;
    if (at > e) throw Error("Пошкоджений ZIP.");
  }
  if (at !== start + size) throw Error("Некоректний каталог ZIP.");
  const files = unzipSync(bytes);
  for (const [name, check] of checks) {
    if (
      !files[name] ||
      files[name].length !== check.size ||
      crc32(files[name]) !== check.crc
    )
      throw Error("Пошкоджений файл: CRC не збігається.");
  }
  return files;
}
export const binaryBlob = (bytes: Uint8Array, type = "application/zip") =>
  new Blob([new Uint8Array(bytes).buffer], { type });
