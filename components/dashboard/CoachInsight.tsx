'use client';

import { useState } from 'react';
import { Sparkles, Lock } from 'lucide-react';
import type { CoachFilters } from '@/lib/coachPrecompute';

interface CoachInsightProps {
  filters: CoachFilters;
}

const CoachInsight = ({ filters: _filters }: CoachInsightProps) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="glass-card p-6 flex flex-col relative overflow-hidden group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <style>{`
        @keyframes _ci_lock_float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        @keyframes _ci_lock_pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }
        @keyframes _ci_ring       { 0%{transform:scale(1);opacity:0.35} 70%{transform:scale(2.2);opacity:0} 100%{transform:scale(2.2);opacity:0} }
        @keyframes _ci_ring2      { 0%{transform:scale(1);opacity:0.2} 70%{transform:scale(2.6);opacity:0} 100%{transform:scale(2.6);opacity:0} }
      `}</style>

      {/* ── Header row — sits above the overlay (z-10) so it stays visible ── */}
      <div className="relative z-10 flex items-center justify-between mb-2">
        <div className="eyebrow !mb-0 flex items-center">
          <Sparkles className="w-3 h-3 mr-2 text-[#3D5A35]" />
          THE COACH
        </div>
      </div>

      {/* ── Skeleton content (blurred behind overlay) ── */}
      <div className="flex flex-col gap-2.5 py-2 opacity-20 select-none pointer-events-none">
        <div className="h-3 w-3/4 rounded-full bg-[#5C4033]/20" />
        <div className="h-px bg-gradient-to-r from-[#5C4033]/12 via-[#5C4033]/6 to-transparent" />
        <div className="h-2.5 w-full rounded-full bg-[#5C4033]/12" />
        <div className="h-2.5 w-5/6 rounded-full bg-[#5C4033]/10" />
        <div className="h-2.5 w-4/6 rounded-full bg-[#5C4033]/8" />
        <div className="h-2.5 w-2/4 rounded-full bg-[#5C4033]/6" />
      </div>

      {/* ── Glass lock overlay — starts BELOW the header ── */}
      <div
        className="absolute left-0 right-0 bottom-0 flex flex-col items-center justify-center text-center px-6 gap-3 transition-all duration-400"
        style={{
          top: '44px',
          backdropFilter: hovered ? 'blur(52px) saturate(2.4)' : 'blur(36px) saturate(2.0)',
          WebkitBackdropFilter: hovered ? 'blur(52px) saturate(2.4)' : 'blur(36px) saturate(2.0)',
          background: hovered ? 'rgba(255,248,240,0.92)' : 'rgba(255,248,240,0.82)',
          borderRadius: '0 0 inherit inherit',
        }}
      >
        {/* Lock + double-ring */}
        <div className="relative flex items-center justify-center" style={{ width: '40px', height: '40px' }}>
          <span className="absolute inset-0 rounded-full border border-[#3D5A35]/20"
            style={{ animation: '_ci_ring2 3.4s cubic-bezier(0.215,0.61,0.355,1) 0.6s infinite' }} />
          <span className="absolute inset-0 rounded-full border border-[#3D5A35]/30"
            style={{ animation: '_ci_ring 2.8s cubic-bezier(0.215,0.61,0.355,1) infinite' }} />
          <Lock
            className="relative z-10 transition-all duration-400"
            style={{
              width: hovered ? '18px' : '15px',
              height: hovered ? '18px' : '15px',
              color: hovered ? 'rgba(61,90,53,0.85)' : 'rgba(61,90,53,0.55)',
              animation: '_ci_lock_float 3s ease-in-out infinite, _ci_lock_pulse 3s ease-in-out infinite',
            }}
          />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <p
            className="font-semibold tracking-[0.1em] uppercase transition-all duration-400"
            style={{
              fontSize: hovered ? '11px' : '10px',
              color: hovered ? 'rgba(61,90,53,0.9)' : 'rgba(61,90,53,0.65)',
            }}
          >
            Coming Soon
          </p>
          <div
            className="h-px bg-[#3D5A35]/20 transition-all duration-500"
            style={{ width: hovered ? '52px' : '28px' }}
          />
          <p
            className="text-[9.5px] leading-relaxed transition-all duration-400"
            style={{
              color: 'rgba(92,64,51,0.5)',
              opacity: hovered ? 1 : 0.6,
              transform: hovered ? 'translateY(0)' : 'translateY(2px)',
            }}
          >
            We&apos;re building something here.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CoachInsight;
