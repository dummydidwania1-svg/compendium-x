'use client'

import AboutPage from '@/components/AboutPage'
import Navbar from '@/components/dashboard/Navbar'

export default function AboutRoute() {
  return (
    <>
      <Navbar currentPage="about" />
      <AboutPage />
    </>
  )
}
