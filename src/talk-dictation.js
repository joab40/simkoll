// A recording stays in memory. Cancelling or leaving never submits it.
export async function startTalkRecording({ mediaDevices = navigator.mediaDevices, Recorder = MediaRecorder, onResult, onError, onStarted = () => {}, maxMs = 120000, maxBytes = 2500000 }) {
  let stream, recorder, timer, cancelled = false, bytes = 0
  const chunks = []
  const release = () => { clearTimeout(timer); stream?.getTracks().forEach((track) => track.stop()) }
  const cancel = () => { cancelled = true; if (recorder?.state === 'recording') recorder.stop(); release() }
  const stop = () => { clearTimeout(timer); if (recorder?.state === 'recording') recorder.stop() }
  const ready = (async () => {
    try {
      stream = await mediaDevices.getUserMedia({ audio: true })
      if (cancelled) { release(); return }
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((type) => Recorder.isTypeSupported(type))
      recorder = new Recorder(stream, mimeType ? { mimeType } : undefined)
      recorder.ondataavailable = ({ data }) => { if (data.size) { bytes += data.size; chunks.push(data); if (bytes > maxBytes) stop() } }
      recorder.onerror = () => { cancel(); onError(new Error('Inspelningen avbröts. Försök igen eller skriv anteckningarna.')) }
      recorder.onstop = () => {
        release()
        if (cancelled) return
        if (bytes > maxBytes) return onError(new Error('Inspelningen blev för stor. Spela in en kortare anteckning.'))
        if (!bytes) return onError(new Error('Inget ljud spelades in. Försök igen.'))
        onResult(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }))
      }
      recorder.start(1000); timer = setTimeout(stop, maxMs); onStarted()
    } catch (error) { release(); if (!cancelled) onError(error) }
  })()
  // Returned before microphone permission resolves, so unmount can cancel it.
  return { stop, cancel, ready }
}

export function appendTalkTranscript(notes, transcript) {
  const value = [notes.trim(), transcript.trim()].filter(Boolean).join('\n\n')
  if (value.length > 10000) throw new Error('Anteckningarna får vara högst 10 000 tecken. Korta texten först.')
  return value
}
