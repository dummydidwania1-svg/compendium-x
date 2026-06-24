'use client'

import Navbar from '@/components/dashboard/Navbar'
import CursorGlow from '@/components/CursorGlow'
import UnconventionalFramework from '@/components/frameworks/UnconventionalFramework'

export default function UnconventionalFrameworkPage() {
  return (
    <>
      <CursorGlow />
      <Navbar currentPage="repository" />
      <UnconventionalFramework />
    </>
  )
}
