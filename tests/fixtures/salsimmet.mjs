// Manually transcribed from the supplied Sälsimmet 2026 program.
// This is an extraction/validation control, NOT evidence of live AI accuracy.
const table = [
  ['200 Frisim','Dam','A-B-C'], ['200 Frisim','Herr','A-B-C'], ['200 Frisim','Mix','D'], ['25 Frisim','Mix','F & yngre'], ['50 Frisim','Mix','E & yngre'],
  ['100 Ryggsim','Dam','A-B-C'], ['100 Ryggsim','Herr','A-B-C'], ['100 Ryggsim','Mix','D'], ['25 Bröstsim','Mix','F & yngre'], ['50 Bröstsim','Mix','E & yngre'],
  ['200 Bröstsim','Mix','D'], ['200 Bröstsim','Dam','A-B-C'], ['200 Bröstsim','Herr','A-B-C'], ['100 Medley','Mix','D'], ['100 Medley','Dam','A-B-C'], ['100 Medley','Herr','A-B-C'],
  ['50 Bröstsim','Mix','D'], ['50 Bröstsim','Dam','A-B-C'], ['50 Bröstsim','Herr','A-B-C'], ['4x25 Medley','Mix','D-E-F'], ['4x100 Medley','Mix','A-B-C'],
  ['4x25 Frisim','Mix','D-E-F'], ['4x100 Frisim','Mix','A-B-C'], ['200 Fjärilsim','Dam','A-B-C'], ['200 Fjärilsim','Herr','A-B-C'], ['25 Ryggsim','Mix','F'], ['50 Ryggsim','Mix','E & yngre'],
  ['100 Frisim','Mix','D'], ['100 Frisim','Dam','A-B-C'], ['100 Frisim','Herr','A-B-C'], ['25 Fjärilsim','Mix','E & yngre'], ['50 Fjärilsim','Mix','E & yngre'],
  ['200 Medley','Mix','D'], ['200 Medley','Dam','A-B-C'], ['200 Medley','Herr','A-B-C'], ['50 Fjärilsim','Mix','D'], ['50 Fjärilsim','Dam','A-B-C'], ['50 Fjärilsim','Herr','A-B-C'],
  ['100 Bröstsim','Mix','D'], ['100 Bröstsim','Dam','A-B-C'], ['100 Bröstsim','Herr','A-B-C'],
  ['200 Ryggsim','Mix','D'], ['200 Ryggsim','Dam','A-B-C'], ['200 Ryggsim','Herr','A-B-C'], ['100 Fjärilsim','Mix','D'], ['100 Fjärilsim','Dam','A-B-C'], ['100 Fjärilsim','Herr','A-B-C'],
  ['50 Ryggsim','Mix','D'], ['50 Ryggsim','Dam','A-B-C'], ['50 Ryggsim','Herr','A-B-C'], ['50 Frisim','Mix','D'], ['50 Frisim','Dam','A-B-C'], ['50 Frisim','Herr','A-B-C'], ['800 Frisim','Dam','A-B-C'], ['800 Frisim','Herr','A-B-C'],
]
export const salsimmet = {
  sessions: [
    { label: 'Pass 1', date: 'lördag 17/10', warmup: '13:00', start: '14:30', expectedNumbers: Array.from({ length: 21 }, (_, i) => String(i + 1)) },
    { label: 'Pass 2', date: 'söndag 18/10', warmup: '07:30', start: '09:00', expectedNumbers: Array.from({ length: 20 }, (_, i) => String(i + 22)) },
    { label: 'Pass 3', date: 'söndag 18/10', warmup: '13:30', start: '15:00', expectedNumbers: Array.from({ length: 14 }, (_, i) => String(i + 42)) },
  ], warnings: [],
  events: table.map(([label, gender, ageClass], i) => {
    const [distance, stroke] = label.split(' ')
    return { eventNumber: String(i + 1), sessionLabel: i < 21 ? 'Pass 1' : i < 41 ? 'Pass 2' : 'Pass 3', itemType: 'race', gender, ageClass, distanceMeters: distance.includes('x') ? distance.split('x').reduce((a, b) => a * b, 1) : Number(distance), stroke, label, source: `${i + 1} ${label} ${gender} ${ageClass}`, uncertain: false }
  }),
}
