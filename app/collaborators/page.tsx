'use client'

import Collaborators from '@/components/Collaborators'
import Navbar from '@/components/dashboard/Navbar'
import CursorGlow from '@/components/CursorGlow'

export default function CollaboratorsPage() {
  return (
    <>
      <CursorGlow />
      <Navbar currentPage="collaborators" />
      <Collaborators />
    </>
  )
}
