import React, { useEffect, useState } from 'react'
import './competition-logo.css'

export const competitionLogoAccept = 'image/png,image/jpeg,image/webp'
const supportedTypes = competitionLogoAccept.split(',')

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

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1
    let visible = 0, lights = 0
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const pixel = (y * canvas.width + x) * 4
        if (!data[pixel + 3]) continue
        left = Math.min(left, x); right = Math.max(right, x)
        top = Math.min(top, y); bottom = Math.max(bottom, y)
        if (data[pixel + 3] < 32) continue
        visible += 1
        if (data[pixel] >= 215 && data[pixel + 1] >= 215 && data[pixel + 2] >= 215) lights += 1
      }
    }
    if (!visible) throw new Error('Bilden är genomskinlig. Välj en synlig logga.')

    const output = document.createElement('canvas')
    const croppedWidth = right - left + 1, croppedHeight = bottom - top + 1
    const finalScale = Math.min(1, 320 / Math.max(croppedWidth, croppedHeight))
    output.width = Math.max(1, Math.round(croppedWidth * finalScale))
    output.height = Math.max(1, Math.round(croppedHeight * finalScale))
    const outputContext = output.getContext('2d')
    outputContext.imageSmoothingQuality = 'high'
    outputContext.drawImage(canvas, left, top, croppedWidth, croppedHeight, 0, 0, output.width, output.height)
    const hasTransparency = visible < canvas.width * canvas.height * 0.92
    return { data: output.toDataURL('image/png'), surface: hasTransparency && lights / visible > 0.8 ? 'dark' : 'light' }
  } finally { URL.revokeObjectURL(url) }
}

export function CompetitionLogoTile({ src, surface, alt, className = '' }) {
  return <span className={`competition-logo-tile${className ? ` ${className}` : ''}`} data-surface={surface}>
    {src && <img src={src} alt={alt} decoding="async" />}
  </span>
}

export function SavedCompetitionLogo({ competition, code, request, className, decorative = false }) {
  const [loaded, setLoaded] = useState(null)
  const id = competition?.id
  const version = competition?.logo?.version
  const key = `${id}:${version}`
  useEffect(() => {
    if (!id || !version) return
    const controller = new AbortController()
    request(`/api/workouts?competitionLogo=true&id=${encodeURIComponent(id)}`, code, { retry: false, signal: controller.signal })
      .then(({ url }) => { if (!controller.signal.aborted && url) setLoaded({ key, url }) })
      .catch(() => {})
    return () => controller.abort()
  }, [key, id, version, code, request])
  if (!version || loaded?.key !== key) return null
  return <CompetitionLogoTile className={className} src={loaded.url} surface={competition.logo.surface}
    alt={decorative ? '' : `Logga för ${competition.title}`} />
}
