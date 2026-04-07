'use client';

import React from 'react';
import { X, FileText, Download } from 'lucide-react';

const ScoreOverlay = ({ title, score, cases, onClose }: any) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
    <div className="absolute inset-0 bg-[#3B2F2F]/30 backdrop-blur-sm" />
    <div className="relative bg-[#fff8f0] rounded-2xl shadow-2xl border border-[#5C4033]/12 w-full max-w-md animate-scale-in overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between p-4 border-b border-[#5C4033]/10">
        <div>
          <div className="eyebrow !mb-1">{title}</div>
          <h3 className="text-sm font-medium text-[#3B2F2F] tracking-tight">Score: {score}</h3>
        </div>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-full bg-[#D9D0C4]/50 text-[#5C4033] hover:bg-[#3B2F2F] hover:text-[#F0EBE3] transition-colors">
          <X className="w-3 h-3" />
        </button>
      </div>
      <div className="p-4 max-h-[300px] overflow-y-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead className="border-b border-[#5C4033]/10">
            <tr>
              <th className="py-2 px-2 text-[10px] uppercase tracking-wider font-semibold text-[#5C4033]/60">Case</th>
              <th className="py-2 px-2 text-[10px] uppercase tracking-wider font-semibold text-[#5C4033]/60">Date</th>
              <th className="py-2 px-2 text-[10px] uppercase tracking-wider font-semibold text-[#5C4033]/60 text-right">Assets</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c: any) => (
              <tr key={c.id} className="group hover:bg-[#D9D0C4]/20 transition-colors">
                <td className="py-2.5 px-2">
                  <p className="text-xs font-medium text-[#3B2F2F] truncate max-w-[200px]">{c.name}</p>
                  <div className="flex gap-1 mt-1">
                    <span className="text-[9px] font-semibold bg-[#D9D0C4]/18 border border-[#5C4033]/10 text-[#5C4033]/60 px-1.5 py-[3px] rounded-md">{c.type}</span>
                    <span className="text-[9px] font-medium bg-[#D9D0C4]/18 border border-[#5C4033]/10 text-[#5C4033]/50 px-1.5 py-[3px] rounded-md">{c.level}</span>
                  </div>
                </td>
                <td className="py-2.5 px-2 text-xs text-[#5C4033]/80 whitespace-nowrap">{c.date}</td>
                <td className="py-2.5 px-2 text-right">
                  <div className="flex items-center justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button className="p-1 hover:bg-[#D9D0C4] rounded transition-colors text-[#5C4033]"><FileText className="w-3 h-3" /></button>
                    <button className={`p-1 rounded transition-colors ${c.hasPDF ? 'hover:bg-[#D9D0C4] text-[#5C4033]' : 'opacity-30 cursor-not-allowed text-[#5C4033]'}`}><Download className="w-3 h-3" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export default ScoreOverlay;