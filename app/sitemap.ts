import type { MetadataRoute } from 'next'
import casesData from '@/data/cases.json'
import { slugifyCase } from '@/lib/slug'

const BASE_URL = 'https://www.casecompendiumx.in'

const FRAMEWORK_SLUGS = [
  'profitability',
  'market-entry',
  'growth',
  'pricing',
  'unconventional',
  'guesstimate',
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const cases = casesData as Array<{ title?: string; slug?: string; updatedAt?: string; createdAt?: string }>
  const buildDate = new Date()

  const caseUrls: MetadataRoute.Sitemap = cases
    .map((c) => {
      const slug = c.slug?.trim() || slugifyCase(c.title ?? '')
      if (!slug) return null
      // Prefer the case's own timestamp so Google detects edits; fall back to
      // the build date so newly added cases signal freshness on each deploy.
      const stamp = c.updatedAt || c.createdAt
      const lastModified = stamp ? new Date(stamp) : buildDate
      return {
        url: `${BASE_URL}/case/${slug}`,
        lastModified,
        changeFrequency: 'monthly' as const,
        priority: 0.8,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  const frameworkUrls: MetadataRoute.Sitemap = FRAMEWORK_SLUGS.map((slug) => ({
    url: `${BASE_URL}/repository/frameworks/${slug}`,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  return [
    {
      url: BASE_URL,
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${BASE_URL}/repository`,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    ...frameworkUrls,
    ...caseUrls,
    {
      url: `${BASE_URL}/our-story`,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/about-ccx`,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/collaborators`,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${BASE_URL}/login`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]
}
