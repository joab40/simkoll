import React, { useId, useState } from 'react'
import { TRAINING_HEART_EXAMPLES, TRAINING_HEART_EXAMPLE_INTRO, TRAINING_HEART_EXAMPLE_NOTICE, trainingHeartExampleFacts } from '../shared/training-heart-examples.js'
import TrainingHeartGlyph from './training-heart-glyph.jsx'
import { trainingHeartLoadSummary } from '../shared/training-heart-load.js'
import './training-heart.css'

export default function TrainingHeartExamples() {
  const [animate, setAnimate] = useState(false)
  const id = useId()
  return <div className={`training-heart-examples${animate ? '' : ' motion-off'}`}>
    <p className="training-heart-example-label">Illustrationer · endast fiktiva värden</p>
    <p>{TRAINING_HEART_EXAMPLE_INTRO[0]}</p>
    <p className="training-heart-example-notice">{TRAINING_HEART_EXAMPLE_NOTICE}</p>
    <button type="button" className="training-heart-example-motion" aria-pressed={animate} onClick={() => setAnimate(value => !value)}>{animate ? 'Pausa exempelanimationer' : 'Visa pulsering i exemplen'}</button>
    <div className="training-heart-example-grid">{TRAINING_HEART_EXAMPLES.map(example => {
      const { heart } = example
      const loadSummary = trainingHeartLoadSummary(heart.load)
      return <article className="training-heart-example" key={example.id} aria-labelledby={`${id}-${example.id}`}>
        <header><span className={`training-heart-trigger training-heart-example-icon ${heart.color} state-${heart.readiness.state} load-${heart.load.ring}`} aria-hidden="true"><TrainingHeartGlyph motion={heart.speed.motion} />{heart.warnings.length > 0 && <span className="training-heart-warning">!</span>}</span><h3 id={`${id}-${example.id}`}>{example.title}</h3></header>
        <p className="training-heart-example-load"><strong>{loadSummary.label}</strong><small>Senaste 7 dagar mot föregående 7 dagar</small></p>
        <p>{example.interpretation}</p>
        {heart.warnings.length > 0 && <p className="training-heart-example-alert">Sömnsignal: {heart.warnings.join(' · ')}</p>}
        <details><summary>Vilka värden används?<span aria-hidden="true">+</span></summary><dl>{trainingHeartExampleFacts(example).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>
      </article>
    })}</div>
    <details className="training-heart-example-reading"><summary>Så tolkar vi exemplen och deras begränsningar<span aria-hidden="true">+</span></summary>{TRAINING_HEART_EXAMPLE_INTRO.slice(1).map(text => <p key={text}>{text}</p>)}</details>
    <p>På simmarkortet finns nu Formkollen under Simmarens riktning. Exemplen ovan är arkiverade illustrationer av det tidigare hjärtat och påverkar inga registreringar.</p>
  </div>
}
