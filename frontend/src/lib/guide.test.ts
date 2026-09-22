import { describe, expect, it } from 'vitest'
import { isVisibleInPreview } from './guide'
import type { Audience } from './types'

const audiences: Audience[] = ['private', 'selected', 'team', 'organization']

describe('isVisibleInPreview', () => {
  it('shows every field to the owner while editing', () => {
    expect(audiences.filter(audience => isVisibleInPreview(audience, 'edit'))).toEqual(audiences)
  })

  it('hides private fields from every shared preview', () => {
    expect(isVisibleInPreview('private', 'selected')).toBe(false)
    expect(isVisibleInPreview('private', 'team')).toBe(false)
    expect(isVisibleInPreview('private', 'organization')).toBe(false)
  })

  it('shows an organization member only organization fields', () => {
    expect(audiences.filter(audience => isVisibleInPreview(audience, 'organization'))).toEqual(['organization'])
  })

  it('shows a teammate team and organization fields', () => {
    expect(audiences.filter(audience => isVisibleInPreview(audience, 'team'))).toEqual(['team', 'organization'])
  })

  it('shows a selected person selected, team, and organization fields', () => {
    expect(audiences.filter(audience => isVisibleInPreview(audience, 'selected'))).toEqual([
      'selected',
      'team',
      'organization',
    ])
  })
})
