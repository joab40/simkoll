import { HEAVY_PATTERN_RULE } from './heavy-training-pattern.js'
const distinctDays = `Minst ett sådant svar gör att aktivitetsdagen räknas en gång; det är antal dagar, inte antal svar eller ett medelvärde. ${HEAVY_PATTERN_RULE}`

export function coachFollowUpHelp(reason) {
  if (/^(Känner sig sjuk|Lite sjukdomskänningar|Sjukdomskänningar rapporterade)/.test(reason)) return {
    title: 'Simmarens egen sjukdomskänsla',
    description: 'Separat frivillig dagsfråga, även efter genomförd träning. Känner sig sjuk idag/igår ger rött direkt. Lite känningar ger gult; minst tre sådana dagar på en vecka med ett aktuellt svar idag/igår ger rött. Datumet visar när svaret gällde, inte en diagnos eller en säker aktuell sjukdom. Ett nyare Nej avslutar markeringen av äldre känningar som aktuella, men raderar inte historiken.',
    rule: 'Ingen RPE eller belastningsnivå krävs för att visa ett direkt sjukdomssvar. Saknat eller överhoppat svar betyder inte frisk. Prata med simmaren; Simkoll förutsäger inte sjukdom.',
  }
  if (reason.startsWith('Tung kropp ') || reason.startsWith('Låg kroppskänsla ')) return {
    title: 'Kroppskänsla – hur kroppen upplevs fysiskt',
    description: 'Bygger på ”Hur känns kroppen?” eller ”Hur känns kroppen nu?”: 1 = tung eller öm, 5 = pigg och fräsch. Bara ettan räknas som tung uppföljningssignal; 2 = segt är tillåtet utan varning i sig. Vid gymträning gäller Kraftlös = 1 och Seg = 2. Vid sjukdom gäller hur hängig kroppen känns. Trötthet i sig är inte sjukdom.',
    rule: distinctDays,
  }
  if (reason.startsWith('Tung dagskänsla ') || reason.startsWith('Låg känsla ')) return {
    title: 'Allmän känsla – hur dagen känns överlag',
    description: 'Bygger på ”Hur känns det idag?” (vid efterregistrering ”Hur mådde du igår?”). 1 = Tungt, 2 = Segt, 3 = Okej, 4 = Bra, 5 = Toppen. Bara ettan räknas som tung uppföljningssignal; tvåan ger ingen varning i sig. Detta är allmänna dagskänslan, inte den separata frågan om kroppen.',
    rule: distinctDays,
  }
  if (reason.startsWith('Hög ansträngning ')) return {
    title: 'Hög upplevd ansträngning – RPE',
    description: 'Bygger på ”Hur jobbigt var passet?” efter träningen. RPE 8–10 av 10 räknas som högt. Det är simmarens egen upplevelse av ansträngningen, inte i sig ett tecken på att något är fel.',
    rule: 'Minst två olika dagar med RPE 8–10 under sju dagar ger gult, inte rött i sig. Flera svar samma dag räknas en gång. Saknade svar räknas inte som höga.',
  }
  if (reason.startsWith('Sjukfrånvaro rapporterad ')) return {
    title: 'Rapporterad sjukfrånvaro',
    description: 'Simmaren har valt sjukdom i sin incheckning. Sjuk idag eller igår ger rött direkt; äldre sjukdagar under veckan visas gult utan att antas vara pågående sjukdom. Flera svar samma dag räknas som en sjukdag. Det är rapporterade dagar, inte en diagnos och inte ett antal missade pass.',
  }
  if (reason.startsWith('Dålig sömn rapporterad ')) return {
    title: 'Upplevd sömnkvalitet',
    description: 'Minst två nätter med valet Dålig i Sömnkoll under perioden. Detta gäller hur sömnen upplevdes, inte antalet sovtimmar. Varje natt räknas en gång; saknade eller överhoppade svar ingår inte.',
  }
  if (reason.startsWith('Kort sovtid senaste 3 nätterna')) return {
    title: 'Kort sovtid – senaste tre rapporterade nätterna',
    description: 'De senaste tre giltiga, rapporterade nätterna inom sju dagar har alla högst 7 timmars sömn. Snittet gäller dessa tre nätter. Nätterna behöver inte vara tre på varandra följande kalendernätter. Saknade eller överhoppade svar räknas inte som noll.',
    rule: 'En gul/orange uppföljningssignal. 7 timmar är en produktregel för dialog, inte ett rekommenderat sömnmål eller en medicinsk gräns.',
  }
  if (/^Kort sovtid \d+ nätter/.test(reason)) return {
    title: 'Kort sovtid – flera nätter under veckan',
    description: 'Minst fem rapporterade nätter inom sju dagar har högst 7 timmars sömn. Snittet gäller bara de korta nätterna som anges i raden. En längre natt väger inte bort dem; saknade eller överhoppade svar räknas inte som noll.',
    rule: 'En röd uppföljningssignal. 7 timmar är en produktregel för dialog, inte ett rekommenderat sömnmål eller en medicinsk gräns.',
  }
  if (reason.startsWith('Kort sovtid i snitt ')) return {
    title: 'Kort rapporterad sovtid i genomsnitt',
    description: 'Minst tre rapporterade nätter under perioden har i genomsnitt mindre än 7 timmars sömn. Genomsnittet gäller rapporterade nätter, inte saknade svar. En längre natt kan påverka snittet; separata regler fångar återkommande korta nätter.',
    rule: 'Underlag för dialog, inte ett rekommenderat sömnmål eller en medicinsk bedömning.',
  }
  return null
}
