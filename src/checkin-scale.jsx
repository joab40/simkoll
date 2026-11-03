import React from 'react'

export default function CheckinScale({ count, left, right, icons, onChange }) {
  const showIcons = icons?.length === count
  return <div className="scale-wrap">
    <div className={`${count === 5 && showIcons ? 'feeling-grid' : `scale-grid scale-${count}`}${showIcons ? ' checkin-scale-icons' : ''}`}>
      {Array.from({ length: count }, (_, index) => <button type="button" key={index} aria-label={showIcons ? `${index + 1} av ${count}${index === 0 ? ` · ${left}` : index === count - 1 ? ` · ${right}` : ''}` : undefined} onClick={() => onChange(index + 1)}>{showIcons ? <><span aria-hidden="true">{icons[index]}</span><small>{index + 1}</small></> : index + 1}</button>)}
    </div>
    <div className="scale-labels"><span>{left}</span><span>{right}</span></div>
  </div>
}
