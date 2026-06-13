'use client'

import Navbar from '@/components/dashboard/Navbar'
import CursorGlow from '@/components/CursorGlow'
import OurStory from '@/components/OurStory'

export default function OurStoryPage() {
  return (
    <>
      <CursorGlow />
      <Navbar currentPage={'about'} />
      <OurStory />
    </>
  )
}