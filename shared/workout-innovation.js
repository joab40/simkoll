// The level controls permitted changes, not the model or sampling temperature.
export const WORKOUT_INNOVATION_MODES = [
  { label: 'Biblioteksnära', description: 'Behåll befintliga serier. Anpassa främst mängd, vila och startintervall.', instruction: 'Återanvänd ett lämpligt bibliotekspass och dess serier så nära originalet som möjligt. Gör endast nödvändiga anpassningar till kraven. Skapa inte nya övningar eller en ny huvudserie. Om underlaget inte kan uppfylla kraven, ange problemet i limitation.' },
  { label: 'Försiktig variation', description: 'Utgå från ett tidigare pass och gör mindre variationer.', instruction: 'Behåll ett bibliotekspass som tydlig stomme. Tillåt små ändringar i repetitioner, ordning, vila och simsätt när de passar inriktningen. Undvik ett helt nytt upplägg.' },
  { label: 'Balanserat', description: 'Kombinera beprövade serier med några nya idéer.', instruction: 'Kombinera relevanta serier från biblioteket med några egna variationer. Balansera igenkänning och nytänkande. Låt biblioteket vara en tydlig grund.' },
  { label: 'Mer variation', description: 'Skapa fler nya serier med biblioteket som inspiration.', instruction: 'Tillåt nya serier och en ny ordning. Använd de mest relevanta bibliotekspassen som inspiration snarare än mall. Beskriv tydligt vad som är nytt.' },
  { label: 'Nytänkande', description: 'Skapa ett friare upplägg inom dina valda träningsramar.', instruction: 'Skapa gärna ett helt nytt upplägg med egna serier. Biblioteket är referens för nivå, språk och belastning, inte en mall. Nyskapande får aldrig gå före genomförbarhet, teknik eller de fasta kraven.' },
]

export const DEFAULT_WORKOUT_INNOVATION = 2

export function workoutInnovationMode(level = DEFAULT_WORKOUT_INNOVATION) {
  if (!Number.isInteger(level) || level < 0 || level >= WORKOUT_INNOVATION_MODES.length) throw new Error('Välj ett av de fem variationslägena.')
  return WORKOUT_INNOVATION_MODES[level]
}
