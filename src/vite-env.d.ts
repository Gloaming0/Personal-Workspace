/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: 'local' | 'development' | 'production' | 'test'
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_SUPABASE_AUTH_REDIRECT_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
