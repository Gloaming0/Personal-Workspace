export type RuntimeIdentity =
  | { kind: 'local-anonymous'; userId: 'local-user' }
  | { kind: 'authenticated'; userId: string; email: string | null }

export type AuthStatus =
  'restoring' | 'signed_out' | 'signing_in' | 'signed_in' | 'error'

export interface AuthSnapshot {
  status: AuthStatus
  identity: RuntimeIdentity
  errorCode: string | null
}

export interface AuthGateway {
  restoreSession(): Promise<RuntimeIdentity | null>
  refreshSession?(): Promise<RuntimeIdentity | null>
  sendMagicLink(email: string): Promise<void>
  signOut(): Promise<void>
  subscribe(listener: (identity: RuntimeIdentity | null) => void): () => void
}
