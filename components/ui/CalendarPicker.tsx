'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, ArrowLeft } from 'lucide-react';

const formatDisplay = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const CalendarPicker = ({
  value,
  onChange,
  label,
  minDate,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  minDate?: string; // YYYY-MM-DD — days before this are dimmed/unclickable
}) => {
  const [open, setOpen]           = useState(false);
  const [viewYear, setViewYear]   = useState(value ? new Date(value).getFullYear() : new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(value ? new Date(value).getMonth() : new Date().getMonth());
  const [mode, setMode]           = useState<'day' | 'month' | 'year'>('day');
  const [hintPlayed, setHintPlayed] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef   = useRef<HTMLDivElement>(null);

  // Click-outside: check both trigger and portal popup
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !popupRef.current?.contains(t)) {
        setOpen(false);
        setMode('day');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close on scroll (popup position would drift otherwise)
  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setMode('day'); };
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [open]);

  useEffect(() => {
    if (open && !hintPlayed) {
      const t = setTimeout(() => setHintPlayed(true), 2000);
      return () => clearTimeout(t);
    }
  }, [open, hintPlayed]);

  const handleOpen = () => {
    if (triggerRef.current) {
      const rect     = triggerRef.current.getBoundingClientRect();
      const popupW   = 232;
      const rawLeft  = rect.left;
      const safeLeft = Math.min(rawLeft, window.innerWidth - popupW - 12);
      setPos({ top: rect.bottom + 6, left: Math.max(8, safeLeft) });
    }
    setOpen(v => !v);
    setMode('day');
    setHintPlayed(false);
  };

  const parsedMin = minDate ? new Date(minDate + 'T00:00:00') : null;

  const monthNames     = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthNamesFull = ['January','February','March','April','May','June',
                          'July','August','September','October','November','December'];
  const daysInMonth    = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const days    = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks  = Array.from({ length: firstDayOfWeek }, () => null);
  const selDate = value ? new Date(value + 'T00:00:00') : null;
  const yearStart = viewYear - 5;
  const years     = Array.from({ length: 12 }, (_, i) => yearStart + i);

  const selectDay = (day: number) => {
    onChange(`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    setOpen(false);
    setMode('day');
  };

  const showArrows = mode === 'day' || mode === 'year';

  const popup = open && (
    <div
      ref={popupRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
      className="animate-scale-in"
    >
      <div className="bg-[#fff8f0] rounded-2xl shadow-2xl border border-[#5C4033]/12 w-[232px] overflow-hidden"
        style={{ boxShadow: '0 8px 40px rgba(59,47,47,0.14), 0 2px 8px rgba(59,47,47,0.08)' }}
      >
        <div className="p-3.5">
          {/* Header */}
          <div className="flex items-center justify-between mb-2.5">
            {showArrows ? (
              <button
                onClick={() => {
                  if (mode === 'day') { if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); } else setViewMonth(viewMonth - 1); }
                  else if (mode === 'year') setViewYear(viewYear - 12);
                }}
                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#D9D0C4]/50 text-[#5C4033]/60 transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
              </button>
            ) : <div className="w-6" />}

            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setMode(mode === 'month' ? 'day' : 'month')}
                className={`text-xs font-semibold px-1.5 py-0.5 rounded-md transition-all ${
                  mode === 'month' ? 'bg-[#3B2F2F] text-[#F0EBE3]' : 'text-[#3B2F2F] hover:bg-[#D9D0C4]/50'
                } ${!hintPlayed && mode === 'day' ? 'animate-[hint-pulse_1.5s_ease-in-out_0.5s_2]' : ''}`}
              >
                {monthNamesFull[viewMonth]}
              </button>
              <button
                onClick={() => setMode(mode === 'year' ? 'day' : 'year')}
                className={`text-xs font-semibold px-1.5 py-0.5 rounded-md transition-all ${
                  mode === 'year' ? 'bg-[#3B2F2F] text-[#F0EBE3]' : 'text-[#3B2F2F] hover:bg-[#D9D0C4]/50'
                } ${!hintPlayed && mode === 'day' ? 'animate-[hint-pulse_1.5s_ease-in-out_0.8s_2]' : ''}`}
              >
                {viewYear}
              </button>
            </div>

            {showArrows ? (
              <button
                onClick={() => {
                  if (mode === 'day') { if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); } else setViewMonth(viewMonth + 1); }
                  else if (mode === 'year') setViewYear(viewYear + 12);
                }}
                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#D9D0C4]/50 text-[#5C4033]/60 transition-colors rotate-180"
              >
                <ArrowLeft className="w-3 h-3" />
              </button>
            ) : <div className="w-6" />}
          </div>

          {/* Year grid */}
          {mode === 'year' && (
            <div className="grid grid-cols-3 gap-1 animate-scale-in">
              {years.map(y => (
                <button key={y} onClick={() => { setViewYear(y); setMode('month'); }}
                  className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                    y === viewYear ? 'bg-[#3B2F2F] text-[#F0EBE3]' : 'text-[#3B2F2F] hover:bg-[#D9D0C4]/50'
                  }`}
                >{y}</button>
              ))}
            </div>
          )}

          {/* Month grid */}
          {mode === 'month' && (
            <div className="grid grid-cols-3 gap-1 animate-scale-in">
              {monthNames.map((m, i) => (
                <button key={m} onClick={() => { setViewMonth(i); setMode('day'); }}
                  className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                    i === viewMonth ? 'bg-[#3B2F2F] text-[#F0EBE3]' : 'text-[#3B2F2F] hover:bg-[#D9D0C4]/50'
                  }`}
                >{m}</button>
              ))}
            </div>
          )}

          {/* Day grid */}
          {mode === 'day' && (
            <>
              <div className="grid grid-cols-7 gap-0 mb-0.5">
                {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                  <div key={d} className="text-center text-[9px] font-semibold text-[#5C4033]/35 uppercase py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0">
                {blanks.map((_, i) => <div key={`b-${i}`} />)}
                {days.map(day => {
                  const isSelected = selDate &&
                    selDate.getDate() === day && selDate.getMonth() === viewMonth && selDate.getFullYear() === viewYear;
                  const dayDate  = new Date(viewYear, viewMonth, day);
                  const isBefore = parsedMin ? dayDate < parsedMin : false;
                  return (
                    <button
                      key={day}
                      disabled={isBefore}
                      onClick={() => !isBefore && selectDay(day)}
                      className={`w-[30px] h-[30px] mx-auto rounded-lg text-[11px] font-medium flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-[#3B2F2F] text-[#F0EBE3]'
                          : isBefore
                            ? 'text-[#5C4033]/15 cursor-not-allowed'
                            : 'text-[#3B2F2F] hover:bg-[#D9D0C4]/50'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={handleOpen}
        className="w-full bg-transparent border border-[#5C4033]/20 rounded-lg px-3 py-2 text-xs text-left text-[#3B2F2F] hover:border-[#5C4033]/40 transition-colors flex items-center justify-between"
      >
        <span className={value ? 'text-[#3B2F2F] font-medium' : 'text-[#5C4033]/40'}>
          {value ? formatDisplay(value) : label}
        </span>
        <ChevronRight className={`w-3 h-3 text-[#5C4033]/40 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {/* Popup rendered via portal to escape any parent overflow/backdrop-filter clipping */}
      {typeof document !== 'undefined' && popup && createPortal(popup, document.body)}
    </div>
  );
};

export default CalendarPicker;
