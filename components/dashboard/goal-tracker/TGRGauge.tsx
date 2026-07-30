import type { PaceBand } from '@/lib/goalTracker/engine'

/**
 * Pace donut/gauge (visual Option B, §6) — moved out of GoalTracker.tsx so
 * it's reusable across Flow 1 and Flow 3's total side. Same SVG geometry as
 * the original TGR gauge, now fed the locked PaceResult.pace ratio directly
 * (pace >= 1 is good here, the inverse sense of the old TGR metric) and
 * colored from the 5 locked pace bands instead of the old 4-zone TGR scale.
 */
const BAND_META: Record<PaceBand, { color: string }> = {
  ahead: { color: '#3D5A35' },
  onTrack: { color: '#A5B9A0' },
  slightlyBehind: { color: '#C4A882' },
  behind: { color: '#C47A6A' },
  atRisk: { color: '#B85C5C' },
}

// Pace ratio mapped onto the gauge's 0-2 arc: 0 = far behind, 1 = exactly on
// pace, 2 = well ahead (capped). Band boundaries translate to arc segments.
const BAND_SEGMENTS: { t1: number; t2: number; band: PaceBand }[] = [
  { t1: 0, t2: 0.5, band: 'atRisk' },
  { t1: 0.5, t2: 0.75, band: 'behind' },
  { t1: 0.75, t2: 0.9, band: 'slightlyBehind' },
  { t1: 0.9, t2: 1.15, band: 'onTrack' },
  { t1: 1.15, t2: 2, band: 'ahead' },
]

export default function TGRGauge({ pace, band }: { pace: number; band: PaceBand }) {
  const CX = 100
  const CY = 88
  const RO = 66
  const RI = 50
  const pt = (t: number, r: number): [number, number] => {
    const a = (Math.PI / 180) * 90 * (2 - Math.min(t, 2))
    return [+(CX + r * Math.cos(a)).toFixed(2), +(CY - r * Math.sin(a)).toFixed(2)]
  }
  const seg = (t1: number, t2: number) => {
    const [ox1, oy1] = pt(t1, RO)
    const [ox2, oy2] = pt(t2, RO)
    const [ix1, iy1] = pt(t2, RI)
    const [ix2, iy2] = pt(t1, RI)
    return `M ${ox1} ${oy1} A ${RO} ${RO} 0 0 0 ${ox2} ${oy2} L ${ix1} ${iy1} A ${RI} ${RI} 0 0 1 ${ix2} ${iy2} Z`
  }
  const capped = Math.min(pace, 2)
  const [nx, ny] = pt(capped, RO - 10)

  return (
    <svg viewBox="18 18 164 74" width="100%">
      <path d={seg(0, 2)} fill="#5C4033" opacity={0.04} />
      {BAND_SEGMENTS.map((s) => (
        <path
          key={s.band}
          d={seg(s.t1, s.t2)}
          fill={BAND_META[s.band].color}
          opacity={band === s.band ? 0.72 : 0.22}
        />
      ))}
      {BAND_SEGMENTS.map(
        (s) => band === s.band && <path key={`h${s.band}`} d={seg(s.t1, s.t2)} fill="white" opacity={0.12} />,
      )}
      <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="#3B2F2F" strokeWidth={1.6} strokeLinecap="round" opacity={0.5} />
      <circle cx={CX} cy={CY} r={2.5} fill="#3B2F2F" opacity={0.38} />
    </svg>
  )
}
