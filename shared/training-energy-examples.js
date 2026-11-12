import { buildTrainingEnergy } from './training-energy.js'

const now = '2026-11-13T12:00:00Z'
export const TRAINING_ENERGY_EXAMPLES = [
  ['unknown', 'För lite färskt underlag', null, 4, 5, 'none'],
  ['low', 'Tyngre träningskänsla', 2, 3, 2, 'none'],
  ['steady', 'Okej / blandad känsla', 3, 4, 4, 'none'],
  ['strong', 'Stark träningskänsla', 4, 4, 5, 'none'],
  ['max', 'Maxad rapporterad känsla', 5, 5, 5, 'none'],
  ['blocked', 'Höga svar – men känningar', 5, 5, 5, 'mild'],
].map(([id, title, body, feeling, speedFeeling, status]) => ({ id, title,
  energy: buildTrainingEnergy({ responses: [{ date: '2026-11-13', createdAt: '2026-11-13T11:00:00Z', type: 'after', activityType: 'swim', body, feeling, speedFeeling }],
    illness: [{ activity_date: '2026-11-13', updated_at: '2026-11-13T11:00:00Z', status }] }, now),
  detail: id === 'blocked' ? 'Tre femmor finns, men glöd och puls pausas av rapporterade känningar. Uppföljning är separat.' : id === 'unknown' ? 'En färsk kroppsskattning saknas. Äldre svar fyller inte luckan.' : `${body} i kropp, ${feeling} i dagskänsla, ${speedFeeling} i simfartkänsla. Ett färskt Nej finns i sjukdomskollen.`,
}))
export const TRAINING_ENERGY_EXAMPLE_ANSWERS = [
  'Här visas fiktiva exempel med samma energistjärna och regler som på simmarkortet. De mäter inte toppform eller tävlingsberedskap.',
  ...TRAINING_ENERGY_EXAMPLES.map(example => `${example.title}: ${example.detail} Symbolens etikett: ${example.energy.label}. Effekt: ${example.energy.effect === 'max' ? 'guldglöd och dubbelpuls' : example.energy.effect === 'strong' ? 'turkos glöd och lugn puls' : 'stilla'}.`),
]
