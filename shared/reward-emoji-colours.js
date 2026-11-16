// Controlled colour hints for common level symbols. Unknown emoji keep their
// own visible palette; never derive a colour from the level's editable name.
const palettes = {
  red:{ label:'Röd', colours:['#b81b32','#ec3348'], instruction:'The main symbol must remain recognisably RED: saturated ruby/crimson red across its dominant surfaces. Use deeper shades of the same red for shadows and restrained neutral highlights.' },
  blue:{ label:'Blå', colours:['#1e74c4','#92dcfa'], instruction:'Preserve the original blue/cyan body colour and pale neutral highlights. The main symbol must remain recognisably blue.' },
  purple:{ label:'Lila', colours:['#7641ad','#c780de'], instruction:'Keep the main purple/violet crystal or body purple. Preserve any original gold base and neutral highlights as secondary details.' },
  gold:{ label:'Guld', colours:['#b78125','#f3d269'], instruction:'Keep the main symbol gold/yellow and preserve its original secondary details, including any medal ribbon colours.' },
  silver:{ label:'Silver', colours:['#8c969d','#e6ebef'], instruction:'Keep the main symbol neutral silver/grey and preserve original secondary details, including any medal ribbon colours.' },
  bronze:{ label:'Brons', colours:['#995222','#d38d48'], instruction:'Keep the main symbol warm bronze/copper-brown and preserve original secondary details, including any medal ribbon colours.' },
  orange:{ label:'Orange', colours:['#e77b22','#ffc14f'], instruction:'Preserve the main orange body colour; keep it recognisably orange, with darker orange shadows and restrained neutral highlights.' },
  green:{ label:'Grön', colours:['#26864d','#8bd176'], instruction:'Preserve the original green body colour and its secondary details; keep the main symbol recognisably green.' },
  dark:{ label:'Svart / grå', colours:['#33383c','#747c80'], instruction:'Keep the main symbol charcoal, black and natural grey. Do not recolour its dominant surfaces with a coloured style tint.' },
  fire:{ label:'Eldens originalfärger', colours:['#d74029','#f6a938','#ffe07a'], instruction:'Preserve the original red, orange and yellow flame colours and their distribution. Keep any original neutral character details.' },
}
const groups = {
  red:['♦','🔴','❤️','❤','🟥'], blue:['💎','🔷','🔹','💠','💙','🩵','🔵','🟦'], purple:['🔮','💜','🟣','🟪'],
  gold:['🥇','🏅','🏆','👑','⭐','🌟','💛','🟡','🟨'], silver:['🥈'], bronze:['🥉'],
  orange:['🔶','🔸','🟠','🧡','🟧'], green:['💚','🟢','🟩','🍀'], dark:['🪨','🖤','⚫','⬛'], fire:['🔥','🐦‍🔥','🐦🔥'],
}
const paletteByEmoji = new Map(Object.entries(groups).flatMap(([id,emoji]) => emoji.map(value => [value.replace(/[\uFE0E\uFE0F]/g,''),palettes[id]])))
const original = {label:'Emojins egna färger',colours:[],instruction:'Preserve the recognisable original colours of the reference emoji, including its main body and secondary parts. Do not replace its palette with the style palette.'}
export function rewardEmojiColours(emoji) {
  return paletteByEmoji.get(typeof emoji === 'string' ? emoji.trim().replace(/[\uFE0E\uFE0F]/g,'') : '') || original
}
