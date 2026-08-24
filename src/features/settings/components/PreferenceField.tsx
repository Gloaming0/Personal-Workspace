import type { ReactNode } from 'react'

interface PreferenceFieldProps {
  control: ReactNode
  description: string
  label: string
}

export function PreferenceField({
  control,
  description,
  label,
}: PreferenceFieldProps) {
  return (
    <div className="preference-field">
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <div className="preference-field-control">{control}</div>
    </div>
  )
}
