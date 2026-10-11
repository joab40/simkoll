// Rasterize Simkoll's round two-wave app mark into installable PNG icons.
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
for (const [size, transparent, filename] of [
  [192, false, 'simkoll-192.png'],
  [512, false, 'simkoll-512.png'],
  [192, true, 'simkoll-mark-192.png'],
  [512, true, 'simkoll-mark-512.png'],
  [1024, true, 'simkoll-logo-transparent-1024.png'],
]) {
  const bytes = Buffer.alloc((size * 4 + 1) * size)
  const circleColor = [201, 240, 90], waveColor = [16, 45, 55], background = [239, 246, 244]
  const samples = 4
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const total = [0, 0, 0]
    let covered = 0
    for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
      const u = (x + (sx + .5) / samples) / size, v = (y + (sy + .5) / samples) / size
      const dx = u - .5, dy = v - .5
      const inside = dx * dx + dy * dy <= .433 * .433
      let color = inside ? circleColor : background
      const onWave = u >= .205 && u <= .795 && [.414, .586].some((center) => Math.abs(v - center - .049 * Math.sin((u - .205) / .59 * 2 * Math.PI)) <= .027)
      if (onWave && inside) color = waveColor
      if (!transparent || inside) {
        total[0] += color[0]; total[1] += color[1]; total[2] += color[2]
      }
      if (inside) covered++
    }
    const offset = y * (size * 4 + 1) + 1 + x * 4
    const sampleCount = transparent ? Math.max(covered, 1) : samples * samples
    const alpha = transparent ? Math.round(covered * 255 / (samples * samples)) : 255
    bytes.set([...total.map((channel) => Math.round(channel / sampleCount)), alpha], offset)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6
  writeFileSync(new URL(`../public/assets/${filename}`, import.meta.url), Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(bytes)), chunk('IEND', Buffer.alloc(0))]))
}
