// Presentation only. Missing totals remain missing; unused sources are not gaps.
export function heartDuration(minutes) {
  if (!Number.isFinite(minutes)) return 'Saknas'
  const rounded = Math.round(minutes)
  return `${Math.floor(rounded / 60)} h${rounded % 60 ? ` ${rounded % 60} min` : ''}`
}

export function heartLoadSources(load) {
  const number = value => value == null ? 'Saknas' : value.toLocaleString('sv-SE', { maximumFractionDigits: 1 })
  const reported = load.reported === 0 ? 'Ingen rapporterad tid användes' : `${number(load.reportedValue)} belastningspoäng från rapporterad tid`
  const estimated = load.estimated === 0 ? 'Ingen uppskattad tid användes' : `${number(load.estimatedValue)} belastningspoäng från uppskattad tid`
  return `${reported} · ${estimated}`
}
