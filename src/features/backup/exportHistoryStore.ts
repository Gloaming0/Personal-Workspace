const key = 'daily-work-os:last-successful-backup-export'

export function readLastSuccessfulExport(): string | null {
  try {
    const value = localStorage.getItem(key)
    return value && !Number.isNaN(Date.parse(value)) ? value : null
  } catch {
    return null
  }
}

export function writeLastSuccessfulExport(instant: string): void {
  try {
    localStorage.setItem(key, instant)
  } catch {
    // Export history is optional device-local metadata.
  }
}
