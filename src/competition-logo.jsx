import React, { useEffect, useRef, useState } from 'react'
import './competition-logo.css'

export const competitionLogoAccept = 'image/png,image/jpeg,image/webp'
const supportedTypes = competitionLogoAccept.split(',')

function removeWhiteBorderBackground({ data, width, height }) {
  const isWhite = pixel => {
    const offset = pixel * 4
    const red = data[offset], green = data[offset + 1], blue = data[offset + 2]
    const low = Math.min(red, green, blue)
    return data[offset + 3] === 255 && low >= 235 && Math.max(red, green, blue) - low <= 16
  }
  const size = width * height
  // A white matte should reach all four corners. Leave existing alpha and
  // ambiguous edge colors alone, and let the editor compare before saving.
  if (![0, width - 1, size - width, size - 1].every(isWhite)) return false

  const background = new Uint8Array(size)
  const queue = new Uint32Array(size)
  let end = 0
  const add = pixel => {
    if (background[pixel] || !isWhite(pixel)) return
    background[pixel] = 1
    queue[end++] = pixel
  }
  for (let x = 0; x < width; x += 1) {
    add(x)
    add(size - width + x)
  }
  for (let y = 1; y < height - 1; y += 1) {
    add(y * width)
    add((y + 1) * width - 1)
  }
  for (let start = 0; start < end; start += 1) {
    const pixel = queue[start]
    const x = pixel % width
    if (x > 0) add(pixel - 1)
    if (x < width - 1) add(pixel + 1)
    if (pixel >= width) add(pixel - width)
    if (pixel < size - width) add(pixel + width)
  }
  if (end === size) return false
  for (let index = 0; index < end; index += 1) data[queue[index] * 4 + 3] = 0
  return true
}

function encodeLogo(canvas, pixels) {
  const { data, width, height } = pixels
  let left = width, top = height, right = -1, bottom = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 4) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  if (right < left) return null

  const output = document.createElement('canvas')
  const croppedWidth = right - left + 1, croppedHeight = bottom - top + 1
  const scale = Math.min(1, 320 / Math.max(croppedWidth, croppedHeight))
  output.width = Math.max(1, Math.round(croppedWidth * scale))
  output.height = Math.max(1, Math.round(croppedHeight * scale))
  const context = output.getContext('2d')
  context.imageSmoothingQuality = 'high'
  context.drawImage(canvas, left, top, croppedWidth, croppedHeight, 0, 0, output.width, output.height)
  return output.toDataURL('image/png')
}

export async function prepareCompetitionLogo(file) {
  if (!supportedTypes.includes(file.type) && !(file.type === '' && /\.(png|jpe?g|webp)$/i.test(file.name))) {
    throw new Error('Välj en logga i PNG, JPG eller WebP.')
  }
  if (file.size > 8 * 1024 * 1024) throw new Error('Välj en logga på högst 8 MB.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const width = image.naturalWidth, height = image.naturalHeight
    if (!width || !height || width * height > 30000000) throw new Error('Bilden är för stor. Välj en mindre version.')
    const scale = Math.min(1, 640 / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = encodeLogo(canvas, pixels)
    if (!data) throw new Error('Bilden är genomskinlig. Välj en synlig logga.')

    let cutoutData = null
    if (removeWhiteBorderBackground(pixels)) {
      ctx.putImageData(pixels, 0, 0)
      cutoutData = encodeLogo(canvas, pixels)
    }
    return { data, cutoutData }
  } finally { URL.revokeObjectURL(url) }
}

export function CompetitionLogoTile({ src, alt, onError }) {
  return <span className="competition-logo-tile">
    <img src={src} alt={alt} decoding="async" onError={onError} />
  </span>
}

export function SavedCompetitionLogo({ competition, code, request, decorative = false, showStatus = false, lazy = false }) {
  if (!competition?.id || !competition.logo?.version) return null
  return <CompetitionLogoPreview key={`${competition.id}:${competition.logo.version}`}
    competition={competition} code={code} request={request} decorative={decorative} showStatus={showStatus} lazy={lazy} />
}

function CompetitionLogoPreview({ competition, code, request, decorative, showStatus, lazy }) {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const slot = useRef(null)
  const id = competition.id
  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const result = await request(`/api/workouts?competitionLogo=true&id=${encodeURIComponent(id)}`, code, { retry: false, signal: controller.signal })
        if (!result.url) throw new Error('Logo URL missing')
        if (!controller.signal.aborted) setUrl(result.url)
      } catch {
        if (!controller.signal.aborted) setFailed(true)
      }
    }
    let observer
    if (lazy && slot.current && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        void load()
      }, { rootMargin: '160px' })
      observer.observe(slot.current)
    } else void load()
    return () => { controller.abort(); observer?.disconnect() }
  }, [id, code, request, lazy, attempt])

  const tile = url && !failed && <CompetitionLogoTile src={url}
    alt={decorative ? '' : `Logga för ${competition.title}`} onError={() => setFailed(true)} />
  if (lazy) return <div ref={slot} className="competition-card-logo">{tile}</div>
  if (tile || !showStatus) return tile || null
  return failed
    ? <div className="competition-logo-preview-error"><small role="status">Förhandsvisningen kunde inte laddas.</small>
      <button type="button" className="text-button" onClick={() => {
        setUrl('')
        setFailed(false)
        setAttempt(value => value + 1)
      }}>Försök igen</button>
    </div>
    : <small role="status">Hämtar förhandsvisning…</small>
}
