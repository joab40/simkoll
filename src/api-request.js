export function createApiRequest({ fetcher = (...args) => fetch(...args), pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  return async function apiRequest(url, code, options = {}) {
    const canRetry = !options.method || options.method.toUpperCase() === 'GET'
    let lastError
    for (let attempt = 0; attempt < (canRetry ? 3 : 1); attempt++) {
      try {
        const result = await fetcher(url, { ...options, headers: { ...options.headers, 'x-simkoll-code': code } })
        const data = await result.json().catch(() => ({}))
        if (result.ok) return data
        lastError = new Error(data.error || 'Något gick fel. Försök igen.')
        lastError.retryable = result.status >= 500
        if (!canRetry || !lastError.retryable || attempt === 2) throw lastError
      } catch (error) {
        lastError = error
        if (!canRetry || error.name === 'AbortError' || error.retryable === false || attempt === 2) throw error
      }
      await pause(600 * (attempt + 1))
    }
    throw lastError || new Error('Något gick fel. Försök igen.')
  }
}

export const apiRequest = createApiRequest()
