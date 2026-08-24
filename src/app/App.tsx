import { Check, Circle, Clock3, Inbox, Layers3, Sparkles } from 'lucide-react'
import { ThemeSwitcher } from '@/features/settings/theme/ThemeSwitcher'

const foundations = [
  'React + TypeScript workspace',
  'Token-driven theme system',
  'Responsive application shell',
  'Quality and test toolchain',
]

export function App() {
  return (
    <main className="foundation-page">
      <nav className="foundation-nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Daily Work OS home">
          <span className="brand-mark">DW</span>
          <span>Daily Work OS</span>
        </a>
        <div className="nav-links" aria-label="Foundation areas">
          <a className="nav-link active" href="#foundation">
            <Layers3 aria-hidden="true" size={17} /> <span>Foundation</span>
          </a>
          <a className="nav-link" href="#principles">
            <Sparkles aria-hidden="true" size={17} /> <span>Principles</span>
          </a>
          <a className="nav-link" href="#next">
            <Inbox aria-hidden="true" size={17} /> <span>Next</span>
          </a>
        </div>
        <p className="nav-note">A quiet place for daily work.</p>
      </nav>

      <section className="foundation-content" id="top">
        <header className="topbar">
          <span className="phase-label">Phase 0 · Project foundation</span>
          <ThemeSwitcher />
        </header>

        <div className="hero" id="foundation">
          <p className="eyebrow">Monday · August 24</p>
          <h1>Your personal work desk is taking shape.</h1>
          <p className="hero-copy">
            The foundation is intentionally calm, local-first, and ready to grow
            into the daily workspace defined by the product documents.
          </p>
        </div>

        <section className="foundation-grid" aria-label="Foundation status">
          <article className="panel" id="principles">
            <div className="panel-heading">
              <div>
                <p className="section-label">Ready now</p>
                <h2>Stable foundations</h2>
              </div>
              <span className="status-pill">
                <Check aria-hidden="true" size={14} /> In place
              </span>
            </div>
            <ul className="foundation-list">
              {foundations.map((foundation) => (
                <li key={foundation}>
                  <span className="check-mark">
                    <Check aria-hidden="true" size={14} />
                  </span>
                  {foundation}
                </li>
              ))}
            </ul>
          </article>

          <aside className="panel next-panel" id="next">
            <p className="section-label">Coming next</p>
            <h2>Today workspace MVP</h2>
            <div className="timeline-item">
              <Circle aria-hidden="true" size={15} />
              <div>
                <strong>Application layout</strong>
                <span>Sidebar, workspace, utility panel</span>
              </div>
            </div>
            <div className="timeline-item muted">
              <Clock3 aria-hidden="true" size={15} />
              <div>
                <strong>Core daily workflow</strong>
                <span>Focus, tasks, waiting, check-in</span>
              </div>
            </div>
          </aside>
        </section>
      </section>
    </main>
  )
}
