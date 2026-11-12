/** Default global policy; administrators can replace each list in settings. */
export const TRUSTED_HOSTS = [
  'github.com',
  'stackoverflow.com',
  'developer.mozilla.org',
  'wikipedia.org',
  'rust-lang.org',
  'docs.rs',
  'python.org',
  'nodejs.org',
  'kernel.org',
  'arxiv.org',
] as const

export const BLOCKED_HOSTS = [
  'pinterest.com',
  'quora.com',
  'csdn.net',
  'baijiahao.baidu.com',
  'jingyan.baidu.com',
] as const

export const DEMOTED_HOSTS = ['medium.com', 'w3schools.com', 'geeksforgeeks.org'] as const
