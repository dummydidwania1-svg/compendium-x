'use client'

import HomePage from '@/components/HomePage'
import Navbar from '@/components/dashboard/Navbar'

export default function LandingPage() {
  return (
    <>
      <Navbar currentPage="home" />
      <HomePage />
    </>
  )
}
