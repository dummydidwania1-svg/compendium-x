'use client'

import Navbar from '@/components/dashboard/Navbar'
import CursorGlow from '@/components/CursorGlow'
import ProfitabilityFramework from '@/components/frameworks/ProfitabilityFramework'

export default function ProfitabilityFrameworkPage() {
  return (
    <>
      <CursorGlow />
      <Navbar currentPage="repository" />
      <ProfitabilityFramework />
    </>
  )
}
