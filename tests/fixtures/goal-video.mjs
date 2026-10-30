export const atom = (type, ...parts) => { const content = Buffer.concat(parts), header = Buffer.alloc(8); header.writeUInt32BE(content.length + 8); header.write(type, 4, 'ascii'); return Buffer.concat([header, content]) }
export function sampleVideo({ seconds = 5, codec = 'avc1', version = 0, handler = 'vide', audioSeconds = null } = {}) {
  const clock = (seconds) => { const data = Buffer.alloc(version ? 32 : 20); data[0] = version; data.writeUInt32BE(1000, version ? 20 : 12); if (version) data.writeBigUInt64BE(BigInt(seconds * 1000), 24); else data.writeUInt32BE(seconds * 1000, 16); return data }
  const track = (kind, length) => {
    const hdlr = Buffer.alloc(12); hdlr.write(kind, 8, 'ascii')
    const sample = Buffer.alloc(28); sample.writeUInt16BE(1280, 24); sample.writeUInt16BE(720, 26)
    const stsd = Buffer.alloc(8); stsd.writeUInt32BE(1, 4)
    return atom('trak', atom('mdia', atom('mdhd', clock(length)), atom('hdlr', hdlr), atom('minf', atom('stbl', atom('stsd', stsd, atom(codec, sample))))))
  }
  return Buffer.concat([atom('ftyp', Buffer.from('isom0000isom')), atom('moov', atom('mvhd', clock(seconds)), track(handler, seconds), ...(audioSeconds === null ? [] : [track('soun', audioSeconds)])), atom('mdat', Buffer.from([0, 1, 2, 3]))])
}
