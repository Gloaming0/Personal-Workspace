import type { SafetyBackupSink } from './contracts'
import type { DailyWorkBackup } from './format'

export class BrowserBackupFileGateway implements SafetyBackupSink {
  async save(backup: DailyWorkBackup, filename: string): Promise<void> {
    this.download(`${JSON.stringify(backup, null, 2)}\n`, filename)
  }

  download(json: string, filename: string): void {
    const blob = new Blob([json], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.hidden = true
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }
}
