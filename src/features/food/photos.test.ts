import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { drainQueue, type UploadStep } from './photos'

describe('drainQueue', () => {
  it('goes on with the next photo after one fails', async () => {
    const tried: string[] = []
    const result = await drainQueue(['a', 'bad', 'c'], async (id): Promise<UploadStep> => {
      tried.push(id)
      return id === 'bad' ? 'failed' : 'sent'
    })
    expect(tried).toEqual(['a', 'bad', 'c'])
    expect(result).toEqual({ sent: 2, failed: 1 })
  })

  it('stops when none of the rest can go', async () => {
    const tried: string[] = []
    const result = await drainQueue(['a', 'b', 'c'], async (id): Promise<UploadStep> => {
      tried.push(id)
      return id === 'b' ? 'stop' : 'sent'
    })
    expect(tried).toEqual(['a', 'b'])
    expect(result).toEqual({ sent: 1, failed: 0 })
  })
})
