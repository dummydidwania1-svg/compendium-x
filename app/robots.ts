import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
      '/dashboard',
      '/onboarding',
      '/api/',
      '/lobby/',
      '/case/*/workspace',
      '/case/*/interviewer',
      '/x',
    ],
    },
    sitemap: 'https://www.casecompendiumx.in/sitemap.xml',
    host: 'https://www.casecompendiumx.in',
  }
}
