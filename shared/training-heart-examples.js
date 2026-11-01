import { buildTrainingHeart } from './training-heart.js'
import { trainingHeartLoadSummary } from './training-heart-load.js'

export const TRAINING_HEART_EXAMPLE_NOTICE = 'Hjärtat visar rapporterade signaler, inte bekräftad toppform. Snabb pulsering betyder hög fartkänsla – inte automatiskt ”redo för tävling”.'
export const TRAINING_HEART_EXAMPLE_INTRO = [
  'Här visas fiktiva exempel, inte någon simmares uppgifter. Samma hjärta och beräkningsregler används som på simmarkortet. Exemplen står stilla från början; välj Visa pulsering för att jämföra takterna. Minskad rörelse i enhetens inställningar gäller även här.',
  'Stark, snabb och återhämtad inför ett mästerskap är ett möjligt positivt mönster, inte något hjärtat kan bekräfta. Det mäter inte toppform eller tävlingsberedskap. Måltävling, toppningsperiod, träningsfas, testlopp och tävlingsresultat ingår inte i hjärtats nuvarande beräkning. Bedöm sammanhanget tillsammans med tränaren.',
  'Färg = kropp och dagskänsla senaste tre dagarna. Ring = rapporterad RPE × tid senaste sju mot föregående sju dagar. Tid är rapporterad i dessa exempel; om entydigt kopplad plantid används som uppskattning i stället märks jämförelsen ≈ Belastning/Uppskattad belastning, med delarna separat i förklaringen. Ringen står stilla. Etiketten Belastning visar förändringen med pil och procent: 75 % av tidigare belastning visas som ↓ 25 %, inte ↓ 75 %. ↑ betyder mer och ↓ mindre belastning i underlaget, inte bättre eller sämre. ≈ Oförändrad betyder samma belastning avrundat till en decimal; annars visas även små förändringar. Vid otillräckligt underlag visas Jämförelse saknas, aldrig en gissad nolla. Pulsering = upplevd simfart senaste sju dagarna, med krav på aktuella svar. Sömn och sjukdom visas som separata varningar, inte som hjärtats färg eller takt. Alltså: grön färg betyder inte automatiskt återhämtad.',
]

const asOf = '2026-11-01'
const previousDates = ['2026-10-23', '2026-10-24', '2026-10-25']
const recentDates = ['2026-10-30', '2026-10-31', asOf]
const scenarios = [
  { id: 'competition', title: 'Inför mästerskap – positiva signaler', body: 4, feeling: 4, speed: 5, rpe: 5, minutes: 60, previousRpe: 6, previousMinutes: 90, sleepMinutes: 540,
    interpretation: 'Grönt hjärta, mindre ring och snabbare symbolisk pulsering. I ett planerat toppningssammanhang kan detta vara positiva tecken: mindre rapporterad belastning och god kropp-, dags- och fartkänsla. Sömn är rapporterad som Bra utan befintlig varningssignal. Detta är inte ett besked att toppformen är funnen eller att simmaren är redo för mästerskapet.' },
  { id: 'heavy', title: 'Tung träningsperiod – trött och långsam', body: 2, feeling: 3, speed: 2, rpe: 7, minutes: 100, previousRpe: 5, previousMinutes: 80, sleepMinutes: 510,
    interpretation: 'Rött hjärta, större ring och lugn pulsering. Det kan stämma med upplevd trötthet i en tung träningsperiod, men hjärtat kan inte avgöra om simmaren är nedtränad, övertränad eller om belastningen är lämplig. Stäm av mot planen och hur simmaren upplever träningen; rött är inte en diagnos.' },
  { id: 'mixed', title: 'Blandade signaler – snabb men tung i kroppen', body: 3, feeling: 4, speed: 4, rpe: 5, minutes: 80, previousRpe: 5, previousMinutes: 80, sleepMinutes: 510,
    interpretation: 'Gult hjärta, oförändrad ring och snabbare pulsering. Simmaren känner fart men kroppen känns inte lika bra. Den snabba pulseringen gör inte hjärtat grönt och bekräftar inte återhämtning. De olika signalerna ska få synas var för sig.' },
  { id: 'sleep-warning', title: 'Grönt hjärta – men kort sömn', body: 4, feeling: 4, speed: 4, rpe: 5, minutes: 60, previousRpe: 6, previousMinutes: 90, sleepMinutes: 390,
    interpretation: 'Grönt hjärta och snabbare pulsering, men en separat varningssymbol för tre korta nätter. Den goda kropp- och dagskänslan tar inte bort sömnsignalen. Varken grön färg eller minskad belastning är bevis på full återhämtning. Sömnvarningen använder produktregler för samtalsstöd, inte ett individuellt sömnmål.' },
  { id: 'missing', title: 'För lite underlag – ingen slutsats', body: 4, feeling: 4, speed: 5, rpe: 5, minutes: 60, previousRpe: 6, previousMinutes: 90, sparse: true,
    interpretation: 'Grått, stilla hjärta och streckad neutral ring. Ett enda aktuellt svar räcker inte för färg eller fartanimation, och föregående belastningsunderlag saknas. Saknade uppgifter är inte noll och är inte ett tecken på bra eller dålig form.' },
]

// Deliberately synthetic after-reports: no API, profile IDs, comments or real records.
export const TRAINING_HEART_EXAMPLES = scenarios.map(example => {
  const dates = example.sparse ? [asOf] : recentDates
  const rows = (days, rpe, minutes) => days.map(date => ({ id: `${example.id}-${date}`, date, createdAt: `${date}T18:00:00Z`, type: 'after', activityType: 'swim', trainingSlot: 'afternoon', body: example.body, feeling: example.feeling, speedFeeling: example.speed, rpe, activityMinutes: minutes }))
  const responses = [...rows(example.sparse ? [] : previousDates, example.previousRpe, example.previousMinutes), ...rows(dates, example.rpe, example.minutes)]
  const sleep = example.sparse ? [] : dates.map(activity_date => ({ activity_date, minutes: example.sleepMinutes, quality: 5 }))
  return { ...example, heart: buildTrainingHeart({ responses, sleep }, asOf) }
})

const number = value => value == null ? 'saknas' : value.toLocaleString('sv-SE', { maximumFractionDigits: 1 })
export function trainingHeartExampleFacts({ heart }) {
  const load = heart.load, previous = load.previous
  return [
    ['Färg', `Kropp ${number(heart.body.value)}/5 och dagskänsla ${number(heart.feeling.value)}/5. ${heart.body.days} respektive ${heart.feeling.days} svarsdagar senaste tre dagarna.`],
    ['Ring', `${trainingHeartLoadSummary(load).label}. ${number(load.value)} mot ${number(previous.value)} RPE × minuter. ${load.ratio == null ? 'Ingen giltig jämförelse.' : `${number(load.ratio * 100)} % av föregående veckas rapporterade belastning.`} Täckning: ${load.known}/${load.total} respektive ${previous.known}/${previous.total} rapportgrupper med båda uppgifterna; ${load.days} respektive ${previous.days} svarsdagar.`],
    ['Pulsering', `Fartkänsla ${number(heart.speed.value)}/5 från ${heart.speed.days} simdagar senaste sju dagarna. ${({ none: 'Stilla: för lite underlag.', slow: 'Lugn takt (3,2 sekunder per cykel).', gentle: 'Mjuk takt (2,6 sekunder per cykel).', brisk: 'Snabbare takt (2 sekunder per cykel).' })[heart.speed.motion]} Detta är inte faktisk puls.`],
    ['Sömn / sjukdom', `${heart.sleep.nights ? `${number(heart.sleep.averageMinutes / 60)} h i snitt under ${heart.sleep.nights} nätter; alla svar Bra.` : 'Sömnsvar saknas.'} Sjukdom: ${heart.sickDays.length} rapporterade dagar. ${heart.warnings.length ? heart.warnings.join(' · ') + '.' : 'Ingen varningssignal i tillgängliga svar; inget bevis på full återhämtning.'}`],
  ]
}

export const TRAINING_HEART_EXAMPLE_ANSWERS = [
  TRAINING_HEART_EXAMPLE_NOTICE,
  ...TRAINING_HEART_EXAMPLE_INTRO,
  ...TRAINING_HEART_EXAMPLES.map(example => `${example.title}: ${example.interpretation} Fiktiva värden: ${trainingHeartExampleFacts(example).map(([label, value]) => `${label}: ${value}`).join(' ')}`),
]
