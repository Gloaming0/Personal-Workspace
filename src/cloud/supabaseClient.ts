import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface SupabaseEnvironment {
  appEnvironment: 'local' | 'development' | 'production' | 'test'
  url: string
  anonKey: string
  authRedirectUrl: string
}

export interface SupabaseEnvironmentSource {
  VITE_APP_ENV?: 'local' | 'development' | 'production' | 'test'
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_AUTH_REDIRECT_URL?: string
}

function isServiceRoleJwt(key: string): boolean {
  if (!key.includes('.')) return false
  try {
    const payload = key.split('.')[1]
    if (!payload) return false
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(atob(normalized)) as { role?: unknown }
    return decoded.role === 'service_role'
  } catch {
    return false
  }
}

export function readSupabaseEnvironment(
  env: SupabaseEnvironmentSource = import.meta.env,
): SupabaseEnvironment | null {
  const url = env.VITE_SUPABASE_URL?.trim()
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim()
  if (
    !url ||
    !anonKey ||
    anonKey.startsWith('replace-') ||
    isServiceRoleJwt(anonKey)
  ) {
    return null
  }
  try {
    const parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return null
  } catch {
    return null
  }
  return {
    appEnvironment: env.VITE_APP_ENV ?? 'local',
    url,
    anonKey,
    authRedirectUrl:
      env.VITE_SUPABASE_AUTH_REDIRECT_URL?.trim() || window.location.origin,
  }
}

export function createBrowserSupabaseClient(
  environment: SupabaseEnvironment,
): SupabaseClient {
  return createClient(environment.url, environment.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
}
