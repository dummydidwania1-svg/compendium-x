import type { MetadataRoute } from 'next'

const BASE = 'https://www.casecompendiumx.in'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE}/repository`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE}/practice`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/our-story`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/collaborators`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/login`, lastModified: now, changeFrequency: 'yearly', priority: 0.6 },
  ]
}
