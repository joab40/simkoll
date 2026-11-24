// Match the quick response and gradual release used by the Frostfjäll games.
export function winterSteer(velocity, direction, step) {
  return velocity + (direction * 11 - velocity) * Math.min(1, step * 13)
}
