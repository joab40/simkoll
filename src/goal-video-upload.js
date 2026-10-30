import { inspectGoalVideo, GOAL_VIDEO_MAX_BYTES, GOAL_VIDEO_FORMAT_HELP } from '../shared/goal-video.js'

export async function prepareGoalVideo(file) {
  if (!/\.(mp4|mov)$/i.test(file.name) || file.size > GOAL_VIDEO_MAX_BYTES) throw new Error(GOAL_VIDEO_FORMAT_HELP)
  const info = inspectGoalVideo(await file.arrayBuffer())
  const posterData = await new Promise((resolve, reject) => {
    const video = document.createElement('video'), url = URL.createObjectURL(file)
    let done = false
    const finish = (value, error) => {
      if (done) return
      done = true; clearTimeout(timer); video.onloadeddata = null; video.onerror = null; video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url)
      if (error) reject(error); else resolve(value)
    }
    const timer = setTimeout(() => finish(null), 5000)
    video.muted = true; video.playsInline = true; video.preload = 'auto'
    video.onloadeddata = () => {
      try {
        const canvas = document.createElement('canvas'), ratio = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight))
        canvas.width = Math.max(1, Math.round(video.videoWidth * ratio)); canvas.height = Math.max(1, Math.round(video.videoHeight * ratio))
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
        const image = canvas.toDataURL('image/jpeg', .75)
        finish(image.length < 260000 ? image : null)
      } catch { finish(null) }
    }
    video.onerror = () => finish(null, new Error('Klippet kan inte spelas upp i den här webbläsaren. Exportera som MP4/H.264 och försök igen.'))
    video.src = url; video.load()
  })
  return { file, posterData, info }
}

export function uploadVideoFile(url, file, { signal, onProgress = () => {}, makeXhr = () => new XMLHttpRequest() } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = makeXhr()
    const aborted = () => { xhr.abort(); reject(new DOMException('Uppladdningen avbröts.', 'AbortError')) }
    if (signal?.aborted) return aborted()
    signal?.addEventListener('abort', aborted, { once: true })
    const finish = (error) => { signal?.removeEventListener('abort', aborted); if (error) reject(error); else resolve() }
    xhr.open('PUT', url); xhr.timeout = 180000; xhr.withCredentials = false
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.min(100, Math.round(event.loaded / event.total * 100))) }
    xhr.onload = () => finish(xhr.status >= 200 && xhr.status < 300 ? null : new Error('Videon kunde inte laddas upp till lagringen. Försök igen.'))
    xhr.onerror = () => finish(new Error('Anslutningen bröts under uppladdningen. Försök igen.'))
    xhr.ontimeout = () => finish(new Error('Uppladdningen tog för lång tid. Försök på nytt med bättre anslutning eller en mindre fil.'))
    xhr.onabort = () => finish(new DOMException('Uppladdningen avbröts.', 'AbortError'))
    const body = new FormData()
    body.append('cacheControl', '0')
    body.append('', new Blob([file], { type: 'video/mp4' }), 'clip.mp4')
    xhr.send(body)
  })
}

export async function uploadGoalVideo(request, code, goalId, attachment, { signal, onProgress = () => {}, upload = uploadVideoFile } = {}) {
  const post = (body, requestSignal = signal) => request('/api/goals', code, { method: 'POST', signal: requestSignal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, goalId }) })
  onProgress('Startar säker uppladdning…')
  const started = await post({ action: 'begin-goal-video', bytes: attachment.file.size })
  try {
    await upload(started.uploadUrl, attachment.file, { signal, onProgress: (percent) => onProgress(`Laddar upp video · ${percent} %`) })
    onProgress('Kontrollerar och sparar videon…')
    return await post({ action: 'finish-goal-video', ticket: started.ticket, posterData: attachment.posterData })
  } catch (error) {
    // This only removes the temporary upload, never a finalized attachment.
    await post({ action: 'cancel-goal-video', ticket: started.ticket }, AbortSignal.timeout(5000)).catch(() => {})
    throw error
  }
}
