export const emptyRewardSelection = () => ({ backgroundId: null, emblemId: null })
export const sameRewardSelection = (a, b) => a?.backgroundId === b?.backgroundId && a?.emblemId === b?.emblemId
export const savedRewardCombination = (cards, name, selection) => cards.some(card => card.compatible && card.name === name.trim() && sameRewardSelection(card, selection))
export function usableRewardSelection(assets, value) {
  const valid = new Map(assets.filter(asset => asset.compatible).map(asset => [asset.id, asset.kind]))
  return { backgroundId: valid.get(value?.backgroundId) === 'background' ? value.backgroundId : null, emblemId: valid.get(value?.emblemId) === 'emblem' ? value.emblemId : null }
}
export function rewardSelectionArtwork(assets, selection) {
  const valid = usableRewardSelection(assets, selection)
  return { backgroundUrl: assets.find(asset => asset.id === valid.backgroundId)?.url || null, emblemUrl: assets.find(asset => asset.id === valid.emblemId)?.url || null }
}
