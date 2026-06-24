'use client'

import Navbar from '@/components/dashboard/Navbar'
import CursorGlow from '@/components/CursorGlow'
import GrowthFramework from '@/components/frameworks/GrowthFramework'

export default function GrowthFrameworkPage() {
  return (
    <>
      <CursorGlow />
      <Navbar currentPage="repository" />
      <GrowthFramework />
    </>
  )
}
