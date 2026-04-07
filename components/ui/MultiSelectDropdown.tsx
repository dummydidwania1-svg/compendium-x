'use client';

import React, { useState, useRef } from 'react';
import { ChevronRight, CheckCircle2 } from 'lucide-react';

const MultiSelectDropdown = ({ label, options, selected, onChange, align = 'right' }: { label: string, options: string[], selected: string[], onChange: (v: string[]) => void, align?: 'left' | 'right' }) => {
  const [open, setOpen] = useState(false);
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

  return (
    <div ref={ref} className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button
        className={`rounded-full px-4 py-2 text-xs font-medium text-[#5C4033] flex items-center gap-2 transition-colors border cursor-pointer bg-transparent ${selected.length > 0 ? 'border-[#3D5A35]/50 bg-[#3D5A35]/8 text-[#3D5A35]' : 'border-[#5C4033]/20 hover:bg-[#5C4033]/6'}`}
      >
        <span className="opacity-60">{label}:</span>
        <span className="text-[#3B2F2F] max-w-[100px] truncate">{displayText}</span>
        <ChevronRight className={`w-3 h-3 text-[#5C4033]/40 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className={`absolute top-full mt-2 w-52 z-50 animate-scale-in ${align === 'left' ? 'left-0' : 'right-0'}`}>
          <div className="bg-[#fff8f0] rounded-2xl p-2 flex flex-col shadow-xl border border-[#5C4033]/12">
            <button
              onClick={allSelected ? deselectAll : selectAll}
              className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#3D5A35] hover:text-[#3B2F2F] transition-colors text-left border-b border-[#5C4033]/8 mb-1 pb-2"
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>

            {options.map(opt => {
              const isSelected = selected.includes(opt);
              return (
                <button
                  key={opt}
                  onClick={() => toggleOption(opt)}
                  className={`flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors ${isSelected ? 'bg-[#3D5A35]/8 text-[#3B2F2F] font-medium' : 'text-[#5C4033] hover:bg-[#D9D0C4]/30'}`}
                >
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'bg-[#3B2F2F] border-[#3B2F2F]' : 'border-[#5C4033]/30'}`}>
                    {isSelected && <CheckCircle2 className="w-2.5 h-2.5 text-[#F0EBE3]" />}
                  </div>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiSelectDropdown;