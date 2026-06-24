'use client'

import Navbar from '@/components/dashboard/Navbar'
import CursorGlow from '@/components/CursorGlow'
import MarketEntryFramework from '@/components/frameworks/MarketEntryFramework'

export default function MarketEntryFrameworkPage() {
  return (
    <>
      <CursorGlow />
      <Navbar currentPage="repository" />
      <MarketEntryFramework />
    </>
  )
}
