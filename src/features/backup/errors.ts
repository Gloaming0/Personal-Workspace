export type BackupErrorCode =
  | 'invalid-json'
  | 'invalid-format'
  | 'unsupported-version'
  | 'invalid-structure'
  | 'invalid-entity'
  | 'wrong-owner'
  | 'invalid-reference'
  | 'integrity-violation'
  | 'export-failed'
  | 'restore-failed'
  | 'safety-backup-failed'

export class BackupError extends Error {
  constructor(
    public readonly code: BackupErrorCode,
    options?: ErrorOptions,
  ) {
    super(code, options)
    this.name = 'BackupError'
  }
}
