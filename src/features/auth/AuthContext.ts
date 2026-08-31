import { createContext } from 'react'
import type { AuthSnapshot } from './contracts'

export interface AuthContextValue extends AuthSnapshot {
  configured: boolean
  sendMagicLink(email: string): Promise<void>
  signOut(): Promise<void>
  retrySessionRestore(): Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
