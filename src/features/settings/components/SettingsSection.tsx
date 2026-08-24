import type { PropsWithChildren } from 'react'

interface SettingsSectionProps extends PropsWithChildren {
  description: string
  title: string
}

export function SettingsSection({
  children,
  description,
  title,
}: SettingsSectionProps) {
  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="settings-section-content">{children}</div>
    </section>
  )
}
