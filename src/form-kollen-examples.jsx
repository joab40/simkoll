import React from 'react'
import { FormKollenView } from './form-kollen.jsx'
import { FORM_EXAMPLES } from '../shared/form-kollen-examples.js'

export default function FormKollenExamples() {
  return <div><p>Konceptdemo med enbart fiktiva värden. Inga simmaruppgifter hämtas eller ändras.</p>{FORM_EXAMPLES.map(example => <FormKollenView key={example.key} data={example.data} name="Demo, ingen verklig simmare" demo />)}</div>
}
