'use client';

import React, { useState, useRef, useLayoutEffect } from 'react';
import { ChevronRight, CheckCircle2, ChevronDown } from 'lucide-react';


const RepoFilterDropdown = ({ label, options, selected, onChange, align = 'right', columns = 2, width = 300 }: { label: string, options: string[], selected: string[], onChange: (v: string[]) => void, align?: 'left' | 'right', columns?: 1 | 2, width?: number }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
const scrollRef = useRef<HTMLDivElement>(null);
const [maxH, setMaxH] = useState(240);
const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); setOpen(true); };
  const handleLeave = () => { timeoutRef.current = setTimeout(() => setOpen(false), 150); };

  const toggleOption = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]);
  };
  const selectAll = () => onChange([...options]);
  const deselectAll = () => onChange([]);
  const allSelected = selected.length === options.length;
  const displayText = selected.length === 0 ? 'All' : selected.length === 1 ? selected[0] : `${selected.length} selected`;

useLayoutEffect(() => {
  if (!open) return;

  const GAP = 24;      // visible space we always keep above the footer
  const CHROME = 88;   // Select-All row + cue + paddings + the mt-2 offset

  const compute = () => {
    const trigger = triggerRef.current?.getBoundingClientRect();
    if (!trigger) return;
    const footer = document.querySelector('footer');
    const limit = footer ? footer.getBoundingClientRect().top : window.innerHeight;
    const available = limit - trigger.bottom - CHROME - GAP;
    const next = Math.max(96, Math.min(240, available));
    setMaxH(next);
    const el = scrollRef.current;
    if (el) setOverflowing(el.scrollHeight > next + 4);
  };

  compute();

  // Re-measure when the page height changes — e.g. the table shrinks after a
  // filter is applied and pulls the footer up — even if the mouse never moves.
  const ro = new ResizeObserver(compute);
  ro.observe(document.body);

  window.addEventListener('resize', compute);
  window.addEventListener('scroll', compute, true);
  return () => {
    ro.disconnect();
    window.removeEventListener('resize', compute);
    window.removeEventListener('scroll', compute, true);
  };
}, [open, options.length]);

  return (
    <div ref={ref} className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button
        ref={triggerRef}
  className={`group flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all duration-200 ${
    selected.length > 0
      ? 'bg-[#3D5A35]/[0.09] text-[#3D5A35]'
      : 'text-[#5C4033]/65 hover:bg-[#5C4033]/[0.05] hover:text-[#5C4033]'
  }`}
>
  <span>{label}</span>
  {selected.length > 0 && (
    <span className="flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#3D5A35]/15 px-1 text-[10px] font-semibold leading-none text-[#3D5A35]">
      {selected.length}
    </span>
  )}
  <ChevronDown
    className={`h-3 w-3 transition-transform duration-200 ${open ? 'rotate-180' : ''} ${
      selected.length > 0 ? 'text-[#3D5A35]/70' : 'text-[#5C4033]/35'
    }`}
  />
</button>

      {open && (
        <div className={`absolute top-full mt-2 z-50 animate-scale-in ${align === 'left' ? 'left-0' : 'right-0'}`} style={{ width }}>
          <div className="bg-[#fff8f0] rounded-2xl p-2 flex flex-col shadow-xl border border-[#5C4033]/12">
            <button
              onClick={allSelected ? deselectAll : selectAll}
              className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#3D5A35] hover:text-[#3B2F2F] transition-colors text-left border-b border-[#5C4033]/8 mb-1 pb-2"
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>

<div
  ref={scrollRef}
  className="repo-no-scrollbar overflow-y-auto"
    style= {{maxHeight: maxH }}
>
  <div className={`grid gap-0.5 ${columns === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
    {options.map(opt => {
      const isSelected = selected.includes(opt);
      return (
        // ⬇️ keep your EXISTING option button exactly as-is (CheckCircle2 + classes)
        <button
  key={opt}
  onClick={() => toggleOption(opt)}
  title={opt}
  className={`flex min-w-0 items-center gap-2.5 px-2.5 py-2 text-xs rounded-lg transition-colors ${isSelected ? 'bg-[#3D5A35]/8 text-[#3B2F2F] font-medium' : 'text-[#5C4033] hover:bg-[#D9D0C4]/30'}`}
>
  {/* unchanged select symbol */}
  <span className="truncate">{opt}</span>
</button>
      );
    })}
  </div>
</div>
{overflowing && (
  <div className="repo-scroll-cue pointer-events-none flex justify-center pt-1 text-[#5C4033]/40">
    <ChevronDown className="h-3.5 w-3.5" />
  </div>
)}
          </div>
        </div>
      )}
    </div>
  );
};

export default RepoFilterDropdown;