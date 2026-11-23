export const FLIGHT_BUILDINGS = Object.freeze({
  regional: { label: 'Regionhus', image: '/assets/flight-record-palace.png', aspect: 1 },
  'regional-final': { label: 'Regionfinalpalats', image: '/assets/flight-record-palace-regional-final.png', aspect: 1.8 },
  championship: { label: 'Mästerskapspalats', image: '/assets/flight-record-palace-championship.png', aspect: 2 },
  norrland: { label: 'Norrlandspalatset', image: '/assets/flight-record-palace-norrland.png', aspect: 2 },
})

const championshipName = /mästerskap|(?<![\p{L}\p{N}])(?:usm|jsm|sum[- ]?sim|sm|jdm|dm|nm|em|vm|os)(?![\p{L}\p{N}])/iu
const regionalName = /(?<![\p{L}\p{N}])region(?:en|al[at]?|s?(?:tävling|kval|mästerskap)(?:en|et)?)?(?![\p{L}\p{N}])/iu

const regionalFinalName = /(?<![\p{L}\p{N}])regions?[\s-]*final(?:en|er(?:na)?)?(?![\p{L}\p{N}])/iu

export const isFlightBuilding = key => typeof key === 'string' && Object.hasOwn(FLIGHT_BUILDINGS, key)

export function competitionBuilding({ title, category, flightBuilding }) {
  if (isFlightBuilding(flightBuilding)) return flightBuilding
  const label = `${category ?? ''} ${title ?? ''}`.normalize('NFC')
  if (regionalFinalName.test(label)) return 'regional-final'
  if (/norrlands[\s-]*mästerskap/iu.test(label)) return 'norrland'
  return championshipName.test(label) && !regionalName.test(label) ? 'championship' : 'regional'
}
