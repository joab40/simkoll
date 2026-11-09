import React from 'react'

export default function PlanningFoundation({ plans = [], renderEditor }) {
  if (!plans.length) return null
  return <details className="planning-foundation"><summary>Grundplanering · kompletterad med upplagt pass</summary>{plans.map(base => <div key={`foundation-${base.id}`}><strong>{base.title}</strong>{base.notes && <p>{base.notes}</p>}{renderEditor?.(base)}</div>)}</details>
}
