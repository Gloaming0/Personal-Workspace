import type { Language } from '@/features/settings/language/types'
import type {
  TodaySupportingViewModel,
  TodaySupportingViewModelSource,
} from './contracts'
import { createTodaySupportingMock } from './mockData'

export class MockTodaySupportingViewModelSource implements TodaySupportingViewModelSource {
  constructor(private readonly language: Language) {}

  get(): TodaySupportingViewModel {
    return createTodaySupportingMock(this.language)
  }
}
