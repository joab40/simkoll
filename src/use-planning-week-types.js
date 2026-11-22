import { useEffect, useState } from 'react'

export function usePlanningWeekTypes({ code, request, from, to, includeCompetitions = false }) {
  const endpoint = from && to ? `/api/workouts?weekTypes=true&from=${from}&to=${to}${includeCompetitions ? '&includeCompetitions=true' : ''}` : null
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  const key = endpoint ? `${code}:${endpoint}:${attempt}` : null

  useEffect(() => {
    if (!endpoint) return
    const controller = new AbortController()
    request(endpoint, code, { signal: controller.signal, retry: false }).then(data => {
      if (!controller.signal.aborted) setResult({ key, data })
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ key, error: error.message })
    })
    return () => controller.abort()
  }, [key, code, endpoint, request])

  return { ...(result?.key === key ? result : null), retry: () => setAttempt(value => value + 1) }
}
