/** Shapes shared by the server functions and the UI. */

export const TABS = ['all', 'images', 'videos', 'news', 'science', 'it'] as const
export type Tab = (typeof TABS)[number]

export const TIME_RANGES = ['any', 'day', 'week', 'month', 'year'] as const
export type TimeRange = (typeof TIME_RANGES)[number]

export type Lang = string

export interface Hit {
  url: string
  title: string
  snippet: string
  /** Bare host without `www.`, e.g. `github.com`. */
  host: string
  /** Breadcrumb-style path, e.g. `tokio.rs › tokio › tutorial`. */
  crumbs: string
  publishedDate?: string
  thumbnail?: string
  /** Full-size image (image tab only). */
  imageSrc?: string
  author?: string
  duration?: string
  resolution?: string
  source?: string
  engines?: ReadonlyArray<string>
}

export interface InfoboxData {
  title: string
  content: string
  image?: string
  attributes: ReadonlyArray<{ label: string; value: string }>
  links: ReadonlyArray<{ title: string; url: string }>
}

export interface SearchPage {
  query: string
  language: string
  tab: Tab
  page: number
  hits: ReadonlyArray<Hit>
  answers: ReadonlyArray<string>
  infobox?: InfoboxData
  suggestions: ReadonlyArray<string>
  correction?: string
  elapsedMs: number
  /** Upstream engines that failed, surfaced so degraded results are explainable. */
  failedEngines: ReadonlyArray<string>
  /** Distinguishes a source failure from a successful search with no matches. */
  degraded: boolean
}
