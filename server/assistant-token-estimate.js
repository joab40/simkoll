import { Tiktoken } from 'js-tiktoken/lite'
import ranks from 'js-tiktoken/ranks/o200k_base'

let encoder
export function localAssistantTokenEstimate(request) {
  encoder ||= new Tiktoken(ranks)
  // Chunking bounds CPU cost for very long uninterrupted strings. This is a
  // local estimate (not API billing tokens). The small request-local cache is
  // discarded on return; no source text is retained between requests or logged.
  const chunks = new Map()
  const count = text => {
    let total = 0
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + 256, text.length)
      const last = text.charCodeAt(end - 1)
      if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--
      const chunk = text.slice(start, end)
      let tokens = chunks.get(chunk)
      if (tokens === undefined) { tokens = encoder.encode(chunk, [], []).length; if (chunks.size < 128) chunks.set(chunk, tokens) }
      total += tokens
      start = end
    }
    return total
  }
  const texts = [request.instructions || '', ...request.input.map(item => typeof item.content === 'string' ? item.content : JSON.stringify(item.content)), JSON.stringify(request.text || {})]
  return texts.reduce((sum, text) => sum + count(text), 256)
}
