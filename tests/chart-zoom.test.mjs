import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CHART_ZOOM_LEVELS, chartZoomWidth, chartZoomScroll } from '../src/chart-zoom.js'

test('zoom uses readable viewport dimensions, bounded levels and unchanged vertical scale', () => {
  assert.deepEqual(CHART_ZOOM_LEVELS, [1, 2, 4, 8])
  assert.equal(chartZoomWidth(1200, 1), 1200)
  assert.equal(chartZoomWidth(1200, 4), 4800)
  assert.equal(chartZoomWidth(320, 2), 1120)
  assert.equal(chartZoomWidth(1200, Infinity), 1200)
  assert.equal(chartZoomWidth(NaN, 1), 800)
  assert.equal(chartZoomWidth(-1, -1), 800)
})

test('zoom keeps the visible center and clamps at both ends without inventing a data window', () => {
  assert.equal(chartZoomScroll(.5, 2400, 1200), 600)
  assert.equal(chartZoomScroll(1, 2400, 1200), 1200)
  assert.equal(chartZoomScroll(0, 2400, 1200), 0)
  assert.equal(chartZoomScroll(.75, 1200, 1200), 0)
  assert.equal(chartZoomScroll(NaN, 1200, 320), 0)
})

test('chart zoom is display-only, resettable and accessible, with native touch scroll and mouse drag', () => {
  const view = readFileSync(new URL('../src/trend-line-chart.jsx', import.meta.url), 'utf8')
  assert.match(view, /ResizeObserver/)
  assert.match(view, /chartZoomWidth\(viewport, zoom\)/)
  assert.match(view, /height = 230/)
  assert.match(view, /style=\{\{ width, minWidth: width \}\}/)
  assert.match(view, /periodKey/)
  assert.match(view, /setZoom\(1\)/)
  assert.match(view, /aria-label="Zooma in diagrammet"/)
  assert.match(view, /aria-live="polite"/)
  assert.match(view, /tabIndex=\{0\}/)
  assert.match(view, /event.pointerType !== 'mouse'/)
  assert.match(view, /setPointerCapture/)
  assert.match(view, /onPointerCancel/)
  assert.match(view, /onLostPointerCapture/)
  assert.doesNotMatch(view, /fetch\(|apiRequest|\.slice\(.*zoom|items\.splice/)
})
