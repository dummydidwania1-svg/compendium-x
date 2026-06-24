'use client'

import Navbar from '@/components/dashboard/Navbar'
import CursorGlow from '@/components/CursorGlow'
import GuesstimateFramework from '@/components/frameworks/GuesstimateFramework'

export default function GuesstimateFrameworkPage() {
  return (
    <>
      <CursorGlow />
      <Navbar currentPage="repository" />
      <GuesstimateFramework />
    </>
  )
}
