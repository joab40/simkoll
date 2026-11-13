// Existing endpoint tests isolate their own business rules. Provide only the
// new preliminary session-version lookup; dedicated recovery tests exercise
// revocation, suspension, legacy version zero and database failures separately.
process.env.COACH_SESSION_SECRET ||= 'isolated-coach-session-test-secret'
export function coachSessionFixture(handler) {
  return async (request, response) => {
    const original = globalThis.fetch
    globalThis.fetch = async (input, options) => {
      const url = new URL(input)
      if (url.pathname.endsWith('/coach_accounts') && url.searchParams.has('session_version') && url.searchParams.get('select') === 'id') {
        return new Response(JSON.stringify([{ id: url.searchParams.get('id').slice(3) }]), { status: 200 })
      }
      return original(input, options)
    }
    try { return await handler(request, response) }
    finally { globalThis.fetch = original }
  }
}
