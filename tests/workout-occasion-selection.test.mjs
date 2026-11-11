import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { defaultOccasionUpdate, occasionChoiceUpdate, occasionChoiceKey, occasionSelectionKey, hasOccasionTarget, validOccasionSelection, occasionValidationKey } from '../shared/workout-occasion-selection.js'
const choice = (extra = {}) => ({ targetWorkoutId: 'one', timeOfDay: 'afternoon', targetGroups: ['junior', 'ungdom_svart'], ...extra })
const form = { targetGroups: ['junior'], timeOfDay: 'morning' }

test('one compatible occasion defaults to existing and inherits time and all participating groups', () => {
  const update = defaultOccasionUpdate([choice()], form)
  assert.equal(update.occasionMode, 'existing')
  assert.equal(update.alternativeToWorkoutId, 'one')
  assert.equal(update.timeOfDay, 'afternoon')
  assert.deepEqual(update.targetGroups, ['junior', 'ungdom_svart'])
  assert.equal(update.requiresTimeOfDay, false)
})
test('several occasions default to existing but never guess the morning/afternoon choice', () => {
  const update = defaultOccasionUpdate([choice(), choice({ targetWorkoutId: 'two', timeOfDay: 'morning' })], form)
  assert.equal(update.occasionMode, 'existing')
  assert.equal(occasionSelectionKey(update), '')
  assert.equal(update.timeOfDay, undefined)
})
test('no matching training uses new; unrelated groups are not automatically selected', () => {
  for (const options of [[], [choice({ targetGroups: ['other'] })]]) assert.equal(defaultOccasionUpdate(options, form).occasionMode, 'new')
})
test('planning and calendar targets are typed and clear an earlier workout; unknown time is not guessed', () => {
  for (const target of [{ targetPlanId: 'one' }, { targetCalendarKey: '["cal","uid","2026-11-03"]' }]) {
    const selected = { ...target, targetGroups: ['junior'], timeOfDay: '' }
    const update = occasionChoiceUpdate(selected, form)
    assert.equal(occasionSelectionKey(update), occasionChoiceKey(selected))
    assert.equal(update.alternativeToWorkoutId, '')
    assert.equal(update.timeOfDay, '')
    assert.equal(update.requiresTimeOfDay, true)
  }
})
test('import loads planning, resets targets on date changes, hides redundant time and waits for a valid selection', () => {
  const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const review = source('src/workout-workbook-review.jsx'), component = source('src/workout-occasion-choice.jsx')
  assert.match(source('src/main.jsx'), /occasionChoices=true&includePlanning=true/)
  assert.match(review, /<WorkoutOccasionChoice autoDefault/)
  assert.match(review, /occasion.occasionMode === 'new' \|\| occasion.requiresTimeOfDay/)
  assert.match(review, /setOccasion\(\{ \.\.\.clearOccasionTarget \}\)/)
  assert.match(review, /occasion.occasionMode === 'existing' && !hasOccasionTarget\(occasion\)/)
  assert.match(review, /publicationId, \.\.\.occasion, date, timeOfDay, targetGroups: groups/)
  assert.match(component, /latest.current.form.occasionMode == null/)
  assert.match(component, /controller.signal.aborted/)
})

test('existing requires exactly one available target for the current groups', () => {
  const selected = { ...form, occasionMode: 'existing', alternativeToWorkoutId: 'one' }
  assert.equal(validOccasionSelection(selected, [choice()]), true)
  assert.equal(validOccasionSelection({ ...selected, alternativeToWorkoutId: '' }, [choice()]), false)
  assert.equal(validOccasionSelection(selected, []), false)
  assert.equal(validOccasionSelection(selected, [choice({ targetWorkoutId: 'two' })]), false)
  assert.equal(validOccasionSelection({ ...selected, targetGroups: ['other'] }, [choice()]), false)
  assert.equal(hasOccasionTarget({ ...selected, alternativeToPlanId: 'another' }), false)
  assert.equal(validOccasionSelection({ ...selected, alternativeToPlanId: 'another' }, [choice()]), false)
  assert.equal(validOccasionSelection({ ...form, occasionMode: 'new' }, []), true)
  assert.notEqual(occasionValidationKey({ ...selected, date: '2026-11-11' }), occasionValidationKey({ ...selected, date: '2026-11-12' }))
})
