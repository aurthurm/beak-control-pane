import { describe, expect, it } from 'vitest'
import { getIngestSecret, getCronSecret } from '../server/utils/ingest-auth'

describe('ingest-auth env', () => {
  it('reads secrets without throwing', () => {
    expect(typeof getIngestSecret()).toBe('string')
    expect(typeof getCronSecret()).toBe('string')
  })
})
