// Only technical metadata. Never store object paths, original filenames,
// signed tokens, owner IDs, file contents or provider error text.
export function storageMutationEvent(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase()
  const upload = path.match(/^object\/([^/]+)\/(.+)$/)
  if (['POST', 'PUT'].includes(method) && upload && !['sign', 'list', 'upload', 'copy', 'move'].includes(upload[1])) {
    const bytes = options.body?.byteLength ?? options.body?.size
    return { action: 'upload', bucket_id: upload[1].slice(0, 100), stage: upload[2].includes('/incoming/') ? 'temporary' : 'saved', bytes: Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null, object_count: 1 }
  }
  const removal = path.match(/^object\/([^/?]+)$/)
  if (method === 'DELETE' && removal) {
    let prefixes = []
    try { const body = JSON.parse(options.body); if (Array.isArray(body.prefixes)) prefixes = body.prefixes } catch {}
    return { action: 'delete', bucket_id: removal[1].slice(0, 100), object_count: prefixes.length, stage: prefixes.length && prefixes.every((p) => typeof p === 'string' && p.includes('/incoming/')) ? 'temporary' : 'saved' }
  }
  return null
}

export async function recordStorageEvent(db, event, response = null) {
  if (!event) return
  try {
    await db('storage_usage_events', { method: 'POST', signal: AbortSignal.timeout(1500),
      headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...event, success: response?.ok === true, http_status: response?.status || null }) })
  } catch { /* A missing migration/logging failure must not break file handling. */ }
}
