const CJK = /[㐀-鿿豈-﫿]/g

/** Fraction of characters that are CJK ideographs, ignoring whitespace. */
export function cjkRatio(text: string): number {
  const compact = text.replace(/\s+/g, '')
  if (compact.length === 0) return 0
  return (compact.match(CJK)?.length ?? 0) / compact.length
}

export const isChinese = (text: string): boolean => cjkRatio(text) >= 0.2
