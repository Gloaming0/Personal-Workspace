import { usePreferencesStore } from '../preferences/preferencesStore'
import { messages, type MessageKey } from './messages'

export function useTranslations() {
  const language = usePreferencesStore((state) => state.language)

  return {
    language,
    t: (key: MessageKey) => messages[language][key],
  }
}
