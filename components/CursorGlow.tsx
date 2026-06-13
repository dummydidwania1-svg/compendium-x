'use client'

import { useEffect } from 'react'

// Reusable brown cursor-glow dot — identical to the landing page.
// CSS lives in app/globals.css (#ccx-cursor-glow). This only handles the
// motion + lifecycle so it can be dropped onto any page.
export default function CursorGlow() {
  useEffect(() => {
    // No real cursor on touch devices — skip entirely.
    if (typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches) {
      return
    }

    let glow = document.getElementById('ccx-cursor-glow')
    if (!glow) {
      glow = document.createElement('div')
      glow.id = 'ccx-cursor-glow'
      document.body.appendChild(glow)
    }

    const onMove = (e: MouseEvent) => {
      glow!.style.left = e.clientX + 'px'
      glow!.style.top = e.clientY + 'px'
      glow!.classList.add('active')
    }
    const onLeaveDoc = () => glow!.classList.remove('active')

    document.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('mouseleave', onLeaveDoc)

    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeaveDoc)
      glow?.remove()
    }
  }, [])

  return null
}