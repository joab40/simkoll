// Presentation only: the existing heart calculation decides whether coverage is
// sufficient. Never infer a zero load or a comparison from missing reports.
export function trainingHeartLoadSummary(load) {
  const ratio = load?.ratio
  const estimated = load?.estimated > 0 || load?.previous?.estimated > 0
  const heading = estimated ? 'Uppskattad belastning' : 'Belastning', shortLabel = estimated ? '≈ Belastning' : 'Belastning'
  const basis = estimated ? ' Jämförelsen innehåller RPE × tränarens planerade passtid, som används automatiskt när egen tid saknas. Tiden är hämtad från planeringen, inte bekräftad faktisk träningstid.' : ''
  if (!Number.isFinite(ratio) || ratio < 0) return { estimated, shortLabel, direction: 'unknown', value: 'Jämförelse saknas', label: `${heading}: jämförelse saknas`, description: `Underlaget räcker inte för att jämföra de senaste sju dagarna med föregående sju dagar.${basis}` }
  // Ratio is already rounded to .001 by buildTrainingHeart. Match its displayed
  // one-decimal percentage, without turning 75% of previous load into a 75% drop.
  const change = Math.round((ratio - 1) * 1000) / 10
  if (change === 0) return { estimated, shortLabel, direction: 'same', value: '≈ Oförändrad', label: `${heading} ≈ Oförändrad`, description: `Samma belastning i underlaget som föregående sju dagar, avrundat till en decimal.${basis}` }
  const percent = Math.abs(change).toLocaleString('sv-SE', { maximumFractionDigits: 1 })
  const direction = change > 0 ? 'up' : 'down', value = `${change > 0 ? '↑' : '↓'} ${percent} %`
  return { estimated, shortLabel, direction, value, label: `${heading} ${value}`, description: `${percent} % ${change > 0 ? 'högre' : 'lägre'} belastning i underlaget senaste sju dagarna jämfört med föregående sju dagar. Ökning och minskning är inte i sig bra eller dåligt.${basis}` }
}
