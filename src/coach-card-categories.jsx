import React, { cloneElement, createContext, useContext, useEffect, useState } from 'react'
import { COACH_CARD_LABELS, COACH_CATEGORY_LABELS, DEFAULT_COACH_CATEGORY, canSeeCoachCard, isCoachCategory } from '../shared/coach-card-categories.js'
import { apiRequest } from './api-request.js'
import './coach-card-categories.css'

const CategoryContext = createContext(null)

export function requestCoachCategory(code, action, payload = {}, signal) {
  return apiRequest('/api/auth', code, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
    signal,
  })
}

export function CoachCategoryProvider({ code, accountRole, children }) {
  const [layout, setLayout] = useState(null)
  const [ownCategory, setOwnCategory] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const canEdit = accountRole === 'superadmin'

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    requestCoachCategory(code, 'coach-card-layout', {}, controller.signal)
      .then(data => { if (!controller.signal.aborted) setLayout(data) })
      .catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [code, attempt])

  async function saveCard(cardId, category) {
    const saved = await requestCoachCategory(code, 'coach-set-card-category', { cardId, category })
    setLayout(current => ({ ...current, cards: { ...current?.cards, [saved.cardId]: saved.category } }))
  }

  function updateOwnCategory(account) {
    setShowAll(false)
    setOwnCategory(account.view_category)
  }

  return <CategoryContext.Provider value={{
    layout: layout && { ...layout, category: ownCategory ?? layout.category },
    canEdit, error, showAll: canEdit && showAll, setShowAll,
    retry: () => setAttempt(current => current + 1), saveCard, updateOwnCategory,
  }}>{children}</CategoryContext.Provider>
}

export function useCoachCardCategories() {
  return useContext(CategoryContext)
}

function cardVisible(categories, id) {
  if (!categories) return true
  const { layout, error, showAll } = categories
  if (!layout && !error) return false
  return showAll || canSeeCoachCard(layout?.category, layout?.cards?.[id])
}

export function useCoachCardVisible(id) {
  return cardVisible(useCoachCardCategories(), id)
}

export function CoachCategoryOptions() {
  return Object.entries(COACH_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)
}

export function CoachCategoryToolbar() {
  const categories = useCoachCardCategories()
  if (!categories) return null
  if (categories.error) return <div className="coach-category-toolbar" role="status">{categories.error} <button type="button" className="text-button" onClick={categories.retry}>Hämta igen</button></div>
  if (!categories.canEdit || !categories.layout) return null
  return <div className="coach-category-toolbar">
    <span>Min kortvy · {COACH_CATEGORY_LABELS[categories.layout.category || DEFAULT_COACH_CATEGORY]}</span>
    <button type="button" className="text-button" aria-pressed={categories.showAll} onClick={() => categories.setShowAll(!categories.showAll)}>
      {categories.showAll ? 'Visa min kortvy' : 'Visa alla kort för redigering'}
    </button>
  </div>
}

function CardCategoryFooter({ id, category, saveCard }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function change(next) {
    if (!isCoachCategory(next) || next === category || saving) return
    setSaving(true)
    setError('')
    try {
      await saveCard(id, next)
      setOpen(false)
    } catch (error) {
      setError(error.message)
    } finally {
      setSaving(false)
    }
  }
  return <div className="coach-card-category">
    <button type="button" className="text-button" aria-expanded={open} aria-label={`Kategori för ${COACH_CARD_LABELS[id]} · ${COACH_CATEGORY_LABELS[category]}`} onClick={() => setOpen(value => !value)}>
      Kategori · {COACH_CATEGORY_LABELS[category]}
    </button>
    {open && <select aria-label={`Kategori för ${COACH_CARD_LABELS[id]}`} value={category} disabled={saving} onChange={event => change(event.target.value)}>
      <CoachCategoryOptions />
    </select>}
    {saving && <small role="status">Sparar…</small>}
    {error && <small className="form-error" role="alert">{error}</small>}
  </div>
}

export function CoachCategorizedCard({ id, children, footerOutside = false }) {
  const categories = useCoachCardCategories()
  if (!cardVisible(categories, id)) return null
  if (!categories?.canEdit || categories.error) return children

  const { layout, saveCard } = categories
  const category = layout?.cards?.[id] ?? DEFAULT_COACH_CATEGORY
  const footer = <CardCategoryFooter id={id} category={category} saveCard={saveCard} />
  if (!footerOutside && ['section', 'article', 'div'].includes(children.type)) {
    return cloneElement(children, {}, <>{children.props.children}{footer}</>)
  }
  return <div className="coach-card-category-slot">{children}{footer}</div>
}
