'use client'

import Navbar from '@/components/dashboard/Navbar'
import CursorGlow from '@/components/CursorGlow'
import PricingFramework from '@/components/frameworks/PricingFramework'

export default function PricingFrameworkPage() {
  return (
    <>
      <CursorGlow />
      <Navbar currentPage="repository" />
      <PricingFramework />
    </>
  )
}
