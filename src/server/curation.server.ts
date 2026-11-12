export { BLOCKED_HOSTS, DEMOTED_HOSTS, TRUSTED_HOSTS } from '~/lib/result-policy'

export const matchesHost = (host: string, list: ReadonlyArray<string>): boolean =>
  list.some(h => host === h || host.endsWith(`.${h}`))
