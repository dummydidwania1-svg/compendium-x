'use client'

import { useActivityHeartbeat } from '@/lib/hooks/useActivityHeartbeat'

export default function ActivityHeartbeat() {
  useActivityHeartbeat()
  return null
}
