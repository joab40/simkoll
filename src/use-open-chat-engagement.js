import { useCallback, useEffect, useRef, useState } from 'react'

const VIEW_BATCH_SIZE = 40

function useMessageViews({ active, messages, scroller, submit }) {
  const recorded = useRef(new Set())

  useEffect(() => {
    const log = scroller.current
    if (!active || !log || !globalThis.IntersectionObserver) return
    const trackable = new Set(messages.filter(item => item.engagement && !item.engagement.seen).map(item => item.id))
    if (!trackable.size) return
    const visible = new Set()
    let timer

    const flush = async () => {
      timer = undefined
      if (document.hidden) return
      const ids = [...visible].filter(id => !recorded.current.has(id)).slice(0, VIEW_BATCH_SIZE)
      if (!ids.length) return
      for (const id of ids) recorded.current.add(id)
      try {
        await submit({ action: 'record-open-chat-views', messageIds: ids })
      } catch {
        for (const id of ids) recorded.current.delete(id)
      }
    }
    const schedule = () => {
      if (!document.hidden && timer == null && [...visible].some(id => !recorded.current.has(id))) {
        timer = window.setTimeout(flush, 350)
      }
    }

    // The window viewport also clips to the scroll container, so a chat below the fold cannot count.
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = entry.target.dataset.openChatView
        if (entry.isIntersecting && (entry.intersectionRatio >= 0.25 || entry.intersectionRect.height >= 40)) visible.add(id)
        else visible.delete(id)
      }
      schedule()
    }, { threshold: [0, 0.03, 0.25] })
    for (const bubble of log.querySelectorAll('[data-open-chat-view]')) {
      const id = bubble.dataset.openChatView
      if (trackable.has(id) && !recorded.current.has(id)) observer.observe(bubble)
    }
    document.addEventListener('visibilitychange', schedule)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', schedule)
      window.clearTimeout(timer)
    }
  }, [active, messages, scroller, submit])
}

export function useOpenChatEngagement({ active, messages, scroller, code, request, setData }) {
  const lifetime = useRef(null)
  const queue = useRef(Promise.resolve())
  const [likingId, setLikingId] = useState(null)
  const [error, setError] = useState('')
  const likeInFlight = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [code, request])

  const submit = useCallback(body => {
    const signal = lifetime.current?.signal
    // Apply view and like responses in order for this profile, even if initiated together.
    const task = queue.current.then(async () => {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const result = await request('/api/community', code, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
      })
      if (signal?.aborted || !result.engagement?.length) return
      const totals = new Map(result.engagement.map(({ messageId, ...counts }) => [messageId, counts]))
      setData(current => ({
        ...current, openChat: {
          ...current.openChat,
          messages: current.openChat.messages.map(item => totals.has(item.id) ? { ...item, engagement: totals.get(item.id) } : item),
        },
      }))
    })
    queue.current = task.catch(() => {})
    return task
  }, [code, request, setData])

  useMessageViews({ active, messages, scroller, submit })

  const toggleLike = async item => {
    if (likeInFlight.current) return
    likeInFlight.current = true
    setLikingId(item.id)
    setError('')
    try { await submit({ action: 'set-open-chat-like', messageId: item.id, liked: !item.engagement.liked }) }
    catch (failure) { if (failure.name !== 'AbortError') setError(failure.message) }
    finally { likeInFlight.current = false; setLikingId(null) }
  }

  return { toggleLike, likingId, error }
}
