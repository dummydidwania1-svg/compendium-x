import type { Metadata } from 'next'
import casesData from '@/data/cases.json'
import { slugifyCase } from '@/lib/slug'

/**
 * Per-case SEO metadata. This is a SERVER layout wrapping the client case page,
 * so it can export generateMetadata (the page itself stays 'use client').
 *
 * The slug -> case map is built once at module load directly from
 * data/cases.json, keyed by the same slugifyCase used across the app and the
 * sitemap. This means ANY case added to cases.json in the future is covered
 * automatically on the next deploy — no per-case code edits, ever.
 */
type CaseRecord = {
  title?: string
  slug?: string
  industry?: string
  case_type?: string
  company?: string
  round?: string
  prompt?: string
}

const CASE_BY_SLUG: Record<string, CaseRecord> = (() => {
  const map: Record<string, CaseRecord> = {}
  for (const c of casesData as CaseRecord[]) {
    const slug = c.slug?.trim() || slugifyCase(c.title ?? '')
    if (slug) map[slug] = c
  }
  return map
})()

// Strip any em/en dashes defensively (prompts are dash-free today, but titles
// or future prompts might not be) and collapse whitespace.
function sanitize(text: string): string {
  return text
    .replace(/[—–]/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function buildDescription(c: CaseRecord): string {
  const parts: string[] = []
  const type = c.case_type?.trim()
  const industry = c.industry?.trim()
  const company = c.company?.trim()
  const round = c.round?.trim()

  // "<type> case in <industry> (<company>, <round> round)."
  let lead = ''
  if (type && industry) lead = `${type} case in ${industry}`
  else if (type) lead = `${type} case`
  else if (industry) lead = `Case in ${industry}`
  else lead = 'Consulting case interview'

  const tag: string[] = []
  if (company) tag.push(company)
  if (round) tag.push(`${round} round`)
  if (tag.length) lead += ` (${tag.join(', ')})`
  parts.push(`${lead}.`)

  if (c.prompt?.trim()) parts.push(c.prompt.trim())

  return sanitize(parts.join(' '))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const c = CASE_BY_SLUG[id]

  // Unknown slug (legacy /case/case-1 docId links, or not-yet-deployed case):
  // fall back to root metadata so nothing breaks.
  if (!c || !c.title) return {}

  const title = sanitize(c.title)
  const description = buildDescription(c)
  const canonical = `/case/${id}`
  const url = `https://www.casecompendiumx.in${canonical}`

  return {
    title, // template prepends "Case CompendiumX: "
    description,
    alternates: { canonical },
    openGraph: {
      title: `Case CompendiumX: ${title}`,
      description,
      url,
    },
    twitter: {
      title: `Case CompendiumX: ${title}`,
      description,
    },
  }
}

export default function CaseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
