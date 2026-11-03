// Transparent product rules for conversation support, not a validated form,
// recovery or competition-readiness model. Never prescribe training from this.
import { HEAVY_PATTERN_RULE } from './heavy-training-pattern.js'

export const TRAINING_STATES = {
  turbo: { label: 'Turbo · toppningssignal', description: 'Mycket god kropp-, dags- och fartkänsla, positivt sömnunderlag och minskad belastning sammanfaller. Ett mönster att stämma av inför tävling, inte bekräftad toppform.' },
  ready: { label: 'Utvilad och redo · signal', description: 'God kropp-, dags- och fartkänsla sammanfaller med positivt sömnunderlag. Utvilad är en tolkning av dessa svar, inte en direkt fråga om återhämtning eller ett klartecken för tävling.' },
  rising: { label: 'På väg mot fart', description: 'Fartkänslan har ökat mellan två delar av senaste veckan, samtidigt som aktuella kropp- och dagssvar inte är låga. Detta är upplevd fart, inte uppmätt förbättring.' },
  fast: { label: 'Hög fartkänsla', description: 'Simmaren rapporterar hög aktuell fartkänsla. Övriga signaler räcker inte tillsammans för ett redo- eller toppningsläge.' },
  heavy: { label: 'Tung i träningen', description: 'Upprepad låg kroppkänsla, eller tung kropp tillsammans med låg fartkänsla. Kan passa en tung träningsperiod, men bekräftar inte nedträning eller överträning.' },
  watch: { label: 'Återhämtning att följa upp', description: 'Sömn eller rapporterad sjukdom behöver uppmärksammas. God fart eller kroppkänsla får inte dölja signalen.' },
  steady: { label: 'Tränar på · blandade signaler', description: 'Aktuella kropp- och dagssvar finns, men inget tydligt tungt, stigande, snabbt eller redo-mönster uppfylls.' },
  'load-only': { label: 'Belastning följs', description: 'Belastningen går att jämföra, men tillräckliga aktuella dagsforms- eller fartuppgifter saknas. Belastningsdata är inte samma sak som formdata.' },
  unknown: { label: 'Mer aktuellt underlag behövs', description: 'Underlaget räcker inte för ett träningsläge. Saknade eller gamla svar betyder varken bra eller dålig form.' },
}

export const TRAINING_STATE_RULES = [
  HEAVY_PATTERN_RULE,
  'Sjukdomskollen är separat från träningen. Senaste giltiga dagsvar idag/igår med Lite känningar eller Jag känner mig sjuk ger uppföljningsläge före positiva träningslägen, oavsett RPE eller belastning. Ett nyare Nej gör inte äldre känningar aktuella; saknade eller överhoppade svar betyder inte frisk. Äldre sjukfrånvaro under veckan visas fortsatt som separat varning. Ingen sjukdomsrisk räknas fram.',
  'Alla lägen är rapporterade signaler och produktregler för samtal, inte en validerad formbedömning. Ingen måltävling, träningsfas, direkt återhämtningsfråga, testlopps- eller tävlingsresultat används. Ingen AI körs och träningen ändras inte.',
  'Aktuellt betyder senaste tre kalenderdagarna till och med valt datum. Kropp, dagskänsla och aktuell simfartkänsla behöver vardera minst två olika svarsdagar för redo/toppningssignal. Varje dags medelvärde väger lika; värdena avrundas till en decimal. Gymmets kraftsvar blir aldrig simfart och tävlingssvar blir inte simfart i denna beräkning.',
  'Positivt sömnunderlag kräver minst två giltiga nätter under de senaste tre dagarna, minst 8 timmar varje sådan natt, inget Dålig-svar och sömnkvalitet minst 4 av 5 i snitt (Dålig=1, Okej=3, Bra=5). Detta är en försiktig produktregel för ungdoms-/juniormiljön, inte ett individuellt sömnmål. Längre sömn är inte i sig bevis på återhämtning. Saknad sömn räknas inte som utvilad.',
  'Turbo · toppningssignal kräver aktuell kropp och dagskänsla minst 4,5/5, aktuell simfartkänsla minst 4,5/5, positivt sömnunderlag, inga sömn-/sjukdomsvarningar och minst 10 % lägre jämförbar sjudagarsbelastning. Belastning bygger på RPE × egen tid eller säkert kopplad planerad tid; samma tidigare krav på minst tre kompletta rapporter, två dagar och 80 % täckning i båda veckorna gäller. Minskad belastning ensam ger aldrig Turbo.',
  'Utvilad och redo · signal kräver aktuell kropp och dagskänsla minst 4/5, aktuell simfartkänsla minst 3,5/5, positivt sömnunderlag och inga varningar. Om belastningsjämförelsen saknas eller inte minskat kan detta läge ändå visas, men inte Turbo. Låg RPE i sig betyder inte återhämtad.',
  'På väg mot fart kräver minst två olika simfartdagar i vardera delen: senaste tre dagar mot de fyra dagarna dessförinnan. Aktuellt snitt är minst 3/5 och minst 0,5 högre; aktuella kropp- och dagssnitt är minst 3/5 med minst två dagar vardera. Hög fartkänsla kräver minst 4/5 på minst två av de senaste tre dagarna, men bekräftar inte faktisk snabbhet.',
  'Tung i träningen kräver minst två aktuella kroppssvarsdagar och kropp högst 2,5/5, alternativt kropp högst 3/5 tillsammans med aktuell simfartkänsla högst 2,5/5 på två dagar. Hög belastning ensam är inte nedträning. Sömn-/sjukdomsvarningar prioriteras före samtliga positiva lägen. Låga aktuella kropp- eller dagssvar hindrar ett positivt fartläge även när andra svar saknas.',
  'Ringens färg och text visar träningsläget: guld/grönt för Turbo, grönt för redo-signal, petrol/blått för fart, orange för tungt/uppföljning och grått/streckat när läget saknar underlag. Hjärtats grundstorlek visar jämförbar belastning: mindre under 80 %, större över 120 %, annars normal; utan jämförelse normal storlek utan belastningsslutsats. Kropp-/dagskänsla styr hjärtats färg som tidigare. Vanlig puls följer fartkänslan; Turbo får en tydlig dubbelpuls. Ringen roterar aldrig. Procent och källor visas i förklaringen. Minskad rörelse eller avstängda animationer stoppar all pulsering; etikett och ring fungerar ändå.',
]

const known = metric => metric?.days >= 2 && Number.isFinite(metric.value)
const value = metric => metric?.value == null ? 'saknas' : `${metric.value.toLocaleString('sv-SE')}/5 · ${metric.days} dagar`
const check = (key, label, ok, detail) => ({ key, label, ok, detail })

export function trainingHeartState({ body, feeling, speed, earlierSpeed, load, nights = [], warnings = [] }) {
  const bodyKnown = known(body), feelingKnown = known(feeling), speedKnown = known(speed)
  const sleepQuality = nights.length ? nights.reduce((sum, night) => sum + night.quality, 0) / nights.length : null
  const sleepOk = nights.length >= 2 && nights.every(night => night.minutes >= 480 && night.quality >= 3) && sleepQuality >= 4
  const rested = bodyKnown && feelingKnown && body.value >= 4 && feeling.value >= 4 && sleepOk
  const reduced = Number.isFinite(load?.ratio) && load.ratio > 0 && load.ratio <= .9
  const falling = (body?.days > 0 && body.value <= 2.5) || (feeling?.days > 0 && feeling.value <= 2.5)
  const heavy = bodyKnown && (body.value <= 2.5 || (body.value <= 3 && speedKnown && speed.value <= 2.5))
  const rising = bodyKnown && feelingKnown && body.value >= 3 && feeling.value >= 3 && speedKnown && known(earlierSpeed) && speed.value >= 3 && Math.round((speed.value - earlierSpeed.value) * 10) >= 5
  let state = 'unknown'
  if (warnings.length) state = 'watch'
  else if (heavy) state = 'heavy'
  else if (rested && speedKnown && speed.value >= 4.5 && body.value >= 4.5 && feeling.value >= 4.5 && reduced) state = 'turbo'
  else if (rested && speedKnown && speed.value >= 3.5) state = 'ready'
  else if (rising) state = 'rising'
  else if (speedKnown && speed.value >= 4 && !falling) state = 'fast'
  else if (bodyKnown && feelingKnown) state = 'steady'
  else if (Number.isFinite(load?.ratio)) state = 'load-only'
  return { state, ...TRAINING_STATES[state], checks: [
    check('body', 'Aktuell kroppkänsla', bodyKnown && body.value >= 4, value(body)),
    check('feeling', 'Aktuell dagskänsla', feelingKnown && feeling.value >= 4, value(feeling)),
    check('speed', 'Aktuell simfartkänsla', speedKnown && speed.value >= 3.5, value(speed)),
    check('earlier-speed', 'Tidigare simfartkänsla', known(earlierSpeed), value(earlierSpeed)),
    check('sleep', 'Aktuellt sömnunderlag', sleepOk, nights.length ? `${nights.length} nätter · ${Math.round(nights.reduce((sum, night) => sum + night.minutes, 0) / nights.length)} min i snitt · kvalitet ${sleepQuality.toLocaleString('sv-SE', { maximumFractionDigits: 1 })}/5` : 'Saknas – utvilad antas inte'),
    check('load', 'Minskad jämförbar belastning', reduced, Number.isFinite(load?.ratio) ? `${(Math.round(load.ratio * 1000) / 10).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} % av föregående vecka${load.estimated || load.previous?.estimated ? ' · innehåller planerad tid' : ''}` : 'Jämförelse saknas – ingen toppningssignal antas'),
    check('warnings', 'Sömn-/sjukdomssignaler', warnings.length === 0, warnings.length ? warnings.join(' · ') : 'Ingen signal i tillgängliga svar; inte bevis på full återhämtning'),
  ] }
}
