import React, { useState } from 'react'
const CHAT_EMOJIS = ['🏊', '💙', '💚', '💛', '❤️', '💪', '👏', '🙌', '😊', '🤩', '🔥', '🌊']
export default function ChatEmojiPicker({ onPick }) {
  const [open, setOpen] = useState(false)
  return <div className="chat-emoji-picker"><button type="button" className="chat-emoji-trigger" aria-label="Välj emoji" aria-expanded={open} onClick={() => setOpen(value => !value)}>😊</button>{open && <div className="chat-emoji-menu">{CHAT_EMOJIS.map(emoji => <button type="button" key={emoji} onClick={() => { onPick(emoji); setOpen(false) }}>{emoji}</button>)}</div>}</div>
}
