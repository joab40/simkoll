// The visual fill follows the same frame/charge as the physics, not the slower
// React text HUD. A transform avoids re-laying out the bar or adding input lag.
export function paintBottlePower(fill, charge) {
  if (!fill) return
  const value = Number.isFinite(charge) ? Math.max(0, Math.min(1, charge)) : 0
  const transform = `scaleX(${Number(value.toFixed(6))})`
  if (fill.style.transform !== transform) fill.style.transform = transform
}
