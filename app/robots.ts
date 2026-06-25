import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/onboarding', '/api/'],
    },
    sitemap: 'https://www.casecompendiumx.in/sitemap.xml',
    host: 'https://www.casecompendiumx.in',
  }
}
