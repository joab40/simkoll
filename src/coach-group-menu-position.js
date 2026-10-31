export function groupMenuOffset(buttonLeft, panelWidth, viewportWidth) {
  const left = Math.max(16, Math.min(buttonLeft, viewportWidth - 16 - panelWidth))
  return left - buttonLeft
}
