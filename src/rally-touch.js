// Keep Safari's page gestures off the steering pad, not off the whole page.
// Pointer events remain the single source for which direction is held.
const gestureEvents = ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu', 'selectstart', 'dragstart']
export function guardRallyTouches(root, release = () => {}) {
  const pads = [...(root?.querySelectorAll('.rally-controls') || [])]
  const options = { passive: false, capture: true }
  const guard = event => {
    if (event.cancelable) event.preventDefault()
    // A cancelled gesture must never leave steering stuck. Lifting one thumb
    // must not release the other thumb that is still on a steering button.
    if (event.type === 'touchcancel' || (event.type === 'touchend' && event.touches?.length === 0)) release()
  }
  for (const pad of pads) for (const type of gestureEvents) pad.addEventListener(type, guard, options)
  return () => {
    for (const pad of pads) for (const type of gestureEvents) pad.removeEventListener(type, guard, options)
  }
}
