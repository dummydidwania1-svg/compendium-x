'use client'

import ScrollReveal from '@/components/ui/ScrollReveal'
import { useState } from 'react'
import PlatformLoader from '@/components/PlatformLoader'
import Link from 'next/link'
import CaseHistoryTable from './CaseHistoryTable'
import CaseScoreCard from './CaseScoreCard'
import CoachInsight from './CoachInsight'
import { DashboardProvider, useDashboard } from './DashboardContext'
import FeedbackAnalyser from './FeedbackAnalyser'
import Footer from './Footer'
import GoalTracker from './GoalTracker'
import HighestScoreCard from './HighestScoreCard'
import IntroBar from './IntroBar'
import LowestScoreCard from './LowestScoreCard'
import Navbar from './Navbar'
import ParameterBarChart from './ParameterBarChart'
import TimeLineChart from './TimeLineChart'

type DashboardFilters = {
  types: string[]
  levels: string[]
  time: string
  customStart: string
  customEnd: string
}

const DEFAULT_FILTERS: DashboardFilters = {
  types: [],
  levels: [],
  time: 'all',
  customStart: '',
  customEnd: '',
}

function DashboardContent() {
  const { authResolved, isPreview, loading, user, error, entries } = useDashboard()
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS)

  const hasActiveFilters = filters.types.length > 0 || filters.levels.length > 0 || filters.time !== 'all'
  const isGoalTrackerLocked = filters.types.length === 0 && filters.levels.length > 0

  const clearAllFilters = () => {
    setFilters(DEFAULT_FILTERS)
  }

  const caseHistoryFilters = {
    ...filters,
    time:
      filters.time === 'last7'
        ? '7d'
        : filters.time === 'last30'
          ? '30d'
          : filters.time,
  }

  if (!authResolved || loading) return <PlatformLoader message="Preparing your dashboard" />

  return (
    <>
      <Navbar currentPage="dashboard" />

      <div className="relative min-h-screen overflow-x-hidden bg-[#fff8f0] font-sans selection:bg-[#3D5A35]/20 selection:text-[#3B2F2F]">
        <main className="mx-auto max-w-[1440px] px-4 pb-12 pt-[70px] lg:px-6">
          {error ? (
            <div className="mx-auto mt-4 max-w-3xl rounded-xl border border-[#b4543e]/15 bg-[rgba(255,244,239,0.9)] px-5 py-3.5 text-[13px] text-[#92400e]">
              {error}
            </div>
          ) : null}

          {isPreview ? (
            <div className="mx-auto mt-4 flex max-w-5xl items-center justify-between gap-4 rounded-[22px] border border-[#3D5A35]/10 bg-[rgba(255,248,240,0.72)] px-5 py-4 backdrop-blur-xl">
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] text-[#3D5A35]">Dashboard Preview</p>
                <p className="mt-1 text-[13px] leading-relaxed text-[#5C4033]/72">
                  You are viewing the sample dashboard journey. Sign in to load your own cases, transcripts, charts, and AI analysis.
                </p>
              </div>
              <Link
                href="/login?redirect=/dashboard"
                className="shrink-0 rounded-full border border-[#3D5A35] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#3D5A35] transition-colors hover:bg-[#3D5A35] hover:text-[#fff8f0]"
              >
                Sign In
              </Link>
            </div>
          ) : null}

      
          <IntroBar
            filters={filters}
            setFilters={setFilters}
            hasActiveFilters={hasActiveFilters}
            clearAllFilters={clearAllFilters}
            suppressFloating={feedbackOpen}
          />

          <div className="mt-8 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
            <div className="flex flex-col gap-6 lg:col-span-8">
              <ScrollReveal delay={0}>
                <CoachInsight filters={filters} />
              </ScrollReveal>

              <ScrollReveal delay={100}>
                <div className="relative grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="flex h-full flex-col gap-4">
                    <CaseScoreCard filters={filters} />
                    <div className="mt-auto grid grid-cols-2 gap-4">
                      <HighestScoreCard filters={filters} />
                      <LowestScoreCard filters={filters} />
                    </div>
                  </div>
                  <ParameterBarChart filters={filters} />
                </div>
              </ScrollReveal>

              <ScrollReveal delay={200} className="flex flex-1 flex-col">
                <TimeLineChart filters={filters} />
              </ScrollReveal>
            </div>

            <div className="flex flex-col gap-6 lg:col-span-4">
              <ScrollReveal delay={50} className="shrink-0">
                <GoalTracker isLocked={isGoalTrackerLocked} />
              </ScrollReveal>
              <ScrollReveal delay={150}>
                <CaseHistoryTable filters={caseHistoryFilters} />
              </ScrollReveal>
            </div>
          </div>

          {entries.length === 0 && user ? (
            <div className="mx-auto mt-8 max-w-3xl rounded-[24px] border border-[#5C4033]/10 bg-[rgba(255,248,240,0.72)] px-8 py-10 text-center">
              <p className="text-[10px] uppercase tracking-[0.28em] text-[#3D5A35]">Dashboard</p>
              <h2
                style={{ fontFamily: "'Newsreader', serif" }}
                className="mt-3 text-3xl font-light tracking-tight text-[#453a2a]"
              >
                No completed cases yet
              </h2>
              <p className="mx-auto mt-3 max-w-[520px] text-[13px] leading-relaxed text-[#5c4033]/62">
                Finish a case and submit interviewer feedback to start populating your charts, history, and analysis.
              </p>
            </div>
          ) : null}
        </main>

        <ScrollReveal delay={300}>
          <Footer currentPage="dashboard" />
        </ScrollReveal>

        <FeedbackAnalyser isOpen={feedbackOpen} setIsOpen={setFeedbackOpen} />
      </div>
    </>
  )
}

export default function DashboardClient() {
  return (
    <DashboardProvider>
      <DashboardContent />
    </DashboardProvider>
  )
}
