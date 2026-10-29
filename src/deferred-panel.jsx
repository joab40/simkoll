import React from 'react'

export function deferredPanel(load, label = 'Öppnar sidan…') {
  const Panel = React.lazy(load)
  return function DeferredPanel(props) {
    return <React.Suspense fallback={<p className="empty" role="status">{label}</p>}><Panel {...props} /></React.Suspense>
  }
}
