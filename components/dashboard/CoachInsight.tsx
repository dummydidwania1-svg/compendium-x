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
        @keyframes _ci_lock_float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-3px); }
        }
        @keyframes _ci_lock_pulse {
          0%, 100% { opacity: 0.55; }
          50%       { opacity: 1; }
        }
        @keyframes _ci_ring {
          0%   { transform: scale(1);   opacity: 0.3; }
          70%  { transform: scale(1.9); opacity: 0;   }
          100% { transform: scale(1.9); opacity: 0;   }
        }
      `}</style>

      {/* ── Ambient glow ── */}
      <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full bg-[#3D5A35]/4 blur-3xl pointer-events-none transition-all duration-1000 group-hover:bg-[#3D5A35]/8" />
      <div className="absolute -bottom-12 -left-8 w-40 h-40 rounded-full bg-[#D9D0C4]/6 blur-3xl pointer-events-none transition-all duration-1000 group-hover:bg-[#D9D0C4]/12" />

      {/* ── Header row ── */}
      <div className="flex items-center justify-between mb-2">
        <div className="eyebrow !mb-0 flex items-center">
          <Sparkles className="w-3 h-3 mr-2 text-[#3D5A35]" />
          THE COACH
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-[3px] rounded-md border border-[#5C4033]/10 bg-[#D9D0C4]/18">
          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#5C4033]/25" />
          <span className="text-[8px] uppercase tracking-[0.1em] font-semibold text-[#5C4033]/55">Soon</span>
        </div>
      </div>

      {/* ── Skeleton content (sits behind overlay, gives it depth) ── */}
      <div className="flex flex-col gap-2.5 py-2 opacity-25 select-none pointer-events-none">
        <div className="h-3 w-3/4 rounded-full bg-[#5C4033]/20" />
        <div className="h-px bg-gradient-to-r from-[#5C4033]/12 via-[#5C4033]/6 to-transparent" />
        <div className="h-2.5 w-full rounded-full bg-[#5C4033]/12" />
        <div className="h-2.5 w-5/6 rounded-full bg-[#5C4033]/10" />
        <div className="h-2.5 w-4/6 rounded-full bg-[#5C4033]/8" />
        <div className="h-2.5 w-2/4 rounded-full bg-[#5C4033]/6" />
      </div>

      {/* ── Glass lock overlay ── */}
      <div
        className="absolute inset-0 rounded-[inherit] flex flex-col items-center justify-center text-center px-6 gap-2.5 transition-all duration-500"
        style={{
          backdropFilter: hovered ? 'blur(22px) saturate(1.9)' : 'blur(14px) saturate(1.5)',
          WebkitBackdropFilter: hovered ? 'blur(22px) saturate(1.9)' : 'blur(14px) saturate(1.5)',
          background: hovered ? 'rgba(255,248,240,0.82)' : 'rgba(255,248,240,0.62)',
        }}
      >
        {/* Lock icon with float + ring animation */}
        <div className="relative flex items-center justify-center">
          <span
            className="absolute rounded-full border border-[#3D5A35]/25"
            style={{
              width: '32px', height: '32px',
              animation: '_ci_ring 2.8s cubic-bezier(0.215,0.61,0.355,1) infinite',
            }}
          />
          <Lock
            className="w-4 h-4 text-[#3D5A35]/65 relative z-10"
            style={{ animation: '_ci_lock_float 3s ease-in-out infinite, _ci_lock_pulse 3s ease-in-out infinite' }}
          />
        </div>
        <p className="text-[10.5px] font-semibold tracking-[0.1em] uppercase text-[#3D5A35]/70 transition-all duration-300">
          Coming Soon
        </p>
        <div
          className="h-px bg-[#3D5A35]/18 transition-all duration-500"
          style={{ width: hovered ? '44px' : '32px' }}
        />
        <p className="text-[9.5px] text-[#5C4033]/40 leading-relaxed transition-all duration-300"
           style={{ opacity: hovered ? 1 : 0.7 }}>
          We&apos;re building something here.
        </p>
      </div>
    </div>
  );
};

export default CoachInsight;
