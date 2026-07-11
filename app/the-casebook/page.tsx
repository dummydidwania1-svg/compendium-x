'use client'
import TheCasebook from '@/components/TheCasebook'
import Navbar from '@/components/dashboard/Navbar'

export default function TheCasebookPage() {
  return (
    <>
      <Navbar currentPage="the-casebook" />
      <TheCasebook />
    </>
  )
}
