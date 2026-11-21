import React from 'react'
import {weeklyTrainingVolume} from './weekly-training-sync.js'

export default function WeeklyTrainingVolume({sessions}){
  const {meters,minutes}=weeklyTrainingVolume(sessions)
  const display=item=>item.value==null?'–':`${item.estimated?'≈ ':''}${item.value.toLocaleString('sv-SE')}`
  return <><div className="weekly-volume-summary" aria-live="polite"><span><strong>{display(meters)}</strong><small>registrerade simmeter</small></span><span><strong>{display(minutes)}</strong><small>registrerade minuter</small></span></div>{(meters.estimated||minutes.estimated)&&<small>Kopplade planerade mängder ingår som uppskattning.</small>}{(meters.missing>0||minutes.missing>0)&&<small>Mängduppgift saknas: {meters.missing} simpass utan meter · {minutes.missing} utan tid.</small>}</>
}
