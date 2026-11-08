// Deliberate pastel tones, not emoji pixels (which vary between iOS/Android).
// Only controlled colour values reach CSS; custom names/emoji never become CSS.
export const REWARD_LEVEL_TONES = Object.freeze({
  bronze: { start:'#f6e5d5', end:'#fffaf5', glow:'#efd1ad', border:'#dfbf9f', track:'#e5ccb2' },
  silver: { start:'#e5ebf1', end:'#fbfcfe', glow:'#d5dee8', border:'#bdcbd6', track:'#cad6e1' },
  gold: { start:'#fff0c9', end:'#fffdf4', glow:'#f7dea0', border:'#e4cc8f', track:'#eddaa8' },
  diamond: { start:'#ddf2fb', end:'#f8fdff', glow:'#bbe4f4', border:'#a9d1e1', track:'#c2dfed' },
  green: { start:'#e1f2e6', end:'#f9fdf7', glow:'#c4e5c9', border:'#acd1b6', track:'#c3ddc9' },
  rose: { start:'#f9e5ed', end:'#fff9fb', glow:'#efcbdc', border:'#dfb8ca', track:'#ecc9d8' },
  purple: { start:'#ece6f8', end:'#fcfaff', glow:'#d9cef0', border:'#c7b9df', track:'#d8cdea' },
  neutral: { start:'#e6f4ee', end:'#f8fbf3', glow:'#dceee4', border:'#c4dcd1', track:'#c8ddd7' },
})
const emojiTones = new Map([
  ...['🥉','🟠','🧡'].map(emoji=>[emoji,'bronze']),
  ...['🥈','⚪','🤍','🩶'].map(emoji=>[emoji,'silver']),
  ...['🥇','🏅','🏆','👑','⭐','🌟','💛','🟡'].map(emoji=>[emoji,'gold']),
  ...['💎','💙','🩵','🔵','🐬','🐳','🧊'].map(emoji=>[emoji,'diamond']),
  ...['💚','🟢','🍀','🐢'].map(emoji=>[emoji,'green']),
  ...['🩷','💕','🌸'].map(emoji=>[emoji,'rose']),
  ...['💜','🟣','🔮'].map(emoji=>[emoji,'purple']),
])
export function rewardLevelTheme(emoji) {
  const normalized = typeof emoji === 'string' ? emoji.trim().replace(/[\uFE0E\uFE0F]/g,'') : ''
  const tone = emojiTones.get(normalized) || 'neutral', palette = REWARD_LEVEL_TONES[tone]
  return { tone, style:Object.fromEntries(Object.entries(palette).map(([key,value])=>[`--level-${key}`,value])) }
}
