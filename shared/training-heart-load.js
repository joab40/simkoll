// Presentation only: the existing heart calculation decides whether coverage is
// sufficient. Never infer a zero load or a comparison from missing reports.
export function trainingHeartLoadSummary(load) {
  const ratio = load?.ratio
  if (!Number.isFinite(ratio) || ratio < 0) return { direction: 'unknown', value: 'Jämförelse saknas', label: 'Belastning: jämförelse saknas', description: 'Underlaget räcker inte för att jämföra de senaste sju dagarna med föregående sju dagar.' }
  // Ratio is already rounded to .001 by buildTrainingHeart. Match its displayed
  // one-decimal percentage, without turning 75% of previous load into a 75% drop.
  const change = Math.round((ratio - 1) * 1000) / 10
  if (change === 0) return { direction: 'same', value: '≈ Oförändrad', label: 'Belastning ≈ Oförändrad', description: 'Samma rapporterade belastning som föregående sju dagar, avrundat till en decimal.' }
  const percent = Math.abs(change).toLocaleString('sv-SE', { maximumFractionDigits: 1 })
  const direction = change > 0 ? 'up' : 'down', value = `${change > 0 ? '↑' : '↓'} ${percent} %`
  return { direction, value, label: `Belastning ${value}`, description: `${percent} % ${change > 0 ? 'högre' : 'lägre'} rapporterad belastning senaste sju dagarna jämfört med föregående sju dagar. Ökning och minskning är inte i sig bra eller dåligt.` }
}
