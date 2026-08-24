interface SettingsPlaceholderProps {
  label: string
  status: string
}

export function SettingsPlaceholder({
  label,
  status,
}: SettingsPlaceholderProps) {
  return (
    <div className="settings-placeholder">
      <strong>{label}</strong>
      <span>{status}</span>
    </div>
  )
}
