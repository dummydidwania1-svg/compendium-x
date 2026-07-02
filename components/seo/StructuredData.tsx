// Organization + WebSite JSON-LD.
// alternateName variants teach Google that "Case Compendium X" and
// "casecompendiumx" are the same entity, which fights the
// "did you mean case compendium" autocorrect on search.
//
// `SiteStructuredData` (Organization + WebSite) is rendered site-wide from the
// root layout so Google resolves the site-name label to "Case CompendiumX" on
// every URL, not just the homepage. `StructuredData` is the homepage default
// export (kept for backwards-compat) and renders the same payload.

const ORIGIN = 'https://www.casecompendiumx.in'

const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Case CompendiumX',
  alternateName: [
    'Case Compendium X', 'CompendiumX', 'Compendium X', 'casecompendiumx', 'CCX',
    'Case Compendium', 'CaseCompendium', 'Compendium', 'Case Compendium SRCC',
    'CaseCompendium SRCC', 'Compendium SRCC', 'SRCC Case Compendium',
    'Case Compendium 2nd Edition', 'Case CompendiumX 2nd Edition',
    'Case Compendium X 2nd Edition', 'Case Compendium 3rd Edition',
  ],
  url: ORIGIN,
  logo: `${ORIGIN}/logo.png`,
  description:
    'AI first consulting case interview platform built by SRCC students. Agents record, transcribe and analyse every mock, surface blind spots and track your goals to the offer. Practice real McKinsey, BCG, Bain, Kearney, L.E.K., Strategy& and Accenture Strategy cases contributed by students across SRCC, Ashoka, St. Stephens, LSR, IIT Delhi and IIT Bombay.',
  foundingDate: '2021',
  areaServed: 'IN',
  knowsAbout: [
    'Case interview preparation',
    'Management consulting recruiting',
    'Structured problem solving',
    'Market sizing and guesstimates',
  ],
}

const website = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Case CompendiumX',
  alternateName: [
    'Case Compendium X', 'CompendiumX', 'Compendium X', 'casecompendiumx', 'CCX',
    'Case Compendium', 'CaseCompendium', 'Compendium', 'Case Compendium SRCC',
    'CaseCompendium SRCC', 'Compendium SRCC', 'SRCC Case Compendium',
    'Case Compendium 2nd Edition', 'Case CompendiumX 2nd Edition',
    'Case Compendium X 2nd Edition', 'Case Compendium 3rd Edition',
  ],
  url: ORIGIN,
}

function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

/** Organization + WebSite schema, safe to render on every page (root layout). */
export function SiteStructuredData() {
  return (
    <>
      <JsonLd data={organization} />
      <JsonLd data={website} />
    </>
  )
}

/**
 * BreadcrumbList JSON-LD. Pass an ordered list of { name, path } crumbs
 * (path relative to origin, e.g. '/repository'). Helps Google render the
 * breadcrumb trail under the result instead of a bare URL.
 */
export function BreadcrumbStructuredData({
  items,
}: {
  items: Array<{ name: string; path: string }>
}) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${ORIGIN}${item.path}`,
    })),
  }
  return <JsonLd data={data} />
}

/**
 * ItemList JSON-LD for the case library — enumerates case URLs so Google
 * understands /repository as a collection page.
 */
export function CaseListStructuredData({
  cases,
}: {
  cases: Array<{ name: string; path: string }>
}) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Case CompendiumX Case Library',
    numberOfItems: cases.length,
    itemListElement: cases.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      url: `${ORIGIN}${c.path}`,
    })),
  }
  return <JsonLd data={data} />
}

// Homepage default export — same Organization + WebSite payload.
export default function StructuredData() {
  return <SiteStructuredData />
}
