import { buildTrainingHeart } from './training-heart.js'
import { trainingHeartLoadSummary } from './training-heart-load.js'

export const TRAINING_HEART_EXAMPLE_NOTICE = 'Träningslägena visar rapporterade signaler, inte bekräftad toppform. Turbo är en toppningssignal att diskutera med tränaren, inte ett tävlingsklartecken. Utvilad är en tolkning av flera svar, inte uppmätt återhämtning.'
export const TRAINING_HEART_EXAMPLE_INTRO = [
  'Här visas fiktiva exempel, inte någon simmares uppgifter. Samma hjärta och beräkningsregler används som på simmarkortet. Exemplen står stilla från början; välj Visa pulsering för att jämföra takterna. Minskad rörelse i enhetens inställningar gäller även här.',
  'Stark, snabb och återhämtad inför ett mästerskap är ett möjligt positivt mönster, inte något hjärtat kan bekräfta. Det mäter inte toppform eller tävlingsberedskap. Måltävling, toppningsperiod, träningsfas, testlopp och tävlingsresultat ingår inte i hjärtats nuvarande beräkning. Bedöm sammanhanget tillsammans med tränaren.',
  'Ringen och etiketten visar samlade träningssignaler. Guld/grönt och dubbelpuls = Turbo · toppningssignal. Grönt = utvilad/redo-signal. Petrol/blått = fart eller jämförbar belastning. Orange = tung träning eller återhämtning att följa upp. Grått och streckat = träningsläget saknar tillräckligt aktuellt underlag. Hjärtfärgen visar fortfarande kropp och dagskänsla; grundstorleken visar jämförbar RPE × tid, mindre under 80 % och större över 120 % av föregående vecka. Belastningens procent och täckning ligger i detaljerna. Ringens läge och belastningsjämförelsen är separata: hög fartkänsla kan visas utan jämförbar belastning, men inte Turbo. Varningar hindrar redo och Turbo. Animationen är symbolisk, inte faktisk puls; snabb fartpuls ensam bekräftar inte form.',
]

const asOf = '2026-11-01'
const previousDates = ['2026-10-23', '2026-10-24', '2026-10-25']
const recentDates = ['2026-10-30', '2026-10-31', asOf]
const scenarios = [
  { id: 'competition', title: 'Turbo · toppningssignal inför mästerskap', body: 4.5, feeling: 4.5, speed: 5, rpe: 5, minutes: 60, previousRpe: 6, previousMinutes: 90, sleepMinutes: 540,
    interpretation: 'Lysande guld/grön ring, mindre hjärtgrundstorlek och tydlig dubbelpuls. Stark kropp, god dagskänsla, hög simfartkänsla, positiva sömnsvar och minskad belastning sammanfaller. Stäm av med simmaren och tävlingsplanen; detta är inte bekräftad toppform.' },
  { id: 'ready', title: 'Utvilad och redo · signal', body: 4, feeling: 4, speed: 4, rpe: 5, minutes: 100, previousRpe: 6, previousMinutes: 90, sleepMinutes: 540,
    interpretation: 'Grön ring med tydlig etikett. Positiva aktuella kropp-, dags-, fart- och sömnsvar sammanfaller. Ingen Turbo eftersom de starkare kraven på känsla och minskad belastning inte är uppfyllda. Utvilad är en försiktig tolkning, inte en direkt återhämtningsmätning.' },
  { id: 'rising', title: 'På väg mot fart', body: 3.5, feeling: 3.5, speed: 3.5, earlierSpeed: 2.5, rpe: 5, minutes: 80, previousRpe: 5, previousMinutes: 80, sleepMinutes: 510,
    interpretation: 'Petrolfärgad ring. Aktuell fartkänsla har ökat från tidigare svarsdagar under veckan, samtidigt som kropp och dagskänsla inte är låga. Visar en upplevd riktning, inte att tävlingstider faktiskt förbättrats.' },
  { id: 'heavy', title: 'Tung träningsperiod – trött och långsam', body: 2, feeling: 3, speed: 2, rpe: 7, minutes: 100, previousRpe: 5, previousMinutes: 80, sleepMinutes: 510,
    interpretation: 'Gult/orange hjärta, orange ring, större hjärtgrundstorlek och lugn pulsering. Kroppen är skattad till två och fartkänslan är låg. Detta kan passa en tung träningsperiod utan att ge röd uppföljningssignal i sig. Bekräftar inte nedträning, sjukdom eller överträning.' },
  { id: 'mixed', title: 'Blandade signaler – snabb men tung i kroppen', body: 3, feeling: 4, speed: 4, rpe: 5, minutes: 80, previousRpe: 5, previousMinutes: 80, sleepMinutes: 510,
    interpretation: 'Gult hjärta och blå ring märkt Hög fartkänsla. Simmaren känner fart men kroppen känns inte lika bra. Ingen redo- eller toppningssignal: hög fartkänsla ensam bekräftar inte återhämtning.' },
  { id: 'sleep-warning', title: 'Grönt hjärta – men kort sömn', body: 4, feeling: 4, speed: 4, rpe: 5, minutes: 60, previousRpe: 6, previousMinutes: 90, sleepMinutes: 390,
    interpretation: 'Grönt hjärta men orange ring märkt Återhämtning att följa upp. Tre korta nätter hindrar redo och Turbo trots positiva känslosvar och minskad belastning. Ingen dubbelpuls. Sömnvarningen är samtalsstöd, inte ett individuellt sömnmål.' },
  { id: 'load-only', title: 'Belastning känd – aktuell dagsform oklar', body: 4, feeling: 4, speed: 3, rpe: 5, minutes: 80, previousRpe: 5, previousMinutes: 80, sleepMinutes: 510, moodSparse: true,
    interpretation: 'Grått hjärta men hel petrolring märkt Belastning följs. Belastningsdata är tillräckliga, medan aktuella kropp-, dags- och fartuppgifter inte räcker för ett tydligare läge. Saknad dagsform förväxlas inte med saknad belastning.' },
  { id: 'steady', title: 'Tränar på – inget särskilt mönster', body: 3.5, feeling: 3.5, speed: 3, rpe: 5, minutes: 80, previousRpe: 5, previousMinutes: 80, sleepMinutes: 510,
    interpretation: 'Petrolring och etiketten Tränar på · blandade signaler. Aktuella svar finns utan att de särskilda kraven för tungt, fart eller redo uppfylls. Inget formbesked.' },
  { id: 'missing', title: 'För lite underlag – ingen slutsats', body: 4, feeling: 4, speed: 5, rpe: 5, minutes: 60, previousRpe: 6, previousMinutes: 90, sparse: true,
    interpretation: 'Grått, stilla hjärta och streckad neutral ring. Ett enda aktuellt svar räcker inte för färg eller fartanimation, och föregående belastningsunderlag saknas. Saknade uppgifter är inte noll och är inte ett tecken på bra eller dålig form.' },
]

// Deliberately synthetic after-reports: no API, profile IDs, comments or real records.
export const TRAINING_HEART_EXAMPLES = scenarios.map(example => {
  const dates = example.sparse ? [asOf] : recentDates
  const rows = (days, rpe, minutes) => days.map(date => ({ id: `${example.id}-${date}`, date, createdAt: `${date}T18:00:00Z`, type: 'after', activityType: 'swim', trainingSlot: 'afternoon_swim', body: example.moodSparse && date !== asOf ? null : example.body, feeling: example.moodSparse && date !== asOf ? null : example.feeling, speedFeeling: example.moodSparse && date !== asOf ? null : example.speed, rpe, activityMinutes: minutes }))
  const responses = [...rows(example.sparse ? [] : previousDates, example.previousRpe, example.previousMinutes), ...rows(dates, example.rpe, example.minutes), ...(example.earlierSpeed ? rows(['2026-10-27', '2026-10-28'], example.rpe, example.minutes).map(row => ({ ...row, speedFeeling: example.earlierSpeed })) : [])]
  const sleep = example.sparse ? [] : dates.map(activity_date => ({ activity_date, minutes: example.sleepMinutes, quality: 5 }))
  return { ...example, heart: buildTrainingHeart({ responses, sleep }, asOf) }
})

const number = value => value == null ? 'saknas' : value.toLocaleString('sv-SE', { maximumFractionDigits: 1 })
export function trainingHeartExampleFacts({ heart }) {
  const load = heart.load, previous = load.previous
  return [
    ['Färg', `Kropp ${number(heart.body.value)}/5 och dagskänsla ${number(heart.feeling.value)}/5. ${heart.body.days} respektive ${heart.feeling.days} svarsdagar senaste tre dagarna.`],
    ['Ring', `${heart.readiness.label}. ${heart.readiness.description}`],
    ['Belastning', `${trainingHeartLoadSummary(load).label}. ${number(load.value)} mot ${number(previous.value)} RPE × minuter. ${load.ratio == null ? 'Ingen giltig jämförelse.' : `${number(load.ratio * 100)} % av föregående veckas rapporterade belastning.`} Täckning: ${load.known}/${load.total} respektive ${previous.known}/${previous.total} rapportgrupper med båda uppgifterna; ${load.days} respektive ${previous.days} svarsdagar.`],
    ['Pulsering', `Fartkänsla ${number(heart.speed.value)}/5 från ${heart.speed.days} simdagar senaste sju dagarna. ${heart.readiness.state === 'turbo' ? 'Tydlig dubbelpuls för Turbo (1,3 sekunder per cykel).' : ({ none: 'Stilla: för lite underlag.', slow: 'Lugn takt (3,2 sekunder per cykel).', gentle: 'Mjuk takt (2,6 sekunder per cykel).', brisk: 'Snabbare takt (2 sekunder per cykel).' })[heart.speed.motion]} Detta är inte faktisk puls.`],
    ['Lägets delvärden', heart.readiness.checks.map(check => `${check.label}: ${check.detail}`).join('. ')],
    ['Sömn / sjukdom', `${heart.sleep.nights ? `${number(heart.sleep.averageMinutes / 60)} h i snitt under ${heart.sleep.nights} nätter; alla svar Bra.` : 'Sömnsvar saknas.'} Sjukdom: ${heart.sickDays.length} rapporterade dagar. ${heart.warnings.length ? heart.warnings.join(' · ') + '.' : 'Ingen varningssignal i tillgängliga svar; inget bevis på full återhämtning.'}`],
  ]
}

export const TRAINING_HEART_EXAMPLE_ANSWERS = [
  TRAINING_HEART_EXAMPLE_NOTICE,
  ...TRAINING_HEART_EXAMPLE_INTRO,
  ...TRAINING_HEART_EXAMPLES.map(example => `${example.title}: ${example.interpretation} Fiktiva värden: ${trainingHeartExampleFacts(example).map(([label, value]) => `${label}: ${value}`).join(' ')}`),
]
