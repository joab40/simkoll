// Fixed decorative positions: no randomness, timers, network or training data.
export const WINTER_SNOWFLAKES = Object.freeze(Array.from({ length: 16 }, (_, index) => Object.freeze({
  left: 3 + (index * 37 % 95), top: 6 + (index * 29 % 79),
  size: 9 + (index % 4) * 3, duration: 13 + (index % 5) * 2,
  delay: -(index * 2.7), drift: index % 2 ? 22 : -18,
})))
