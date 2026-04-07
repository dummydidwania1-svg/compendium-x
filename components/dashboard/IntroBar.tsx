'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import MultiSelectDropdown from '@/components/ui/MultiSelectDropdown';
import TimeFilterDropdown from '@/components/ui/TimeFilterDropdown';
import { FILTER_TYPES, FILTER_LEVELS } from '@/lib/constants';
import { useDashboard } from './DashboardContext';

const IntroBar = ({ filters, setFilters, hasActiveFilters, clearAllFilters, suppressFloating }: any) => {
  const { firstName } = useDashboard();
  const [floatingVisible, setFloatingVisible] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const canUseDOM = typeof document !== 'undefined';

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setFloatingVisible(!entry.isIntersecting),
      { rootMargin: '-70px 0px 0px 0px', threshold: 0 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, []);

  // Factory function (not a component) so React doesn't unmount/remount
  // children (MultiSelectDropdown, TimeFilterDropdown) on every filter change,
  // which would reset their internal `open` state and close the dropdown.
  const filterControls = (align: 'left' | 'right') => (
    <div className="flex flex-wrap items-center gap-3">
      <MultiSelectDropdown label="Type" options={FILTER_TYPES} selected={filters.types} onChange={(v: any) => setFilters((f: any) => ({ ...f, types: v }))} align={align} />
      <MultiSelectDropdown label="Level" options={FILTER_LEVELS} selected={filters.levels} onChange={(v: any) => setFilters((f: any) => ({ ...f, levels: v }))} align={align} />
      <TimeFilterDropdown filters={filters} setFilters={setFilters} align={align} />
      {hasActiveFilters && (
        <button
          onClick={clearAllFilters}
          className="text-[10px] font-semibold text-[#5C4033]/50 hover:text-[#3B2F2F] transition-colors flex items-center gap-1 px-2 py-1 rounded-full hover:bg-[#D9D0C4]/30 animate-scale-in"
        >
          <X className="w-3 h-3" /> Clear all
        </button>
      )}
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes _hi{from{opacity:0;transform:translateY(10px)}to{opacity:0.5;transform:translateY(0)}}
        @keyframes _name{from{opacity:0;transform:translateY(16px);filter:blur(8px)}to{opacity:1;transform:translateY(0);filter:blur(0px)}}
      `}</style>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 pt-4 border-b border-[#5C4033]/10">
        {/* Heading — "Hi" fades in soft, name springs in with blur-to-clear */}
        <h1 className="text-[34px] tracking-[-0.03em] leading-none text-[#3B2F2F]" style={{ fontFamily: "'Newsreader', serif" }}>
          <span
            className="inline-block"
            style={{ fontWeight: 300, animation: '_hi 0.45s ease forwards', opacity: 0 }}
          >Hi</span>
          {' '}
          <span
            className="inline-block text-[#3D5A35]"
            style={{ fontWeight: 400, animation: '_name 0.7s cubic-bezier(0.16,1,0.3,1) 0.08s forwards', opacity: 0 }}
          >{firstName},</span>
        </h1>

        {/* Inline filters — right-aligned dropdowns */}
        {filterControls('right')}
      </div>

      {/* Sentinel — disappears from view when user scrolls past the intro section */}
      <div ref={sentinelRef} className="h-0 pointer-events-none" />

      {/* Floating filter bar — portal-rendered, fixed just below navbar */}
      {canUseDOM
        ? createPortal(
            <div
              className={`fixed left-0 right-0 z-40 transition-all duration-300 ${
                floatingVisible && !suppressFloating ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 pointer-events-none'
              }`}
              style={{ top: '70px' }}
            >
              <div className="border-b border-[#3D5A35]/8" style={{ background: 'rgba(255,248,240,0.75)', backdropFilter: 'blur(28px) saturate(1.5)', WebkitBackdropFilter: 'blur(28px) saturate(1.5)' }}>
                <div className="px-4 lg:px-6 max-w-[1440px] mx-auto py-2.5 flex items-center gap-4">
                  <span className="text-[9px] uppercase tracking-[0.15em] font-semibold text-[#3D5A35]/50 shrink-0">Filters</span>
                  {/* Left-aligned dropdowns so they don't clip near the left edge */}
                  {filterControls('left')}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
};

export default IntroBar;
