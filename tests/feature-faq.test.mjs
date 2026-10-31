import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FEATURE_FAQ, FEATURE_FAQ_SECTIONS, featureFaqFor, featureFaqGuide } from '../shared/feature-faq.js'
import { COACH_ASSISTANT_FEATURE_GUIDE } from '../server/assistant-feature-guide.js'

test('FAQ entries have unique stable IDs and questions, valid groups and nonempty answers', () => {
  assert.equal(new Set(FEATURE_FAQ.map(item => item.id)).size, FEATURE_FAQ.length)
  assert.equal(new Set(FEATURE_FAQ.map(item => item.question)).size, FEATURE_FAQ.length)
  for (const item of FEATURE_FAQ) {
    assert.ok(FEATURE_FAQ_SECTIONS.some(([key]) => key === item.section))
    assert.ok(item.answer.length)
    for (const paragraph of [...item.answer, ...(item.coachAnswer || [])]) assert.ok(paragraph.trim().length > 30)
  }
})

test('swimmer FAQ and diary help do not contain coach-only actions', () => {
  const swimmer = featureFaqFor('swimmer'), coach = featureFaqFor('coach'), diary = featureFaqFor('swimmer', 'diary')
  assert.ok(coach.length > swimmer.length)
  assert.ok(diary.length >= 8)
  assert.ok(diary.every(item => item.section === 'diary'))
  assert.ok(!swimmer.some(item => ['workout-generation', 'storage', 'talk-preparation', 'followup'].includes(item.id)))
  const program = swimmer.find(item => item.id === 'dryland-program')
  assert.doesNotMatch(program.answer.join(' '), /Tränarmenyn/)
  assert.match(coach.find(item => item.id === 'dryland-program').answer.join(' '), /Tränarmenyn/)
  assert.deepEqual(featureFaqFor('unknown'), swimmer)
  assert.deepEqual(featureFaqFor('swimmer', 'missing'), [])
})

test('both assistants receive exactly the same curated feature answers as the visible FAQ', () => {
  for (const role of ['coach', 'swimmer']) {
    const guide = featureFaqGuide(role)
    for (const entry of featureFaqFor(role)) {
      assert.ok(guide.includes(entry.question))
      for (const paragraph of entry.answer) assert.ok(guide.includes(paragraph))
    }
    assert.match(guide, /inte åtkomst till personliga uppgifter/)
    assert.match(guide, /inte ändra, generera, publicera, skicka eller spara/)
  }
  assert.ok(COACH_ASSISTANT_FEATURE_GUIDE.includes(featureFaqGuide('coach')))
  const api = readFileSync(new URL('../api/workouts.js', import.meta.url), 'utf8')
  assert.match(api, /role === 'coach' \? '' : featureFaqGuide\('swimmer'\)/)
  assert.match(api, /\$\{faq\}\$\{coachFaq\}/)
})

test('key recent functions and diary boundaries remain documented', () => {
  const byId = id => FEATURE_FAQ.find(item => item.id === id).answer.join(' ')
  assert.match(byId('strength-checkin'), /Kraftlös.*Seg.*Normal.*Stark.*Explosiv/)
  assert.match(byId('workout-alternatives'), /Alternativen summeras inte/)
  assert.match(byId('diary-volume'), /≈/)
  assert.match(byId('diary-history'), /innan dagboken infördes/)
  assert.match(byId('own-times'), /inte extra pass, simmeter eller PB-poäng/)
  assert.match(byId('diary-reflections'), /avstängt tillval/)
  assert.match(byId('sleep-direction'), /inte sovtid, RPE/)
  assert.match(byId('sleep-direction'), /tre rapporterade.*7 timmar/)
  assert.match(byId('sleep-direction'), /minst fem/)
  assert.match(byId('push'), /2,5 timmar efter Jag ska träna/)
  assert.match(byId('push'), /Nya publicerade simpass/)
  assert.match(byId('talk-preparation'), /högst tolv månader/)
  assert.match(byId('followup'), /minst två olika aktivitetsdagar/)
  assert.match(byId('swimmer-traffic'), /Saknat underlag.*grå, inte gröna/)
  assert.match(byId('swimmer-traffic'), /samma veckodag en vecka tidigare/)
  assert.match(byId('workout-generation'), /spärrad mot dubbelklick/)
})

test('visible FAQ and always-available diary help render the shared role-filtered component', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
  const diary = readFileSync(new URL('../src/training-diary.jsx', import.meta.url), 'utf8')
  const component = readFileSync(new URL('../src/feature-faq.jsx', import.meta.url), 'utf8')
  assert.match(main, /<FeatureFaq role=\{role\}/)
  assert.match(diary, /<FeatureFaq role="swimmer" section="diary"/)
  assert.ok(diary.indexOf('Frågor om träningsdagboken') < diary.indexOf('{loading &&'))
  assert.match(component, /featureFaqFor\(role, section\)/)
  assert.match(main, /'Sömn': \[\['1', 'Dålig'\], \['3', 'Okej'\], \['5', 'Bra'\]\]/)
})
