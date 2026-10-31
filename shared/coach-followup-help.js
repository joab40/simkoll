const distinctDays = 'Signalen visas vid minst ett sådant svar på minst två olika aktivitetsdagar i den angivna sjudagarsperioden. Flera svar samma dag räknas som en dag; siffran i raden är antal dagar, inte antal svar eller ett medelvärde. Saknade svar räknas inte som låga.'

export function coachFollowUpHelp(reason) {
  if (reason.startsWith('Låg kroppskänsla ')) return {
    title: 'Kroppskänsla – hur kroppen upplevs fysiskt',
    description: 'Bygger på frågan ”Hur känns kroppen?” eller ”Hur känns kroppen nu?”: 1 = tung eller öm, 5 = pigg och fräsch. 1–2 av 5 räknas som lågt. Vid styrketräning gäller frågan ”Hur kändes kroppen på gymmet idag?”; Kraftlös = 1 och Seg = 2. Vid sjukdom gäller hur hängig kroppen känns.',
    rule: distinctDays,
  }
  if (reason.startsWith('Låg känsla ')) return {
    title: 'Allmän känsla – hur dagen känns överlag',
    description: 'Bygger på första frågan ”Hur känns det idag?” (vid efterregistrering ”Hur mådde du igår?”). Skalan är 1 = Tungt, 2 = Segt, 3 = Okej, 4 = Bra, 5 = Toppen. 1–2 av 5 räknas som lågt. Detta är den allmänna dagskänslan, inte den separata frågan om kroppen.',
    rule: distinctDays,
  }
  if (reason.startsWith('Hög ansträngning ')) return {
    title: 'Hög upplevd ansträngning – RPE',
    description: 'Bygger på ”Hur jobbigt var passet?” efter träningen. RPE 8–10 av 10 räknas som högt. Det är simmarens egen upplevelse av ansträngningen, inte i sig ett tecken på att något är fel.',
    rule: distinctDays.replace('Saknade svar räknas inte som låga.', 'Saknade svar räknas inte som höga.'),
  }
  if (reason.startsWith('Sjukfrånvaro rapporterad ')) return {
    title: 'Rapporterad sjukfrånvaro',
    description: 'Simmaren har valt sjukdom i sin incheckning på minst två olika aktivitetsdagar under perioden. Flera svar samma dag räknas som en sjukdag. Det är rapporterade dagar, inte en diagnos och inte ett antal missade pass.',
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
