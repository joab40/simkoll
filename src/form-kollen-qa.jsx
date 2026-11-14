import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import FormKollenExamples from './form-kollen-examples.jsx'
import { FormKollenView } from './form-kollen.jsx'
import { FORM_EXAMPLES } from '../shared/form-kollen-examples.js'
import { evaluateFormSignals } from '../shared/form-kollen.js'
import { currentFormContext, normalizeFormContext } from '../shared/form-context.js'
import './styles.css'

function InteractiveDemo() {
  const base = FORM_EXAMPLES.find(item => item.key === 'partial').data
  const [records, setRecords] = useState({ available: true, current: base.context, revisions: [] })
  const data = { ...evaluateFormSignals({ ...base, context: currentFormContext(records.current, base.asOf) }), coachContext: records }
  const save = async input => {
    const context = normalizeFormContext(input, base.asOf)
    setRecords(previous => { const revision = { ...context, id: `demo-${previous.revisions.length + 1}`, createdAt: `${base.asOf}T12:00:00Z` }; return { available: true, current: revision, revisions: [revision, ...previous.revisions] } })
  }
  return <><p>Endast fiktivt, lokalt demo. Formuläret nedan sparar i sidans minne, inte i Simkolls databas. Inga mejl, AI-anrop eller verkliga resultat skapas.</p><FormKollenView data={data} name="Demo · ingen verklig simmare" demo onSaveContext={save} /><details><summary>Övriga fiktiva exempel</summary><FormKollenExamples /></details></>
}

createRoot(document.getElementById('root')).render(new URLSearchParams(window.location.search).get('viewport') === 'mobile'
  ? <main style={{ padding: 16 }}><h1>Mobilförhandsvisning · 390 px</h1><iframe title="Formkollen i mobilbredd, fiktivt demo" src="/form-kollen-qa.html" style={{ width: 390, height: 720, maxWidth: '100%', border: '1px solid #bed5d0', borderRadius: 20 }} /></main>
  : <main style={{ maxWidth: 760, margin: '30px auto', padding: 16 }}><h1>Formkollen · utvecklingsdemo</h1><InteractiveDemo /></main>)
