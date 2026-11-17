// Performance events must not include password-reset tokens, push owner IDs,
// query parameters or fragments. App content and profile data are never added.
export function redactSpeedInsightsUrl(event) {
  try {
    const url = new URL(event.url)
    if (!['https:', 'http:'].includes(url.protocol)) return null
    return { ...event, url: `${url.origin}${url.pathname}` }
  } catch {
    // Do not send an unparseable URL that might contain sensitive parameters.
    return null
  }
}
