export const SECTIONS = ['overview', 'sources', 'models', 'behavior', 'policy', 'usage', 'system'] as const

export type SectionId = (typeof SECTIONS)[number]
export const DEFAULT_SECTION: SectionId = SECTIONS[0]
export const parseSection = (value: unknown): SectionId => SECTIONS.find(s => s === value) ?? DEFAULT_SECTION
