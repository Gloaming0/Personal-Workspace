import { describe, expect, it } from 'vitest'
import { readSupabaseEnvironment } from './supabaseClient'

function serviceRoleToken() {
  const payload = btoa(JSON.stringify({ role: 'service_role' }))
  return `header.${payload}.signature`
}

describe('Supabase browser environment', () => {
  it('requires a valid URL and browser-safe key', () => {
    expect(
      readSupabaseEnvironment({
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'sb_publishable_safe',
      }),
    ).toMatchObject({ url: 'https://example.supabase.co' })
    expect(
      readSupabaseEnvironment({
        VITE_SUPABASE_URL: 'not-a-url',
        VITE_SUPABASE_ANON_KEY: 'sb_publishable_safe',
      }),
    ).toBeNull()
  })

  it('refuses a service-role JWT at the browser boundary', () => {
    expect(
      readSupabaseEnvironment({
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_ANON_KEY: serviceRoleToken(),
      }),
    ).toBeNull()
  })
})
