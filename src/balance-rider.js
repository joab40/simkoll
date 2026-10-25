// Bike-local coordinates: a conventional rear triangle and main diamond,
// with the crank above the wheel axles and both feet attached to the pedals.
export const BALANCE_BIKE = {
  rear: [0, 0], front: [132, 0], wheelRadius: 32, crank: [58, -7],
  seat: [42, -61], headTop: [98, -64], headBottom: [104, -46],
  hip: [43, -78], thighLength: 44, shinLength: 46, crankLength: 15,
}

function forwardKnee(hip, foot) {
  const dx = foot[0] - hip[0], dy = foot[1] - hip[1], distance = Math.hypot(dx, dy)
  const { thighLength: thigh, shinLength: shin } = BALANCE_BIKE
  const along = (thigh ** 2 - shin ** 2 + distance ** 2) / (2 * distance)
  const forward = Math.sqrt(Math.max(0, thigh ** 2 - along ** 2))
  // Always use the forward-facing joint solution for BOTH legs.
  return [hip[0] + dx * along / distance + dy * forward / distance, hip[1] + dy * along / distance - dx * forward / distance]
}

export function balanceRiderPose(game) {
  const { crank, crankLength, hip } = BALANCE_BIKE
  const phase = game.wheelieStarted ? Math.PI / 6 : game.distance * .5
  const offset = [Math.cos(phase) * crankLength, Math.sin(phase) * crankLength]
  const nearFoot = [crank[0] + offset[0], crank[1] + offset[1]]
  const farFoot = [crank[0] - offset[0], crank[1] - offset[1]]
  return {
    hip,
    near: { foot: nearFoot, knee: forwardKnee(hip, nearFoot) },
    far: { foot: farFoot, knee: forwardKnee(hip, farFoot) },
  }
}
