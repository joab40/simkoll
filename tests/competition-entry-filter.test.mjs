import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { competitionEntryFilterOptions, competitionEntryFilterMatch as match } from '../shared/competition-entry-filter.js'

const row = (gender, ageClass, extra = {}) => ({ selectable: true, itemType: 'race', gender, ageClass, ...extra })
const filter = { enabled: true, gender: 'Herr', ageClass: '13–14' }

test('filter choices come from actual selectable events, including API display prefixes and class letters', () => {
  assert.deepEqual(competitionEntryFilterOptions([
    row('Kön: Herrar', 'Klass: 13–14'), row('Dam', '13-14'), row('Mix', 'Klass: D'),
    row('Alla', 'Alla åldrar'), row('Alla', 'Ej angiven – se PM'),
    row('Herr', '18–19', { selectable: false }), row('Alla', 'Öppen klass'),
  ]), { genders: ['Dam', 'Herr', 'Mix'], ageClasses: ['13–14', 'D'] })
  assert.deepEqual(competitionEntryFilterOptions([row('Alla', '')]), { genders: [], ageClasses: [] })
})

test('filter starts off, supports either dimension alone, and never removes rows', () => {
  const event = row('Dam', '15–16')
  assert.equal(match(event, { ...filter, enabled: false }).dimmed, false)
  assert.equal(match(event, filter).dimmed, true)
  assert.equal(match(row('Kön: Herrar', 'Klass: 13-14'), filter).dimmed, false)
  assert.equal(match(event, { enabled: true, gender: 'Dam', ageClass: '' }).dimmed, false)
  assert.equal(match(event, { enabled: true, gender: '', ageClass: '15–16' }).dimmed, false)
  assert.equal(match(event, { enabled: true, gender: '', ageClass: '' }).dimmed, false)
})

test('mixed/open events and unknown metadata stay available; class D never becomes women', () => {
  for (const gender of ['Mix', 'Mixed', 'Alla']) assert.equal(match(row(gender, 'Alla åldrar'), filter).dimmed, false)
  for (const ageClass of ['', 'Klass: Ej angiven – se PM', 'Öppen', 'Open']) assert.equal(match(row('Herr', ageClass), filter).dimmed, false)
  assert.equal(match(row('', ''), filter).unknown, true)
  assert.equal(match(row('Herr', '13–14'), { ...filter, gender: 'Mix' }).dimmed, true)
  assert.equal(match(row('Herr', 'D'), { ...filter, ageClass: 'D' }).dimmed, false)
  assert.equal(match(row('Dam', 'D'), { ...filter, ageClass: 'D' }).dimmed, true)
  assert.equal(match(row('Herr', 'A/B'), { ...filter, ageClass: 'A/B' }).dimmed, false)
})

test('pauses and program information never become races or gray-filter targets', () => {
  for (const patch of [{ selectable: false }, { entryAllowed: false }, { itemType: 'pause' }, { itemType: 'info' }]) {
    assert.equal(match(row('Dam', '15–16', patch), filter).dimmed, false)
    assert.deepEqual(competitionEntryFilterOptions([row('Dam', '15–16', patch)]), { genders: [], ageClasses: [] })
  }
})

test('actual swimmer view uses the shared choice component; filtering cannot change saved selections', () => {
  const source = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
  const choices = source('competition-entry-choices.jsx'), main = source('main.jsx')
  assert.match(main, /<CompetitionEntryChoices key=\{competition.id\} events=\{events\} selected=\{selected\} onChange=\{setSelected\}/)
  assert.match(main, /eventIds: selected/)
  assert.match(choices, /enabled: false, gender: '', ageClass: ''/)
  assert.match(choices, /checked=\{checked\}/)
  assert.match(choices, /disabled=\{event.selectable === false\}/)
  assert.doesNotMatch(choices, /disabled=\{dimmed|onChange\(filter|fetch\(|apiRequest|useEffect/)
  assert.match(choices, /Vald · utanför filtret/)
  assert.match(choices, /Nedtonade grenar går fortfarande att välja/)
})
