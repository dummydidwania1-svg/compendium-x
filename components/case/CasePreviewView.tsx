'use client'

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/dashboard/Navbar'
import CasePreviewMaster from '@/components/case/CasePreviewMaster'

type TranscriptSpeaker = 'candidate' | 'interviewer' | 'neutral'
type TranscriptDisplayLine = { text: string; speaker: TranscriptSpeaker }
type ParsedFramework = {
  transcriptLines: string[]
  summaryTitle: string | null
  summaryRows: Array<{ label: string; value: string }>
  recommendations: string[]
}

type CasePreviewProps = {
  caseData: { title: string; prompt?: string; framework?: string }
  previewMode: boolean
  transcriptDisplayLines: TranscriptDisplayLine[]
  parsedFramework: ParsedFramework
  promptLines: string[]
  caseTypeLabel: string
  industryLabel: string
  difficultyLabel: string
  companyLabel: string
  roundLabel: string
  isBankingOnYou: boolean
  ForumSection?: ReactNode
}

function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setVisible(true)
        observer.disconnect()
      },
      { rootMargin: '0px 0px -60px 0px', threshold: 0.1 }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
        filter: visible ? 'blur(0px)' : 'blur(8px)',
        transition:
          'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1), filter 0.6s ease',
        willChange: 'opacity, transform, filter',
      }}
    >
      {children}
    </div>
  )
}

function GenericCasePreview({
  caseData,
  previewMode,
  transcriptDisplayLines,
  parsedFramework,
  promptLines,
  caseTypeLabel,
  industryLabel,
  difficultyLabel,
  companyLabel,
  roundLabel,
  ForumSection,
}: Omit<CasePreviewProps, 'isBankingOnYou'>) {
  const router = useRouter()
  const [introPhase, setIntroPhase] = useState(0)

  useEffect(() => {
    const showTagsTimer = window.setTimeout(() => setIntroPhase(1), 800)
    const settleTimer = window.setTimeout(() => setIntroPhase(2), 2000)

    return () => {
      window.clearTimeout(showTagsTimer)
      window.clearTimeout(settleTimer)
    }
  }, [])

  const allLines = useMemo<TranscriptDisplayLine[]>(
    () => [
      ...promptLines.map((line) => ({ text: line, speaker: 'interviewer' as const })),
      ...transcriptDisplayLines,
    ],
    [promptLines, transcriptDisplayLines]
  )

  const tags = useMemo(
    () => [
      { label: 'Type', value: caseTypeLabel },
      { label: 'Industry', value: industryLabel },
      { label: 'Level', value: difficultyLabel },
      ...(companyLabel !== 'Client Not Specified' ? [{ label: 'Company', value: companyLabel }] : []),
      ...(roundLabel !== 'Round Not Specified' ? [{ label: 'Round', value: roundLabel }] : []),
    ],
    [caseTypeLabel, companyLabel, difficultyLabel, industryLabel, roundLabel]
  )

  return (
    <div
      style={{ fontFamily: "'Work Sans', sans-serif" }}
      className="min-h-screen bg-[#fff8f0] text-[#1e1b15] antialiased selection:bg-[#3D5A35]/20 selection:text-[#3B2F2F]"
    >
      <style>{`
        @keyframes case-tag-in {
          from { opacity: 0; transform: translateY(8px) scale(0.95); filter: blur(4px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
      `}</style>

      <Navbar currentPage="repository" />

      <div
        className="sticky top-[70px] z-40 border-b border-[#5C4033]/6 transition-all duration-700"
        style={{
          background: 'rgba(255,248,240,0.88)',
          backdropFilter: 'blur(20px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
          opacity: introPhase >= 2 ? 1 : 0,
          transform: introPhase >= 2 ? 'translateY(0)' : 'translateY(-10px)',
        }}
      >
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-2 lg:px-6">
          <Link
            href="/repository"
            className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#5C4033]/50 transition hover:text-[#3D5A35]"
          >
            ← Exit Case
          </Link>
          <div className="flex items-center gap-3">
            {previewMode && (
              <button
                type="button"
                onClick={() => router.push('/practice')}
                className="rounded-full border border-[#3D5A35]/15 bg-[#3D5A35]/4 px-3 py-1 text-[9px] font-medium uppercase tracking-[0.14em] text-[#3D5A35]/60 transition-all hover:bg-[#3D5A35]/8"
              >
                Practice This Case
              </button>
            )}
            <span className="text-[7px] tracking-[0.1em] font-semibold px-1.5 py-[1px] rounded-sm border border-[#C4A882]/30 text-[#C4A882] bg-[#C4A882]/8 leading-tight uppercase">
              {previewMode ? 'Preview' : 'Interviewer'}
            </span>
          </div>
        </div>
      </div>

      <div
        className="transition-all duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          minHeight: introPhase < 2 ? 'calc(100vh - 70px)' : '0',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: introPhase < 2 ? 'center' : 'flex-start',
          alignItems: introPhase < 2 ? 'center' : 'flex-start',
          padding: introPhase < 2 ? '0 2rem' : '2rem 0 0 0',
        }}
      >
        <div
          className="transition-all duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            textAlign: introPhase < 2 ? 'center' : 'left',
            maxWidth: introPhase < 2 ? '800px' : '1440px',
            width: '100%',
            padding: introPhase >= 2 ? '0 1.5rem' : '0',
            margin: introPhase >= 2 ? '0 auto' : '0',
          }}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2.5" style={{ justifyContent: introPhase < 2 ? 'center' : 'flex-start' }}>
            <span
              className="text-[10px] uppercase tracking-[0.28em] text-[#3D5A35] font-semibold transition-opacity duration-500"
              style={{ opacity: introPhase >= 1 ? 0.7 : 0 }}
            >
              Case
            </span>
          </div>
          <h1
            style={{
              fontFamily: "'Newsreader', serif",
              opacity: 1,
              transform: 'translateY(0)',
              filter: 'blur(0)',
              transition: 'all 0.8s cubic-bezier(0.22,1,0.36,1)',
              fontSize: introPhase < 2 ? '3.5rem' : '2.8rem',
              lineHeight: 1.05,
            }}
            className="mb-5 font-light tracking-tight text-[#453a2a]"
          >
            {caseData.title.trim()}
          </h1>

          <div
            className="mb-4 flex flex-wrap gap-3 transition-all duration-700"
            style={{ justifyContent: introPhase < 2 ? 'center' : 'flex-start' }}
          >
            {tags.map((tag, index) => (
              <div
                key={tag.label}
                className="flex items-center gap-1.5"
                style={{
                  animation:
                    introPhase >= 1
                      ? `case-tag-in 0.5s cubic-bezier(0.22,1,0.36,1) ${index * 120}ms both`
                      : 'none',
                  opacity: introPhase >= 1 ? undefined : 0,
                }}
              >
                <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#5C4033]/40">
                  {tag.label}
                </span>
                <span className="rounded-md border border-[#5C4033]/12 bg-[#D9D0C4]/25 px-2.5 py-[3px] text-[10px] font-medium text-[#5C4033]/70">
                  {tag.value}
                </span>
              </div>
            ))}
          </div>

          <div
            className="flex items-center gap-5 transition-all duration-500"
            style={{
              opacity: introPhase >= 1 ? 1 : 0,
              justifyContent: introPhase < 2 ? 'center' : 'flex-start',
              transitionDelay: '400ms',
            }}
          >
            <div className="flex items-center gap-2">
              <div className="h-[6px] w-3 rounded-sm bg-[#3B2F2F]" />
              <span className="text-[9px] text-[#5C4033]/45">Interviewer</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-[6px] w-3 rounded-sm bg-[#434840]/30" />
              <span className="text-[9px] text-[#5C4033]/45">Candidate</span>
            </div>
          </div>
        </div>
      </div>

      <main
        className="mx-auto max-w-[1440px] px-4 pb-20 transition-opacity duration-700 lg:px-6"
        style={{ opacity: introPhase >= 2 ? 1 : 0 }}
      >
        <section className="mb-24">
          <Reveal>
            <div className="mb-8 flex items-center gap-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#3D5A35]">
                Walkthrough
              </span>
              <div className="h-[1px] flex-1" style={{ background: 'linear-gradient(90deg, rgba(61,90,53,0.15), transparent)' }} />
            </div>
          </Reveal>

          <div className="max-w-3xl space-y-6">
            {allLines.map((entry, index) => {
              const isInterviewer = entry.speaker === 'interviewer'
              const normalized = entry.text.trim()

              if (!normalized) return null

              if (/^[A-Z][A-Z0-9\s&'/-]{6,}$/.test(normalized)) {
                return (
                  <Reveal key={`section-${index}`}>
                    <div className="pt-8 pb-2">
                      <h4 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#3D5A35]/50">{normalized}</h4>
                      <div className="mt-2 h-[1px] w-12" style={{ background: 'linear-gradient(90deg, rgba(61,90,53,0.2), transparent)' }} />
                    </div>
                  </Reveal>
                )
              }

              if (normalized.includes('=') && /[*xX]/.test(normalized)) {
                return (
                  <Reveal key={`equation-${index}`}>
                    <div className="rounded-xl border border-[#D9D0C4]/40 bg-[#f4ede3] px-6 py-4">
                      <p className="font-mono text-[15px] leading-relaxed tracking-wide text-[#3B2F2F]">{normalized}</p>
                    </div>
                  </Reveal>
                )
              }

              const bulletMatch = normalized.match(/^(\d+[\).]|[-•])\s*(.+)$/)
              if (bulletMatch) {
                return (
                  <Reveal key={`bullet-${index}`}>
                    <div className={`ml-6 flex gap-4 ${isInterviewer ? 'text-[#3B2F2F]' : 'text-[#434840]'}`}>
                      <span className="min-w-[1.5rem] text-[15px] font-semibold text-[#5C4033]/50">
                        {bulletMatch[1]}
                      </span>
                      <p className="text-[16px] leading-[1.8]">{bulletMatch[2]}</p>
                    </div>
                  </Reveal>
                )
              }

              return (
                <Reveal key={`line-${index}`}>
                  <p className={`text-[16px] leading-[1.8] ${isInterviewer ? 'font-semibold text-[#3B2F2F]' : 'text-[#434840]'}`}>
                    {normalized}
                  </p>
                </Reveal>
              )
            })}
          </div>
        </section>

        <section className="mb-24">
          <Reveal>
            <div className="mb-8 flex items-center gap-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#3D5A35]">
                Framework
              </span>
              <div className="h-[1px] flex-1" style={{ background: 'linear-gradient(90deg, rgba(61,90,53,0.15), transparent)' }} />
            </div>
          </Reveal>

          {parsedFramework.summaryRows.length > 0 ? (
            <Reveal>
              <div className="max-w-3xl space-y-3">
                {parsedFramework.summaryTitle ? (
                  <h4 className="mb-4 text-[15px] font-semibold text-[#3B2F2F]">{parsedFramework.summaryTitle}</h4>
                ) : null}
                {parsedFramework.summaryRows.map((row, index) => (
                  <div key={`${row.label}-${index + 1}`} className="flex gap-4">
                    <span className="min-w-[140px] text-[13px] font-semibold text-[#5C4033]">{row.label}</span>
                    <span className="text-[13px] text-[#434840]">{row.value}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          ) : null}
        </section>

        {parsedFramework.recommendations.length > 0 ? (
          <section className="mb-24">
            <Reveal>
              <div className="mb-8 flex items-center gap-4">
                <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#3D5A35]">
                  Recommendations
                </span>
                <div className="h-[1px] flex-1" style={{ background: 'linear-gradient(90deg, rgba(61,90,53,0.15), transparent)' }} />
              </div>
            </Reveal>
            <div className="max-w-3xl space-y-5">
              {parsedFramework.recommendations.map((item, index) => (
                <Reveal key={`${item}-${index + 1}`}>
                  <div className="flex items-start gap-4 rounded-xl border border-[#5C4033]/6 bg-[rgba(255,248,240,0.5)] px-6 py-5 backdrop-blur-sm">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#3D5A35]/8 text-[10px] font-semibold text-[#3D5A35]/60">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[15px] leading-[1.7] text-[#434840]">{item}</span>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>
        ) : null}

        {ForumSection ? <Reveal>{ForumSection}</Reveal> : null}
      </main>
    </div>
  )
}

export default function CasePreviewView(props: CasePreviewProps) {
  if (props.isBankingOnYou) {
    return <CasePreviewMaster {...props} />
  }

  return <GenericCasePreview {...props} />
}
