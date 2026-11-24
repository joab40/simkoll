// iOS can show its text loupe after repeated/long touches even with
// touch-action:none. Cancel the native gesture only on the playing controls;
// pointer events still handle lift/release, including pointer cancellation.
export function guardGameTouches(controls) {
  const preventGesture = (event) => { if (event.cancelable) event.preventDefault() }
  const options = { passive: false }
  for (const control of controls) {
    control.addEventListener('touchstart', preventGesture, options)
    control.addEventListener('contextmenu', preventGesture)
    control.addEventListener('selectstart', preventGesture)
  }
  return () => {
    for (const control of controls) {
      control.removeEventListener('touchstart', preventGesture, options)
      control.removeEventListener('contextmenu', preventGesture)
      control.removeEventListener('selectstart', preventGesture)
    }
  }
}

export function guardBalanceTouches(root) {
  return guardGameTouches(root?.querySelectorAll('canvas, .balance-hold') || [])
}
