import React, { useState } from 'react'
import { TRAINING_ENERGY_EXAMPLES, TRAINING_ENERGY_EXAMPLE_ANSWERS } from '../shared/training-energy-examples.js'
import TrainingEnergyGlyph from './training-energy-glyph.jsx'

export default function TrainingHeartExamples() {
  const [animate, setAnimate] = useState(false)
  return <div className={`training-heart-examples${animate ? '' : ' motion-off'}`}>
    <p>{TRAINING_ENERGY_EXAMPLE_ANSWERS[0]}</p>
    <button type="button" className="training-heart-example-motion" aria-pressed={animate} onClick={() => setAnimate(value => !value)}>{animate ? 'Pausa exempelanimationer' : 'Visa exempelanimationer'}</button>
    <div className="training-heart-example-grid">{TRAINING_ENERGY_EXAMPLES.map(example => <article className="training-heart-example" key={example.id}>
      <header><TrainingEnergyGlyph level={example.energy.level} effect={example.energy.effect} burst={animate} /><h3>{example.title}</h3></header>
      <strong>{example.energy.label}</strong><p>{example.detail}</p>
    </article>)}</div>
    <p>Illustrationerna står stilla från början. Minskad rörelse i enheten gäller alltid. Stjärnan visar rapporterade upplevelser, inte diagnos eller klartecken för träning.</p>
  </div>
}
