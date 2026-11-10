import { z } from 'zod'
import { TABS, TIME_RANGES } from './types'

/** The URL is the single source of truth for a search. */
export const searchParamsSchema = z.object({
  q: z.string().trim().max(200).catch(''),
  tab: z.enum(TABS).catch('all'),
  page: z.coerce.number().int().min(1).max(10).catch(1),
  time: z.enum(TIME_RANGES).catch('any'),
  lang: z
    .string()
    .regex(/^(?:auto|all|[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2})$/)
    .catch('auto'),
})

export type SearchParams = z.infer<typeof searchParamsSchema>

/** Parses leniently: any invalid or missing field falls back to its default. */
export const parseSearchParams = (raw: unknown): SearchParams => searchParamsSchema.parse(raw ?? {})

export const DEFAULT_SEARCH: SearchParams = parseSearchParams({})
