export function indexRowsBy(rows, keyFor) {
  const index = new Map()
  for (const row of rows) {
    const key = keyFor(row)
    const bucket = index.get(key)
    if (bucket) bucket.push(row)
    else index.set(key, [row])
  }
  return index
}
