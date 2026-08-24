export const supportedLanguages = ['en', 'zh-CN'] as const

export type Language = (typeof supportedLanguages)[number]
