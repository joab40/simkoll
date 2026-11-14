import React from 'react'
import { createRoot } from 'react-dom/client'
import FormKollenExamples from './form-kollen-examples.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(new URLSearchParams(window.location.search).get('viewport') === 'mobile'
  ? <main style={{ padding: 16 }}><h1>Mobilförhandsvisning · 390 px</h1><iframe title="Formkollen i mobilbredd, fiktivt demo" src="/form-kollen-qa.html" style={{ width: 390, height: 720, maxWidth: '100%', border: '1px solid #bed5d0', borderRadius: 20 }} /></main>
  : <main style={{ maxWidth: 760, margin: '30px auto', padding: 16 }}><h1>Formkollen · utvecklingsdemo</h1><FormKollenExamples /></main>)
