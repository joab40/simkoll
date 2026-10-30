export const GOAL_VIDEO_MAX_BYTES = 25_000_000
export const GOAL_VIDEO_MAX_SECONDS = 30
export const GOAL_VIDEO_FORMAT_HELP = 'Välj ett MP4- eller MOV-klipp med H.264 eller HEVC, högst 30 sekunder och 25 MB. Exportera som MP4/H.264 för bäst stöd på olika enheter.'

// Read container metadata rather than trusting a filename, MIME or browser-supplied
// duration. Shared by the local picker and the server's final validation.
export function inspectGoalVideo(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (!bytes.length || bytes.length > GOAL_VIDEO_MAX_BYTES) throw new Error('Videon får vara högst 25 MB. Exportera en mindre fil.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const four = (offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4))
  let count = 0
  const boxes = (start, end) => {
    const result = []
    for (let offset = start; offset < end;) {
      if (++count > 10000 || offset + 8 > end) throw new Error('Skadad videofil.')
      let size = view.getUint32(offset), header = 8
      if (size === 1) { if (offset + 16 > end) throw new Error('Skadad videofil.'); size = Number(view.getBigUint64(offset + 8)); header = 16 }
      if (size === 0) size = end - offset
      if (!Number.isSafeInteger(size) || size < header || offset + size > end) throw new Error('Skadad videofil.')
      result.push({ type: four(offset + 4), start: offset, data: offset + header, end: offset + size })
      offset += size
    }
    return result
  }
  const child = (box, type) => boxes(box.data, box.end).find((row) => row.type === type)
  const duration = (box) => {
    if (!box) throw new Error('Videons längd kunde inte kontrolleras. Exportera klippet som MP4 och försök igen.')
    const version = bytes[box.data]
    if (![0, 1].includes(version) || box.data + (version ? 32 : 20) > box.end) throw new Error('Skadad tidsinformation i videon.')
    const scale = view.getUint32(box.data + (version ? 20 : 12))
    const ticks = version ? Number(view.getBigUint64(box.data + 24)) : view.getUint32(box.data + 16)
    if (!scale || !Number.isSafeInteger(ticks) || ticks <= 0) throw new Error('Videons längd kunde inte kontrolleras. Exportera klippet som MP4 och försök igen.')
    return ticks / scale
  }
  try {
    const top = boxes(0, bytes.length), moov = top.find((box) => box.type === 'moov')
    if (top[0]?.type !== 'ftyp' || !moov || !top.some((box) => box.type === 'mdat' && box.end > box.data)) throw new Error(GOAL_VIDEO_FORMAT_HELP)
    const movieSeconds = duration(child(moov, 'mvhd'))
    let video = null
    for (const track of boxes(moov.data, moov.end).filter((box) => box.type === 'trak')) {
      const media = child(track, 'mdia'), handler = media && child(media, 'hdlr')
      if (!handler || handler.data + 12 > handler.end) continue
      const kind = four(handler.data + 8)
      if (kind === 'soun' && duration(child(media, 'mdhd')) > GOAL_VIDEO_MAX_SECONDS) throw new Error('Klippets ljudspår får vara högst 30 sekunder.')
      if (kind !== 'vide') continue
      if (video) throw new Error('Välj ett klipp med ett enda videospår.')
      const seconds = duration(child(media, 'mdhd')), minf = child(media, 'minf'), stbl = minf && child(minf, 'stbl'), stsd = stbl && child(stbl, 'stsd')
      if (!stsd || stsd.data + 8 > stsd.end) throw new Error('Videons format kunde inte kontrolleras.')
      const samples = boxes(stsd.data + 8, stsd.end)
      if (!samples.length || samples.some((row) => !['avc1', 'avc3', 'hvc1', 'hev1'].includes(row.type))) throw new Error(GOAL_VIDEO_FORMAT_HELP)
      const sample = samples[0]
      if (sample.start + 36 > sample.end) throw new Error('Skadad videofil.')
      const width = view.getUint16(sample.start + 32), height = view.getUint16(sample.start + 34)
      if (!width || !height || width > 8192 || height > 8192) throw new Error('Videons upplösning kunde inte godkännas.')
      video = { seconds: Math.max(movieSeconds, seconds), codec: sample.type, width, height }
    }
    if (!video) throw new Error('Filen saknar ett videospår.')
    if (video.seconds > GOAL_VIDEO_MAX_SECONDS) throw new Error('Klippet får vara högst 30 sekunder. Korta det i telefonens bildapp och försök igen.')
    return { ...video, durationMs: Math.ceil(video.seconds * 1000), bytes: bytes.length }
  } catch (error) {
    if (error instanceof RangeError) throw new Error('Videofilen är skadad eller har ett format som inte stöds.')
    throw error
  }
}
