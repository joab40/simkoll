export const CHART_ZOOM_LEVELS = [1, 2, 4, 8]
export function chartZoomWidth(viewport, zoom = 1) {
  const base = Number.isFinite(viewport) && viewport > 0 ? Math.max(560, viewport) : 800
  return Math.round(base * (CHART_ZOOM_LEVELS.includes(zoom) ? zoom : 1))
}
export function chartZoomScroll(center, width, viewport) {
  const position = Number.isFinite(center) ? Math.min(1, Math.max(0, center)) : 0
  return Math.max(0, Math.min(Math.max(0, width - viewport), position * width - viewport / 2))
}
