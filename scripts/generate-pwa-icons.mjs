// Rasterize Simkoll's simple two-wave brand mark into installable PNG icons.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0) }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const name = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4)
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([size, name, data, crc])
}
for (const size of [192, 512]) {
  const bytes = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size
    const wave = u > .27 && u < .73 && [.43, .59].some((center) => Math.abs(v - center - .032 * Math.sin((u - .27) / .46 * 2 * Math.PI)) < .042)
    const color = wave ? [16, 45, 55] : [201, 240, 90]
    const offset = y * (size * 4 + 1) + 1 + x * 4
    bytes.set([...color, 255], offset)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6
  writeFileSync(new URL(`../public/assets/simkoll-${size}.png`, import.meta.url), Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(bytes)), chunk('IEND', Buffer.alloc(0))]))
}
