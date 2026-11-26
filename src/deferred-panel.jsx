import React from 'react'

function PanelLoadError() {
  return <div className="empty" role="alert">
    <p>Vyn kunde inte laddas. Ladda om Simkoll och försök igen.</p>
    <button type="button" className="secondary-button" onClick={() => window.location.reload()}>Ladda om Simkoll</button>
  </div>
}

export function lazyPanel(load) {
  return React.lazy(() => load().catch(error => {
    console.error('Vyn kunde inte laddas', error)
    return { default: PanelLoadError }
  }))
}

export function deferredPanel(load, label = 'Öppnar sidan…') {
  const Panel = lazyPanel(load)
  return function DeferredPanel(props) {
    return <React.Suspense fallback={<p className="empty" role="status">{label}</p>}><Panel {...props} /></React.Suspense>
  }
}
