import type { PropsWithChildren, ReactNode } from 'react'

interface DashboardWidgetProps extends PropsWithChildren {
  title: string
  description?: string
  count?: number
  icon: ReactNode
  className?: string
}

export function DashboardWidget({
  children,
  className = '',
  count,
  description,
  icon,
  title,
}: DashboardWidgetProps) {
  return (
    <section
      className={`dashboard-widget ${className}`.trim()}
      aria-label={title}
    >
      <header className="dashboard-widget-heading">
        <div className="dashboard-widget-title">
          <span className="widget-icon">{icon}</span>
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
        </div>
        {typeof count === 'number' && (
          <span className="widget-count">{count}</span>
        )}
      </header>
      <div className="dashboard-widget-content">{children}</div>
    </section>
  )
}
