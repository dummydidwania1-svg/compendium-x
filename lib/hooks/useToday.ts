'use client'

/**
 * Local-midnight "today", re-derived whenever the calendar day actually
 * changes — not frozen at mount. A goal-tracker tab left open past midnight
 * (or a device that wakes from sleep the next day) would otherwise keep
 * computing pace/streak/days-remaining against yesterday until a full page
 * reload. Polls on a timer and re-checks on tab-focus/visibility, so it
 * catches both "left running overnight" and "device was asleep."
 */
import { useEffect, useState } from 'react'
import { startOfDay } from '@/lib/goalTracker/engine'

export function useToday(): Date {
  const [today, setToday] = useState(() => startOfDay(new Date()))

  useEffect(() => {
    const check = () => {
      const now = startOfDay(new Date())
      setToday((prev) => (prev.getTime() === now.getTime() ? prev : now))
    }
    const interval = setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [])

  return today
}
