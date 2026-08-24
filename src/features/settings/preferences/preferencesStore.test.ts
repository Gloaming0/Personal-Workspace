import { describe, expect, it } from 'vitest'
import { sanitizePreferences } from './preferencesStore'

describe('preferences contract', () => {
  it('sanitizes persisted values and fills fields introduced by migrations', () => {
    expect(
      sanitizePreferences({
        density: 'tiny',
        language: 'zh-CN',
        sidebarMode: 'expanded',
        theme: 'forest',
      }),
    ).toEqual({
      density: 'comfortable',
      language: 'zh-CN',
      quickCaptureDefault: 'inbox',
      sidebarMode: 'expanded',
      theme: 'forest',
      weekStartsOn: 1,
    })
  })
})
