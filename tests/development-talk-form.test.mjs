import test from 'node:test'
import assert from 'node:assert/strict'
import { developmentTalkQuestions, TALK_STEPS } from '../shared/development-talk-form.js'

test('partly completed preparations keep every question in the swimmer form order', () => {
  const { sections } = developmentTalkQuestions({ stod: 'Mer återkoppling', kort: 'Ett mål', simPass: '6', __step: 5 })
  assert.deepEqual(sections.map((section) => section.title), ['Min träning', 'Det jag vill utveckla', 'Mina mål', 'Återhämtning', 'Helheten', 'Stöd'])
  const questions = sections.flatMap((section) => section.questions)
  assert.equal(questions.length, 20)
  assert.deepEqual(questions.map((question) => question.key), TALK_STEPS.flatMap(([, , fields]) => fields.map(([key]) => key)))
  assert.deepEqual(questions.filter((question) => question.answered).map((question) => question.key), ['simPass', 'kort', 'stod'])
  assert.equal(questions.find((question) => question.key === 'teknik').value, '')
  assert.equal(questions.find((question) => question.key === 'teknik').answered, false)
})

test('unanswered questions remain visible, and legacy answers are retained separately', () => {
  const { sections, legacy } = developmentTalkQuestions({ teknik: '  ', oldQuestion: 'Tidigare svar', __step: 2 })
  assert.equal(sections.flatMap((section) => section.questions).length, 20)
  assert.equal(sections.every((section) => section.questions.every((question) => !question.answered)), true)
  assert.deepEqual(legacy, [{ key: 'oldQuestion', label: 'oldQuestion', value: 'Tidigare svar' }])
})
