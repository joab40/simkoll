import test from 'node:test'
import assert from 'node:assert/strict'
import { detectGoalPersonalData } from '../shared/goal-privacy.js'

test('goal privacy check catches common identifiers', () => {
  assert.equal(detectGoalPersonalData('Johan Andersson vill öva vändningar.').type, 'full_name')
  assert.equal(detectGoalPersonalData('johan andersson vill öva.', 'Johan Andersson').type, 'full_name')
  assert.equal(detectGoalPersonalData('Mejla test.person@example.se').type, 'email')
  assert.equal(detectGoalPersonalData('Personnummer: 20100101-1234').type, 'personal_identity_number')
})

test('goal privacy check allows ordinary anonymized training notes', () => {
  assert.equal(detectGoalPersonalData('Simmaren vill få bättre flyt i vändningen och öva tajming.'), null)
  assert.equal(detectGoalPersonalData('Bättre vändning. Under passet arbetar vi med tajming.'), null)
})
