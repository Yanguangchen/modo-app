import type { Audience } from './types'

export type PreviewRole = 'edit' | 'team' | 'selected' | 'organization'

/** What a chosen audience can see. Private fields stay hidden outside edit mode. */
export function isVisibleInPreview(audience: Audience, role: PreviewRole) {
  if (role === 'edit') return true
  if (audience === 'private') return false
  if (role === 'selected') return audience === 'selected' || audience === 'team' || audience === 'organization'
  if (role === 'team') return audience === 'team' || audience === 'organization'
  return audience === 'organization'
}
