'use client'

import Footer from '@/components/dashboard/Footer'
import Navbar from '@/components/dashboard/Navbar'

const POLICY_SECTIONS = [
  {
    title: '1. Scope',
    paragraphs: [
      'This Privacy Policy explains how Case CompendiumX collects, uses, stores, and shares information when you visit our website, create an account, browse cases, participate in practice sessions, upload recordings or images, post in forums, or otherwise use our services.',
      'This policy applies to the public website, authenticated product experience, and related communications operated under the Compendium X brand.',
    ],
  },
  {
    title: '2. Information We Collect',
    bullets: [
      'Account and profile information, such as your name, email address, university, and goal settings.',
      'Case practice data, including sessions, interviewer and candidate coordination details, evaluation scores, notes, and progress history.',
      'Audio, transcripts, and uploaded materials, including session recordings, AI-generated transcripts, and workspace images you choose to upload.',
      'Community content, such as comments, replies, votes, and other material you post in case discussion forums.',
      'Technical and usage information, such as device, browser, log, and interaction data used to operate and improve the service.',
    ],
  },
  {
    title: '3. How We Use Information',
    bullets: [
      'To create and manage accounts and authenticate users.',
      'To run case interview sessions, generate transcripts, save evaluations, and display progress history.',
      'To personalize the launchpad, dashboard, and other product experiences.',
      'To support forum participation, customer support, security monitoring, and fraud prevention.',
      'To improve product quality, reliability, and performance over time.',
    ],
  },
  {
    title: '4. AI and Transcript Processing',
    paragraphs: [
      'Compendium X may process session audio and related materials using third-party AI and cloud infrastructure in order to generate transcripts, structure session records, and support practice analytics.',
      'We do not sell your personal information. We use service providers only to operate, secure, and improve the platform.',
    ],
  },
  {
    title: '5. How We Share Information',
    bullets: [
      'With service providers that help us operate the platform, such as hosting, authentication, storage, analytics, and AI processing vendors.',
      'With the practice participants involved in a session, to the extent needed to run that session and show related evaluations or shared materials.',
      'With other users when you choose to post in public or community-facing forum areas.',
      'When required by law, regulation, legal process, or to protect the rights, safety, and security of Compendium X, our users, or others.',
    ],
  },
  {
    title: '6. Data Retention',
    paragraphs: [
      'We retain information for as long as reasonably necessary to provide the service, maintain practice history, comply with legal obligations, resolve disputes, and enforce our agreements.',
      'Retention periods may vary depending on the type of data, your account status, and operational or legal requirements.',
    ],
  },
  {
    title: '7. Security',
    paragraphs: [
      'We use reasonable administrative, technical, and organizational measures designed to protect information against unauthorized access, loss, misuse, or alteration. No internet-based system can be guaranteed completely secure, so we encourage users to use strong passwords and protect their account credentials.',
    ],
  },
  {
    title: '8. Your Choices and Rights',
    bullets: [
      'You may update certain profile details inside the product.',
      'You may request access to or deletion of your account data by contacting us.',
      'If you no longer want to use the service, you may ask us to delete your account and associated personal data, subject to any legal or operational retention requirements.',
    ],
  },
  {
    title: '9. Children',
    paragraphs: [
      'Compendium X is intended for students, graduates, and other users preparing for consulting interviews. It is not directed to children under 13, and we do not knowingly collect personal information from children under 13.',
    ],
  },
  {
    title: '10. Changes to This Policy',
    paragraphs: [
      'We may update this Privacy Policy from time to time. If we make material changes, we may revise the effective date on this page and, where appropriate, provide additional notice.',
    ],
  },
  {
    title: '11. Contact',
    paragraphs: [
      'If you have questions about this Privacy Policy or would like to request deletion of your account data, please contact us at contact@casecompendiumx.com.',
    ],
  },
]

export default function PrivacyPolicyPage() {
  return (
    <>
      <Navbar currentPage="privacy" />
      <div
        style={{ fontFamily: "'Work Sans', sans-serif", background: '#fff8f0', color: '#1e1b15' }}
        className="min-h-screen pt-[70px] antialiased"
      >
        <main>
          <section className="px-8 py-20">
            <div className="mx-auto max-w-4xl">
              <div className="rounded-[28px] border border-[#3D5A35]/10 bg-[linear-gradient(135deg,rgba(61,90,53,0.06),rgba(255,248,240,0.88)_34%,rgba(69,58,42,0.05)_100%)] px-8 py-12 md:px-12 md:py-14">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.28em] text-[#3D5A35]/60">
                  Legal
                </span>
                <h1
                  className="mt-4 text-5xl tracking-tight text-[#453a2a] md:text-7xl"
                  style={{ fontFamily: "'Newsreader', serif", lineHeight: 1.02 }}
                >
                  Privacy Policy
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-7 text-[#434840] md:text-lg">
                  This page explains what information Compendium X collects, how we use it, when
                  we share it, and how users can request support or deletion.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <span className="rounded-full border border-[#3D5A35]/15 bg-white/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#3D5A35]">
                    Effective March 27, 2026
                  </span>
                  <a
                    href="mailto:contact@casecompendiumx.com?subject=Compendium%20X%20Privacy%20Request"
                    className="rounded-full border border-[#453a2a]/10 bg-[#fff8f0] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#453a2a] transition hover:border-[#3D5A35]/30 hover:text-[#3D5A35]"
                  >
                    Contact Privacy Team
                  </a>
                </div>
              </div>
            </div>
          </section>

          <section className="px-8 pb-24">
            <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
              <aside className="h-fit rounded-[24px] border border-[#3D5A35]/10 bg-[#f4ede3] p-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#3D5A35]/55">
                  At a glance
                </p>
                <ul className="mt-5 space-y-3 text-sm leading-6 text-[#434840]">
                  <li>We collect account, session, transcript, and community data needed to run the product.</li>
                  <li>We use Firebase, cloud infrastructure, and AI processing tools to operate key features.</li>
                  <li>Users can contact us to request account deletion or privacy support.</li>
                </ul>
              </aside>

              <div className="space-y-5">
                {POLICY_SECTIONS.map((section) => (
                  <section
                    key={section.title}
                    className="rounded-[24px] border border-[#3D5A35]/10 bg-[#fffdf9] px-6 py-7 shadow-[0_12px_36px_rgba(69,58,42,0.05)] md:px-8"
                  >
                    <h2
                      className="text-2xl text-[#453a2a] md:text-3xl"
                      style={{ fontFamily: "'Newsreader', serif", lineHeight: 1.1 }}
                    >
                      {section.title}
                    </h2>

                    {section.paragraphs?.map((paragraph) => (
                      <p key={paragraph} className="mt-4 text-sm leading-7 text-[#434840] md:text-[15px]">
                        {paragraph}
                      </p>
                    ))}

                    {section.bullets ? (
                      <ul className="mt-4 space-y-3">
                        {section.bullets.map((bullet) => (
                          <li key={bullet} className="flex gap-3 text-sm leading-7 text-[#434840] md:text-[15px]">
                            <span className="mt-[10px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#3D5A35]" />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ))}
              </div>
            </div>
          </section>
        </main>

        <Footer currentPage="privacy" />
      </div>
    </>
  )
}
