// Manually checked against Bilaga 1, PDF page 5 of the supplied usm2026.pdf.
// This controls mapping/validation; it is NOT a recorded live model result.
const columns = [
  ['Lördag 09:00', `1. 400m me P 13-14
2. 400m fr F 13-14
3. 50m ry P 15
4. 200m me F 16-17
5. 200m ry P 16-17
6. 50m fj F 15
7. 200m fr P 15
8. 200m br F 13-14
9. 50m fj P 13-14
10. 50m fj F 16-17
11. 50m fr P 16-17
12. 200m br F 15
13. 200m fj P 15
14. 50m ry F 13-14
15. 800m fr P 13-14
16. 400m me P 16-17
17. 4x100m fr F 13-15
18. 4x100m fr P 13-15
19. 4x100m IM X 16-17`],
  ['Lördag 16:00', `20. 200m fj P 16-17
21. 200m fr F 16-17
22. 400m me P 15
23. 200m me F 15
24. 200 ry P 13-14
25. 200m fj F 13-14
26. 200m br P 16-17
27. 50m br F 16-17
28. 50m fr P 15
29. 800m fr F 15
30. 50m fr P 13-14
31. 50m br F 13-14
32. 50m ry P 16-17
33. 200m fj F 16-17
34. 200 ry P 15
35. 50m br F 15
36. 200m me P 13-14
37. 4x100m fr F 16-17
38. 4x100m fr P 16-17`],
  ['Söndag 09:00', `39. 400m me F 13-14
40. 400m fr P 13-14
41. 50m ry F 15
42. 200m me P 16-17
43. 200 ry F 16-17
44. 50m fj P 15
45. 200m fr F 15
46. 200m br P 13-14
47. 50m fj F 13-14
48. 50m fj P 16-17
49. 50m fr F 16-17
50. 200m br P 15
51. 200m fj F 15
52. 50m ry P 13-14
53. 800m fr F 13-14
54. 800m fr P 16-17
55. 400m me F 16-17
56. 4x100m me P 13-15
57. 4x100m me F 13-15`],
  ['Söndag 16:00', `58. 800m fr F 16-17
59. 200m me P 15
60. 400m me F 15
61. 200m fj P 13-14
62. 200m me F 13-14
63. 200m fr P 16-17
64. 200m br F 16-17
65. 800m fr P 15
66. 50m fr F 15
67. 50m br P 13-14
68. 50m fr F 13-14
69. 50m br P 16-17
70. 50m ry F 16-17
71. 50m br P 15
72. 200m ry F 15
73. 200 ry F 13-14
74. 4x100m me P 16-17
75. 4x100m me F 16-17
76. 4x100m IM X 13-15`],
]
export const usmCompetition = { title: 'USM 2026 regionfinal', startDate: '2026-11-28', endDate: '2026-11-29' }
export const usmLayout = {
  programTitle: 'Grenordning, USM 2026 regionfinal', selectionReason: 'Bilaga 1 avser regionfinalen 28–29 november; bilaga 2 är riksfinalen i januari.', selectionUncertain: false, otherPrograms: ['Bilaga 2 · USM riksfinal · sida 6'], warnings: [], ageClasses: '13-14, 15, 16-17; lag 13-15 och 16-17',
  sessions: columns.map(([label, text], index) => ({ id: `region-${index + 1}`, label, weekday: label.split(' ')[0], date: '', warmup: '', start: label.split(' ')[1], sourcePage: 5, sourceHeader: label, expectedNumbers: text.split('\n').map(line => line.split('.')[0]) })),
}
const strokes = { fr: 'Frisim', ry: 'Ryggsim', br: 'Bröstsim', fj: 'Fjärilsim', me: 'Medley', IM: 'Medley' }
export const usmEvents = columns.flatMap(([label, text], index) => text.split('\n').map(source => {
  const match = source.match(/^(\d+)\. ((?:4x)?\d+)m? (\w+) ([PFX]) (\d+(?:-\d+)?)$/)
  if (!match) throw new Error(`Invalid manually checked fixture: ${source}`)
  return { eventNumber: match[1], sessionId: `region-${index + 1}`, sessionLabel: label, sourcePage: 5, itemType: 'race', gender: { P: 'Herr', F: 'Dam', X: 'Mix' }[match[4]], ageClass: match[5], distanceMeters: match[2].split('x').reduce((a, b) => a * Number(b), 1), stroke: strokes[match[3]], label: `${match[2]} ${match[3] === 'IM' ? 'IM' : strokes[match[3]]}`, source, uncertain: false }
}))
