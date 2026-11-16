import { useEffect, useRef, useState } from 'react'

// Keep one in-flight attempt and reuse its ID after an uncertain response.
// Extra taps still animate, but cannot queue a backlog of point requests.
export function useRewardEmblemTap(onTap, bonus) {
  const [burst, setBurst] = useState(0)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const busy = useRef(false), pendingId = useRef(null), timer = useRef(null), mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; clearTimeout(timer.current) } }, [])
  const tap = async () => {
    setBurst(value => value + 1)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setBurst(0), 850)
    if (!onTap || bonus?.available !== true || busy.current) return
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date())
    if (!pendingId.current && bonus.date === today && bonus.used >= bonus.limit) {
      setMessage('Dagens 5 bonuspoäng är klara. Emblemet gillar fortfarande en klapp!')
      return
    }
    busy.current = true
    setSaving(true)
    setMessage('Sparar bonus…')
    try {
      pendingId.current ||= crypto.randomUUID()
      const result = await onTap(pendingId.current)
      pendingId.current = null
      if (mounted.current) setMessage(result.emblemBonus.awarded === 1 ? '+1 poäng! ✨' : result.emblemBonus.replayed ? 'Din bonus är redan sparad. ✨' : 'Dagens 5 bonuspoäng är klara. Tack för klappen!')
    } catch {
      if (mounted.current) setMessage('Bonusen kunde inte bekräftas. Tryck igen för att kontrollera samma försök.')
    } finally {
      busy.current = false
      if (mounted.current) setSaving(false)
    }
  }
  return { burst, message, saving, tap }
}
