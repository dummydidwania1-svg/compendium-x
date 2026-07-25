'use client'

import ScrollReveal from '@/components/ui/ScrollReveal'
import { useState } from 'react'
import PlatformLoader from '@/components/PlatformLoader'
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
  const isGoalTrackerLocked = false

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
        <main className="mx-auto max-w-[1440px] px-4 pb-12 pt-[70px] md:px-6 lg:px-8">
          {error ? (
            <div className="mx-auto mt-4 max-w-3xl rounded-xl border border-[#b4543e]/15 bg-[rgba(255,244,239,0.9)] px-5 py-3.5 text-[13px] text-[#92400e]">
              {error}
            </div>
          ) : null}

          {null /* preview hint lives on the navbar sign-in button */}


          <IntroBar
            filters={filters}
            setFilters={setFilters}
            hasActiveFilters={hasActiveFilters}
            clearAllFilters={clearAllFilters}
            suppressFloating={feedbackOpen}
          />

          <div className="mt-8 grid grid-cols-1 items-stretch gap-6 md:grid-cols-3 lg:grid-cols-12">
            <div className="flex flex-col gap-6 md:col-span-2 lg:col-span-7 xl:col-span-8">
              <ScrollReveal delay={0}>
                <CoachInsight filters={filters} />
              </ScrollReveal>

              <ScrollReveal delay={100}>
                <div className="relative grid grid-cols-1 gap-6 sm:grid-cols-2">
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

            <div className="flex flex-col gap-6 md:col-span-1 lg:col-span-5 xl:col-span-4">
              <ScrollReveal delay={50} className="shrink-0">
                <GoalTracker isLocked={isGoalTrackerLocked} />
              </ScrollReveal>
              <ScrollReveal delay={150}>
                <CaseHistoryTable filters={caseHistoryFilters} />
              </ScrollReveal>
            </div>
          </div>

          {null /* zero-case prompt lives inside CoachInsight */}
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
