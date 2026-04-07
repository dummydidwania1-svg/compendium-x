'use client';

import React, { useState, useRef } from 'react';
import { ChevronRight, CheckCircle2 } from 'lucide-react';
import CalendarPicker from '@/components/ui/CalendarPicker';
import { FILTER_TIME_OPTIONS } from '@/lib/constants';

const TimeFilterDropdown = ({ filters, setFilters, align = 'right' }: { filters: any, setFilters: any, align?: 'left' | 'right' }) => {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const handleEnter = () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); setOpen(true); };
  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => {
      if (filters.time === 'custom' && (!filters.customStart || !filters.customEnd)) return;
      setOpen(false);
    }, 150);
  };

  const formatFilterDate = (iso: string) => {
    if (!iso) return '...';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

  const currentLabel = filters.time === 'custom' && filters.customStart
    ? `${formatFilterDate(filters.customStart)} → ${formatFilterDate(filters.customEnd)}`
    : FILTER_TIME_OPTIONS.find(o => o.value === filters.time)?.label || 'All Time';
  const isActive = filters.time !== 'all';

  const selectTime = (value: string) => {
    if (filters.time === value && value !== 'custom') {
      setFilters((f: any) => ({ ...f, time: 'all', customStart: '', customEnd: '' }));
    } else {
      setFilters((f: any) => ({
        ...f,
        time: value,
        ...(value !== 'custom' ? { customStart: '', customEnd: '' } : {}),
      }));
    }
  };

  return (
    <div ref={ref} className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button
        className={`rounded-full px-4 py-2 text-xs font-medium text-[#5C4033] flex items-center gap-2 transition-colors border cursor-pointer bg-transparent ${isActive ? 'border-[#3D5A35]/50 bg-[#3D5A35]/8 text-[#3D5A35]' : 'border-[#5C4033]/20 hover:bg-[#5C4033]/6'}`}
      >
        <span className="opacity-60">Time:</span>
        <span className="text-[#3B2F2F] max-w-[140px] truncate">{currentLabel}</span>
        <ChevronRight className={`w-3 h-3 text-[#5C4033]/40 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className={`absolute top-full mt-2 z-50 animate-scale-in ${align === 'left' ? 'left-0' : 'right-0'}`}>
          <div className="bg-[#fff8f0] rounded-2xl p-2 flex flex-col shadow-xl border border-[#5C4033]/12 w-64">
            {FILTER_TIME_OPTIONS.filter(o => o.value !== 'custom').map(opt => {
              const isSelected = filters.time === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => selectTime(opt.value)}
                  className={`flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors ${isSelected ? 'bg-[#3D5A35]/8 text-[#3B2F2F] font-medium' : 'text-[#5C4033] hover:bg-[#D9D0C4]/30'}`}
                >
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'bg-[#3B2F2F] border-[#3B2F2F]' : 'border-[#5C4033]/30'}`}>
                    {isSelected && <CheckCircle2 className="w-2.5 h-2.5 text-[#F0EBE3]" />}
                  </div>
                  {opt.label}
                </button>
              );
            })}

            <div className="border-t border-[#5C4033]/8 mt-1 pt-1">
              <button
                onClick={() => selectTime('custom')}
                className={`flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors w-full ${filters.time === 'custom' ? 'bg-[#3D5A35]/8 text-[#3B2F2F] font-medium' : 'text-[#5C4033] hover:bg-[#D9D0C4]/30'}`}
              >
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${filters.time === 'custom' ? 'bg-[#3B2F2F] border-[#3B2F2F]' : 'border-[#5C4033]/30'}`}>
                  {filters.time === 'custom' && <CheckCircle2 className="w-2.5 h-2.5 text-[#F0EBE3]" />}
                </div>
                Custom Range
              </button>

              {filters.time === 'custom' && (
                <div className="mt-3 px-2 pb-2 flex flex-col gap-2">
                  <div>
                    <label className="text-[9px] uppercase tracking-wider text-[#5C4033]/50 font-semibold mb-1 block">Start Date</label>
                    <CalendarPicker value={filters.customStart} onChange={(v) => setFilters((f: any) => ({ ...f, customStart: v }))} label="Pick start date" />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider text-[#5C4033]/50 font-semibold mb-1 block">End Date</label>
                    <CalendarPicker value={filters.customEnd} onChange={(v) => setFilters((f: any) => ({ ...f, customEnd: v }))} label="Pick end date" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeFilterDropdown;