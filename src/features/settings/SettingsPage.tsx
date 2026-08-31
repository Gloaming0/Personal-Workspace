import { PreferenceField } from './components/PreferenceField'
import { SettingsPlaceholder } from './components/SettingsPlaceholder'
import { SettingsSection } from './components/SettingsSection'
import { LanguageSwitcher } from './language/LanguageSwitcher'
import { useTranslations } from './language/useTranslations'
import { DensitySwitcher } from './preferences/DensitySwitcher'
import { SidebarModeSwitcher } from './preferences/SidebarModeSwitcher'
import { ThemeSwitcher } from './theme/ThemeSwitcher'
import { BackupRestorePanel } from '@/features/backup/BackupRestorePanel'
import { AuthPanel } from '@/features/auth/AuthPanel'
import { useAuth } from '@/features/auth/useAuth'

export function SettingsPage() {
  const { t } = useTranslations()
  const auth = useAuth()

  return (
    <div className="settings-page">
      <header className="page-heading">
        <p className="eyebrow">Phase 3.3</p>
        <h1>{t('settings.title')}</h1>
        <p>{t('settings.description')}</p>
      </header>

      <SettingsSection
        title={t('auth.sectionTitle')}
        description={t('auth.sectionDescription')}
      >
        <AuthPanel />
      </SettingsSection>

      <SettingsSection
        title={t('settings.appearance')}
        description={t('settings.appearanceDescription')}
      >
        <PreferenceField
          label={t('preferences.language')}
          description={t('preferences.languageDescription')}
          control={<LanguageSwitcher />}
        />
        <PreferenceField
          label={t('preferences.theme')}
          description={t('preferences.themeDescription')}
          control={<ThemeSwitcher />}
        />
        <PreferenceField
          label={t('preferences.density')}
          description={t('preferences.densityDescription')}
          control={<DensitySwitcher />}
        />
      </SettingsSection>

      <SettingsSection
        title={t('backup.sectionTitle')}
        description={t('backup.sectionDescription')}
      >
        <BackupRestorePanel userId={auth.identity.userId} />
      </SettingsSection>

      <SettingsSection
        title={t('settings.workspace')}
        description={t('settings.workspaceDescription')}
      >
        <PreferenceField
          label={t('preferences.sidebarMode')}
          description={t('preferences.sidebarModeDescription')}
          control={<SidebarModeSwitcher />}
        />
      </SettingsSection>

      <section
        className="settings-placeholder-grid"
        aria-label={t('settings.title')}
      >
        {(['keyboard', 'about'] as const).map((section) => (
          <SettingsPlaceholder
            key={section}
            label={t(`settings.${section}`)}
            status={t('settings.comingLater')}
          />
        ))}
      </section>
    </div>
  )
}
