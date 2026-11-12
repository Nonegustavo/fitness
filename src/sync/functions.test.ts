import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { OFFLINE_MESSAGE, TIMEOUT_MESSAGE, toFunctionError } from './functions'

const answered = (status: number, body: unknown) =>
  new FunctionsHttpError(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))

describe('toFunctionError', () => {
  it("keeps the function's own message, status and the rest of its answer", async () => {
    const error = await toFunctionError(answered(404, { error: 'O link do calendário não está nos segredos.', missing: 'calendar' }), 'x')
    expect(error.message).toBe('O link do calendário não está nos segredos.')
    expect(error.status).toBe(404)
    expect(error.payload.missing).toBe('calendar')
  })

  it('falls back when the answer has no message', async () => {
    expect((await toFunctionError(answered(502, '<html>Bad gateway</html>'), 'O Garmin não respondeu.')).message).toBe('O Garmin não respondeu.')
    expect((await toFunctionError(answered(500, {}), 'A análise falhou.')).status).toBe(500)
  })

  it('tells a call that took too long from one that never left', async () => {
    const late = await toFunctionError(new FunctionsFetchError(new DOMException('aborted', 'AbortError')), 'x')
    expect(late.message).toBe(TIMEOUT_MESSAGE)
    const offline = await toFunctionError(new FunctionsFetchError(new TypeError('Failed to fetch')), 'x')
    expect(offline.message).toBe(OFFLINE_MESSAGE)
    expect(offline.status).toBeUndefined()
  })
})
