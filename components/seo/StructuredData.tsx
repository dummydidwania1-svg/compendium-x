// Organization + WebSite JSON-LD for the homepage.
// alternateName variants teach Google that "Case Compendium X" and
// "casecompendiumx" are the same entity, which fights the
// "did you mean case compendium" autocorrect on search.
export default function StructuredData() {
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Case CompendiumX',
    alternateName: ['Case Compendium X', 'CompendiumX', 'casecompendiumx', 'CCX'],
    url: 'https://www.casecompendiumx.in',
    logo: 'https://www.casecompendiumx.in/logo.png',
    description:
      'AI first consulting case interview platform built by SRCC students. Agents record, transcribe and analyse every mock, surface blind spots and track your goals to the offer. Practice real McKinsey, BCG, Bain, Kearney, L.E.K., Strategy& and Accenture Strategy cases contributed by students across SRCC, Ashoka, St. Stephens, LSR, IIT Delhi and IIT Bombay.',
    foundingDate: '2019',
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
    alternateName: ['Case Compendium X', 'casecompendiumx', 'CompendiumX'],
    url: 'https://www.casecompendiumx.in',
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
    </>
  )
}
