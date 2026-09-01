import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthGateway, RuntimeIdentity } from './contracts'

function identityFromUser(
  user: { id: string; email?: string } | null,
): RuntimeIdentity | null {
  return user
    ? { kind: 'authenticated', userId: user.id, email: user.email ?? null }
    : null
}

export class SupabaseAuthGateway implements AuthGateway {
  constructor(
    private readonly client: SupabaseClient,
    private readonly redirectUrl: string,
  ) {}

  async restoreSession(): Promise<RuntimeIdentity | null> {
    const { data, error } = await this.client.auth.getSession()
    if (error) throw error
    return identityFromUser(data.session?.user ?? null)
  }

  async refreshSession(): Promise<RuntimeIdentity | null> {
    const { data, error } = await this.client.auth.refreshSession()
    if (error) throw error
    return identityFromUser(data.session?.user ?? null)
  }

  async sendMagicLink(email: string): Promise<void> {
    const { error } = await this.client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: this.redirectUrl },
    })
    if (error) throw error
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut({ scope: 'local' })
    if (error) throw error
  }

  subscribe(listener: (identity: RuntimeIdentity | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      listener(identityFromUser(session?.user ?? null))
    })
    return () => data.subscription.unsubscribe()
  }
}
