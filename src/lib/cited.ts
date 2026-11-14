export type Segment = { kind: 'text'; text: string } | { kind: 'cite'; n: number }

/** Splits "foo [1][2] bar" into text and citation segments. */
export function splitCitations(text: string): Segment[] {
  const out: Segment[] = []
  let last = 0
  for (const m of text.matchAll(/\[(\d{1,2})\]/g)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) })
    out.push({ kind: 'cite', n: Number(m[1]) })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}
