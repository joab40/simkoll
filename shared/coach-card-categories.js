export const DEFAULT_COACH_CATEGORY = 'bas'
export const COACH_CATEGORY_LABELS = Object.freeze({ bas: 'Bas', pro: 'Pro', exp: 'Exp' })
const CATEGORY_RANK = Object.keys(COACH_CATEGORY_LABELS)

export const COACH_CARD_LABELS = Object.freeze({
  'competition-day': 'Dagens tävling',
  'today-workouts': 'Pass och inriktning',
  'today-planning': 'Ska träna idag',
  'today-completed': 'Har tränat idag',
  'today-other': 'Tävling, vila eller annan aktivitet',
  'today-unreported': 'Ingen incheckning idag',
  attendance: 'Närvaro under simpass',
  'lane-usage': 'Banfördelning klubbar',
  'activity-summary': 'Aktivitetssammanfattning',
  'checkin-feeling': 'Gruppens känsla',
  'checkin-rpe': 'Upplevd ansträngning från incheckningar',
  'checkin-pass': 'Passbetyg',
  'checkin-setup': 'Uppläggsbetyg',
  'week-days': 'Veckans dagar',
  'feeling-distribution': 'Så känns det i gruppen',
  'anonymous-comments': 'Anonyma kommentarer',
  'coach-week': 'Veckomatrisen',
  'reported-workouts': 'Rapporterade träningspass',
  'reported-rpe': 'Upplevd ansträngning för veckan',
  'training-load': 'Beräknad träningsbelastning',
  'weekly-illness': 'Rapporterad sjukdom för veckan',
  'weekly-symptoms': 'Lite känningar för veckan',
  'weekly-sleep': 'Sömnkoll för veckan',
  'follow-up-dialog': 'Ta en dialog',
  'follow-up-watch': 'Bevaka utvecklingen',
  'weekly-roster': 'Hela gruppens översikt',
  'group-flight': 'Flight Record för gruppen',
  'group-analysis': 'Grupptrend',
  'planning-week-types': 'Veckotyp',
  'planned-meters': 'Veckans planerade simmetrar',
  'planned-minutes': 'Veckans planerade minuter',
  'planned-activities': 'Veckans planerade aktiviteter',
  'today-illness': 'Rapporterad sjukdom idag',
  'today-symptoms': 'Lite känningar idag',
  'swimmer-traffic': 'Trafikljus för simmarlistan',
  'swimmer-comment': 'Simmarens kommentar idag',
  'swimmer-training-goals': 'Simmarens träningsmål',
  'swimmer-week': 'Simmarens veckoplanering',
  'swimmer-flight': 'Simmarens Flight Record',
  'swimmer-times': 'Träningstider och testlopp',
  'swimmer-trend': 'Simmarens riktning',
  'swimmer-form': 'Formkollen',
  'swimmer-taper': 'Toppningskollen',
  'swimmer-periodization': 'Simmarens träningsperioder',
  'swimmer-agreement': 'Simmarens överenskommelse',
  'swimmer-development-goals': 'Utvecklingsmål',
  'swimmer-strength': 'Styrkeprogram',
  'swimmer-dryland': 'Landträning',
  'swimmer-sleep': 'Simmarens sömnhistorik',
  'swimmer-illness': 'Simmarens sjukdomshistorik',
  'swimmer-stats': 'Simmarens svarsstatistik',
  'swimmer-notes': 'Tränaranteckningar',
  'swimmer-recent': 'Simmarens senaste svar',
  'swimmer-artifacts': 'Simmarens artefakter',
  'swimmer-game-beta': 'Speltest för simmaren',
})

export const isCoachCategory = (value) => typeof value === 'string' && Object.hasOwn(COACH_CATEGORY_LABELS, value)
export const isCoachCard = (value) => typeof value === 'string' && Object.hasOwn(COACH_CARD_LABELS, value)
export const coachCategory = (value) => isCoachCategory(value) ? value : DEFAULT_COACH_CATEGORY

export function canSeeCoachCard(viewCategory, cardCategory) {
  return CATEGORY_RANK.indexOf(coachCategory(viewCategory)) >= CATEGORY_RANK.indexOf(coachCategory(cardCategory))
}
