import React, { useId } from 'react'
import { WORKOUT_INNOVATION_MODES, workoutInnovationMode } from '../shared/workout-innovation.js'
import './workout-innovation-slider.css'

export default function WorkoutInnovationSlider({ value, onChange, disabled = false }) {
  const id = useId()
  const mode = workoutInnovationMode(value)
  return <section className="workout-innovation">
    <div className="workout-innovation-heading"><label htmlFor={id}>Variation i passförslaget</label><output htmlFor={id}>{mode.label}</output></div>
    <input id={id} type="range" min="0" max={WORKOUT_INNOVATION_MODES.length - 1} step="1" value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} aria-valuetext={`${value + 1} av 5: ${mode.label}`} aria-describedby={`${id}-description`} />
    <div className="workout-innovation-scale" aria-hidden="true"><span>Mer från biblioteket</span><span>Mer nytänkande</span></div>
    <p id={`${id}-description`}>{mode.description}</p>
    <small>Distans, tid, inriktning och mål-RPE gäller i alla lägen. Granska alltid förslaget före publicering.</small>
  </section>
}
