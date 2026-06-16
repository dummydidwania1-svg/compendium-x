'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronRight, Sparkles, BarChart2, Layers, TrendingUp, Lock } from 'lucide-react';
import TieLogo from '@/components/ui/TieLogo';
import { computeFAMetrics } from '@/lib/feedbackPrecompute';
import { callGeminiFeedback, ANALYSIS_MODES, type ChatMessage, type FAResponse, type FABlock, type FAViz } from '@/lib/geminiFeedback';
import { useDashboard } from './DashboardContext';

interface Props {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
}

// ── Compact single-branch horizontal tree ─────────────────────────────────────
// Root → horizontal line → vertical split → 2 branch nodes. That's it.
// Mirrors the screenshot structure but using the existing green palette.
const FA_TREE_SVG = `
<svg viewBox="0 0 54 32" width="50" height="30" style="overflow:visible;display:block">
  <line x1="10" y1="16" x2="25" y2="16" stroke="rgba(61,90,53,0.38)" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="15" stroke-dashoffset="15" style="animation:fa-line-draw 0.42s ease-out 80ms both"/>
  <line x1="25" y1="9"  x2="25" y2="23" stroke="rgba(61,90,53,0.30)" stroke-width="1"   stroke-linecap="round" stroke-dasharray="14" stroke-dashoffset="14" style="animation:fa-line-draw 0.32s ease-out 390ms both"/>
  <line x1="25" y1="9"  x2="38" y2="9"  stroke="rgba(61,90,53,0.26)" stroke-width="0.9" stroke-linecap="round" stroke-dasharray="13" stroke-dashoffset="13" style="animation:fa-line-draw 0.26s ease-out 570ms both"/>
  <line x1="25" y1="23" x2="38" y2="23" stroke="rgba(61,90,53,0.26)" stroke-width="0.9" stroke-linecap="round" stroke-dasharray="13" stroke-dashoffset="13" style="animation:fa-line-draw 0.26s ease-out 600ms both"/>
  <circle cx="5"  cy="16" r="5"   fill="rgba(61,90,53,0.72)" style="opacity:0;animation:fa-node-in 0.38s cubic-bezier(0.16,1,0.3,1) 0ms   both"/>
  <circle cx="43" cy="9"  r="4.5" fill="rgba(61,90,53,0.62)" style="opacity:0;animation:fa-node-in 0.30s cubic-bezier(0.16,1,0.3,1) 660ms both"/>
  <circle cx="43" cy="23" r="4.5" fill="rgba(61,90,53,0.62)" style="opacity:0;animation:fa-node-in 0.30s cubic-bezier(0.16,1,0.3,1) 695ms both"/>
</svg>`;

// Last node: 695ms + 300ms = 995ms. Buffer to 1200ms.
const ANIM_DURATION = 1200;

// ── Friendly random verbs ─────────────────────────────────────────────────────
const FA_VERBS = [
  'Noticing', 'Sensing', 'Decoding', 'Absorbing',
  'Surfacing', 'Distilling', 'Listening', 'Catching',
  'Spotting', 'Flagging', 'Rereading', 'Attuning',
];

const IssueTreeLoader = () => {
  const [verb, setVerb] = useState(() => FA_VERBS[Math.floor(Math.random() * FA_VERBS.length)]);
  const [verbVisible, setVerbVisible] = useState(true);
  const svgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (svgRef.current) svgRef.current.innerHTML = FA_TREE_SVG;
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setVerbVisible(false);
      setTimeout(() => {
        setVerb(prev => {
          const pool = FA_VERBS.filter(v => v !== prev);
          return pool[Math.floor(Math.random() * pool.length)];
        });
        setVerbVisible(true);
      }, 180);
    }, 900);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex items-center gap-3 py-0.5">
      <div ref={svgRef} className="shrink-0" />
      <p
        className="text-[10.5px] font-medium text-[#5C4033]/38 tracking-wide whitespace-nowrap"
        style={{ opacity: verbVisible ? 1 : 0, transition: 'opacity 180ms ease' }}
      >
        {verb}…
      </p>
    </div>
  );
};

// ── Inline quote block ────────────────────────────────────────────────────────
const QuoteBlock = ({ text, caseId, date }: { text: string; caseId: string; date: string }) => (
  <div className="relative pl-4 my-1.5">
    <div className="absolute left-0 top-0.5 bottom-0.5 w-[1.5px] rounded-full bg-[#3D5A35]/28" />
    <p className="text-[11px] italic text-[#3B2F2F]/55 leading-relaxed font-sans">"{text}"</p>
    {(caseId || date) && (
      <span className="text-[8.5px] text-[#3D5A35]/40 tracking-[0.08em] uppercase mt-0.5 block font-sans">
        {caseId ? `Case ${caseId}` : ''}{caseId && date ? ' · ' : ''}{date}
      </span>
    )}
  </div>
);

// ── Heading block (finding title + temporal tag) ──────────────────────────────
const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  Persisting:  { bg: 'rgba(196,168,130,0.22)', text: 'rgba(92,64,51,0.72)'  },
  Improving:   { bg: 'rgba(61,90,53,0.12)',    text: 'rgba(61,90,53,0.75)'  },
  Emerging:    { bg: 'rgba(92,64,51,0.10)',    text: 'rgba(92,64,51,0.60)'  },
  'Early only':{ bg: 'rgba(92,64,51,0.08)',    text: 'rgba(92,64,51,0.52)'  },
  Strength:    { bg: 'rgba(61,90,53,0.12)',    text: 'rgba(61,90,53,0.75)'  },
  Gap:         { bg: 'rgba(180,90,80,0.10)',   text: 'rgba(150,60,50,0.65)' },
};

const HeadingBlock = ({ text, tag }: { text: string; tag?: string }) => {
  const colors = tag ? (TAG_COLORS[tag] ?? null) : null;
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-[12px] font-semibold text-[#3B2F2F]/85 font-sans leading-tight">{text}</span>
      {tag && colors && (
        <span
          className="shrink-0 text-[7.5px] uppercase tracking-[0.1em] font-semibold px-1.5 py-[2px] rounded-md"
          style={{ background: colors.bg, color: colors.text }}
        >
          {tag}
        </span>
      )}
    </div>
  );
};

// ── Bullet block ──────────────────────────────────────────────────────────────
const BulletBlock = ({ text }: { text: string }) => (
  <div className="flex items-start gap-2 pl-1">
    <span className="shrink-0 mt-[5px] w-1 h-1 rounded-full bg-[#3D5A35]/35" />
    <p className="text-[11px] leading-relaxed text-[#3B2F2F]/68 font-sans">{text}</p>
  </div>
);

// ── Divider block ─────────────────────────────────────────────────────────────
const DividerBlock = () => (
  <div className="mt-3 mb-1 border-t border-[#5C4033]/8" />
);

// ── Horizontal bar chart ───────────────────────────────────────────────────────
const BarsChart = ({ title, subtitle, items, maxValue }: {
  title: string; subtitle?: string;
  items: Array<{ label: string; value: number }>;
  maxValue?: number;
}) => {
  const max = maxValue ?? Math.max(...items.map(i => i.value), 0.01);
  return (
    <div className="mt-4 pt-3.5 border-t border-[#5C4033]/8">
      <p className="text-[8px] uppercase tracking-[0.14em] text-[#3D5A35]/45 font-semibold mb-2.5 font-sans">{title}</p>
      {subtitle && <p className="text-[10px] text-[#5C4033]/40 mb-2.5 font-sans">{subtitle}</p>}
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.label} className="flex items-center gap-2.5">
            <span className="text-[10px] text-[#5C4033]/55 w-[88px] shrink-0 text-right leading-none font-sans">{item.label}</span>
            <div className="flex-1 h-[3px] bg-[#D9D0C4]/55 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-[#3D5A35]/48"
                style={{ width: `${(item.value / max) * 100}%`, transition: 'width 0.7s cubic-bezier(0.16,1,0.3,1)' }}
              />
            </div>
            <span className="text-[9.5px] text-[#5C4033]/40 w-5 shrink-0 font-sans">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Scatter plot (SVG, fully responsive) ─────────────────────────────────────
// viewBox ≈ actual rendered width so font sizes stay ~1:1 with dashboard text.
// Chat bubble ≈ 84% of (82vw − 258px sidebar). On 1440px screen ≈ 760px.
// Using VW=700 → scale factor ~1.09×, so fontSize=9 renders as ~9.8px (correct).
const ScatterPlot = ({ title, subtitle, points, xLabel, yLabel }: {
  title: string; subtitle?: string;
  points: Array<{ x: number; y: number; label: string }>;
  xLabel?: string; yLabel?: string;
}) => {
  const VW = 700, VH = 160;
  const PAD = { top: 14, right: 14, bottom: 30, left: 42 };
  const plotW = VW - PAD.left - PAD.right;
  const plotH = VH - PAD.top - PAD.bottom;

  const xs = points.map(p => p.x);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const sx = (x: number) => PAD.left + ((x - xMin) / (xMax - xMin || 1)) * plotW;
  const sy = (y: number) => PAD.top + (1 - y / 5) * plotH;

  // Linear trend line
  const n = points.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = points.map(p => p.y).reduce((a, b) => a + b, 0) / n;
  const denom = points.reduce((acc, p) => acc + (p.x - meanX) ** 2, 0.001);
  const slope = points.reduce((acc, p) => acc + (p.x - meanX) * (p.y - meanY), 0) / denom;
  const intercept = meanY - slope * meanX;
  const clamp = (v: number) => Math.max(0, Math.min(5, v));
  const midY = PAD.top + plotH / 2;

  return (
    <div className="mt-4 pt-3.5 border-t border-[#5C4033]/8">
      <p className="text-[8px] uppercase tracking-[0.14em] text-[#3D5A35]/45 font-semibold mb-2.5 font-sans">{title}</p>
      {subtitle && <p className="text-[10px] text-[#5C4033]/40 mb-2 font-sans">{subtitle}</p>}
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
        {/* Horizontal grid + y-tick labels */}
        {[1, 2, 3, 4, 5].map(y => (
          <g key={y}>
            <line x1={PAD.left} y1={sy(y)} x2={VW - PAD.right} y2={sy(y)}
              stroke="rgba(92,64,51,0.08)" strokeWidth="0.7" />
            <text x={PAD.left - 6} y={sy(y) + 3} fontSize="9" fill="rgba(92,64,51,0.38)" textAnchor="end">{y}</text>
          </g>
        ))}
        {/* x-axis baseline */}
        <line x1={PAD.left} y1={PAD.top + plotH} x2={VW - PAD.right} y2={PAD.top + plotH}
          stroke="rgba(92,64,51,0.10)" strokeWidth="0.7" />
        {/* x-axis tick marks + values (5 evenly spaced) */}
        {Array.from({ length: 5 }, (_, i) => Math.round(xMin + (i / 4) * (xMax - xMin))).map(x => (
          <g key={x}>
            <line x1={sx(x)} y1={PAD.top + plotH} x2={sx(x)} y2={PAD.top + plotH + 4}
              stroke="rgba(92,64,51,0.18)" strokeWidth="0.7" />
            <text x={sx(x)} y={PAD.top + plotH + 14} fontSize="8.5" fill="rgba(92,64,51,0.35)" textAnchor="middle">{x}</text>
          </g>
        ))}
        {/* Trend line */}
        {n > 1 && (
          <line
            x1={sx(xMin)} y1={sy(clamp(slope * xMin + intercept))}
            x2={sx(xMax)} y2={sy(clamp(slope * xMax + intercept))}
            stroke="rgba(61,90,53,0.20)" strokeWidth="1.4" strokeDasharray="5 4"
          />
        )}
        {/* Data points */}
        {points.map((p, i) => (
          <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="4" fill="rgba(61,90,53,0.52)" />
        ))}
        {/* x-axis label */}
        {xLabel && (
          <text x={PAD.left + plotW / 2} y={VH - 3} fontSize="9" fill="rgba(92,64,51,0.38)" textAnchor="middle">{xLabel}</text>
        )}
        {/* y-axis label — rotated, tucked inside left padding */}
        {yLabel && (
          <text x={12} y={midY} fontSize="9" fill="rgba(92,64,51,0.38)" textAnchor="middle" transform={`rotate(-90, 12, ${midY})`}>{yLabel}</text>
        )}
      </svg>
    </div>
  );
};

// ── Comparison table ──────────────────────────────────────────────────────────
const FeedbackTable = ({ title, subtitle, headers, rows }: {
  title: string; subtitle?: string;
  headers: string[]; rows: string[][];
}) => (
  <div className="mt-4 pt-3.5 border-t border-[#5C4033]/8">
    <p className="text-[8px] uppercase tracking-[0.14em] text-[#3D5A35]/45 font-semibold mb-2.5 font-sans">{title}</p>
    {subtitle && <p className="text-[10px] text-[#5C4033]/40 mb-2.5 font-sans">{subtitle}</p>}
    <div className="rounded-lg overflow-hidden border border-[#D9D0C4]/55">
      <table className="w-full font-sans" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'rgba(217,208,196,0.30)' }}>
            {headers.map(h => (
              <th key={h} className="px-3 py-1.5 text-left text-[7.5px] uppercase tracking-[0.1em] text-[#3D5A35]/50 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 1 ? 'rgba(217,208,196,0.12)' : 'transparent' }}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-[10px] text-[#5C4033]/62 leading-snug border-t border-[#D9D0C4]/30">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ── Structured response renderer ──────────────────────────────────────────────
const ResponseCard = ({ blocks, viz }: { blocks: FABlock[]; viz: FAViz }) => (
  <div>
    <div className="space-y-1.5">
      {blocks.map((block, i) => {
        if (block.type === 'heading')  return <HeadingBlock key={i} text={block.text} tag={block.tag} />;
        if (block.type === 'bullet')   return <BulletBlock key={i} text={block.text} />;
        if (block.type === 'quote')    return <QuoteBlock key={i} text={block.text} caseId={block.caseId ?? ''} date={block.date ?? ''} />;
        if (block.type === 'divider')  return <DividerBlock key={i} />;
        return <p key={i} className="text-[11px] leading-relaxed text-[#3B2F2F]/72 font-sans">{block.text}</p>;
      })}
    </div>
    {viz.type === 'bars' && viz.items && viz.items.length > 0 && (
      <BarsChart title={viz.title} subtitle={viz.subtitle} items={viz.items} maxValue={viz.maxValue} />
    )}
    {viz.type === 'scatter' && viz.points && viz.points.length > 0 && (
      <ScatterPlot title={viz.title} subtitle={viz.subtitle} points={viz.points} xLabel={viz.xLabel} yLabel={viz.yLabel} />
    )}
    {viz.type === 'table' && viz.headers && viz.rows && viz.headers.length > 0 && viz.rows.length > 0 && (
      <FeedbackTable title={viz.title} subtitle={viz.subtitle} headers={viz.headers} rows={viz.rows} />
    )}
  </div>
);

// ── Mode icon map ─────────────────────────────────────────────────────────────
const MODE_ICONS = [BarChart2, Layers, TrendingUp];

// ── Main component ────────────────────────────────────────────────────────────
const FeedbackAnalyser = ({ isOpen, setIsOpen }: Props) => {
  const { entries } = useDashboard();
  const metrics = useMemo(() => computeFAMetrics(entries), [entries]);
  const apiKeyMissing = !process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  const noCasesYet = metrics.totalCases === 0;
  const unavailableMessage =
    'The Analyser is unavailable until NEXT_PUBLIC_GEMINI_API_KEY is configured.';

  const [isHovering, setIsHovering]   = useState(false);
  const [isLoading, setIsLoading]     = useState(false);
  const [messages, setMessages]       = useState<ChatMessage[]>([
    { role: 'agent', text: apiKeyMissing ? unavailableMessage : metrics.initialGreeting },
  ]);
  const [input, setInput]             = useState('');
  const endRef                        = useRef<HTMLDivElement>(null);
  const hoverTimerRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setIsHovering(true);
  };
  const handleMouseLeave = () => {
    hoverTimerRef.current = setTimeout(() => setIsHovering(false), 320);
  };
  useEffect(() => () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  }, []);

  useEffect(() => {
    const introText = apiKeyMissing ? unavailableMessage : metrics.initialGreeting;
    setMessages((prev) =>
      prev.length <= 1 ? [{ role: 'agent', text: introText }] : prev
    );
  }, [apiKeyMissing, metrics.initialGreeting]);

  const handleSend = async (text: string) => {
    if (!text.trim() || isLoading || noCasesYet) return;
    setInput('');
    const historyForGemini = messages.slice(1);
    setMessages(prev => [...prev, { role: 'user', text }]);
    setIsLoading(true);
    const animStart = Date.now();

    let faResponse: FAResponse;
    try {
      faResponse = await callGeminiFeedback(metrics, historyForGemini, text);
    } catch (err) {
      const msg = err instanceof Error && err.message.includes('NEXT_PUBLIC_GEMINI_API_KEY')
        ? unavailableMessage
        : 'Something went wrong. Please check your connection and try again.';
      faResponse = {
        blocks: [{ type: 'paragraph', text: msg }],
        viz: { type: 'none', title: '' },
      };
    }

    // Plain text for Gemini conversation history
    const plainText = faResponse.blocks
      .filter(b => b.type === 'paragraph')
      .map(b => b.text)
      .join(' ');

    // Hold response until the tree animation has fully drawn — whichever comes last
    const elapsed = Date.now() - animStart;
    const wait = Math.max(0, ANIM_DURATION - elapsed);
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'agent', text: plainText, response: faResponse }]);
      setIsLoading(false);
    }, wait);
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <>
      {/* ── All keyframes here in parent — never re-injected by verb cycling ── */}
      <style>{`
        @keyframes fa-rise {
          from { opacity: 0; transform: translateY(8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        .fa-rise { animation: fa-rise 0.32s cubic-bezier(0.16,1,0.3,1) both; }

        @keyframes fa-ping {
          0%   { transform: scale(1);   opacity: 0.4; }
          70%  { transform: scale(1.6); opacity: 0;   }
          100% { transform: scale(1.6); opacity: 0;   }
        }
        .fa-ping { animation: fa-ping 2.8s cubic-bezier(0.215,0.61,0.355,1) infinite; }

        @keyframes fa-sparkle {
          0%, 100% { opacity: 0.35; transform: scale(1)    rotate(0deg);  }
          50%       { opacity: 0.7;  transform: scale(1.15) rotate(15deg); }
        }
        .fa-sparkle { animation: fa-sparkle 3s ease-in-out infinite; }

        @keyframes fa-node-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes fa-line-draw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes fa-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* ── FAB + hover "Coming Soon" card ───────────────────────────────── */}
      <div
        className="fixed bottom-6 right-6 z-50 flex flex-col items-end"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {isHovering && !isOpen && (
          <div
            className="fa-rise mb-3 flex flex-col items-center gap-2.5 px-5 py-4 rounded-2xl pointer-events-none"
            style={{
              background: 'rgba(255,248,240,0.86)',
              backdropFilter: 'blur(28px) saturate(2.0)',
              WebkitBackdropFilter: 'blur(28px) saturate(2.0)',
              border: '1px solid rgba(61,90,53,0.14)',
              boxShadow: '0 4px 20px rgba(61,90,53,0.10)',
            }}
          >
            <style>{`
              @keyframes _fa_lock_float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
              @keyframes _fa_lock_pulse { 0%,100%{opacity:0.55} 50%{opacity:1} }
              @keyframes _fa_ring { 0%{transform:scale(1);opacity:0.3} 70%{transform:scale(1.9);opacity:0} 100%{transform:scale(1.9);opacity:0} }
            `}</style>
            <div className="relative flex items-center justify-center">
              <span
                className="absolute rounded-full border border-[#3D5A35]/25"
                style={{ width: '28px', height: '28px', animation: '_fa_ring 2.8s cubic-bezier(0.215,0.61,0.355,1) infinite' }}
              />
              <Lock
                className="w-3.5 h-3.5 text-[#3D5A35]/65 relative z-10"
                style={{ animation: '_fa_lock_float 3s ease-in-out infinite, _fa_lock_pulse 3s ease-in-out infinite' }}
              />
            </div>
            <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#3D5A35]/70 whitespace-nowrap">
              Coming Soon
            </p>
            <div className="h-px w-8 bg-[#3D5A35]/18" />
            <p className="text-[9.5px] text-[#5C4033]/40 whitespace-nowrap">
              We&apos;re building this.
            </p>
          </div>
        )}

        {/* FAB */}
        <button
          className="relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 backdrop-blur-2xl cursor-default"
          style={{
            background: 'rgba(255,248,240,0.65)',
            border: '1px solid rgba(61,90,53,0.22)',
            boxShadow: '0 4px 20px rgba(61,90,53,0.12), 0 1px 0 rgba(255,255,255,0.7) inset',
          }}
        >
          <span className="fa-ping absolute inset-0 rounded-full border border-[#3D5A35]/25 pointer-events-none" />
          <TieLogo className="w-[18px] h-[18px] text-[#3D5A35] relative z-10" />
          <Sparkles className="fa-sparkle absolute -top-0.5 -right-0.5 w-3 h-3 text-[#3D5A35]" />
        </button>
      </div>

      {/* ── Full overlay (disabled — FAB no longer opens it) ─────────────── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-6 animate-scale-in"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="absolute inset-0 backdrop-blur-3xl"
            style={{ background: 'rgba(255,248,240,0.55)' }}
          />

          <div
            className="relative w-full max-w-[82vw] h-[78vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden bg-[#fff8f0]/96 backdrop-blur-xl border border-[#5C4033]/12"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#5C4033]/8 shrink-0">
              <div className="eyebrow !mb-0 flex items-center">
                <TieLogo className="w-3 h-3 mr-2 text-[#3D5A35]" />
                THE ANALYSER
              </div>
              <div className="flex items-center gap-3">
                {apiKeyMissing ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-[3px] rounded-md border border-[#C4A882]/40 bg-[#C4A882]/12">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#C4A882]" />
                    <span className="text-[8px] uppercase tracking-[0.1em] font-semibold text-[#C4A882]/80">Unavailable</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2.5 py-[3px] rounded-md border border-[#5C4033]/10 bg-[#D9D0C4]/18">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isLoading ? 'animate-pulse bg-[#C4A882]' : 'bg-[#3D5A35]'}`} />
                    <span className="text-[8px] uppercase tracking-[0.1em] font-semibold text-[#5C4033]/55">
                      {isLoading ? 'Thinking' : 'Ready'}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-7 h-7 rounded-full flex items-center justify-center bg-[#D9D0C4]/30 hover:bg-[#D9D0C4]/55 text-[#5C4033]/60 hover:text-[#3B2F2F] transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex flex-1 overflow-hidden">

              {/* ── Sidebar ─────────────────────────────────────────────── */}
              <div className="w-[258px] shrink-0 border-r border-[#5C4033]/8 flex flex-col overflow-y-auto custom-scrollbar">

                {/* Analysis Modes */}
                <div className="p-5 pb-3">
                  <div className="eyebrow !mb-3">Analysis Modes</div>
                  <div className="flex flex-col gap-1.5">
                    {ANALYSIS_MODES.map((mode, i) => {
                      const Icon = MODE_ICONS[i];
                      return (
                        <button
                        key={i}
                        onClick={() => handleSend(mode.prompt)}
                        disabled={isLoading || noCasesYet}
                          className="group w-full text-left px-3.5 py-3 rounded-xl border border-[#5C4033]/8 bg-[#D9D0C4]/10 hover:bg-[#3D5A35]/6 hover:border-[#3D5A35]/22 transition-all duration-200 disabled:opacity-50"
                        >
                          <div className="flex items-center gap-2.5 mb-0.5">
                            <Icon className="w-3 h-3 text-[#3D5A35]/50 group-hover:text-[#3D5A35]/80 transition-colors shrink-0" />
                            <span className="text-[11px] font-semibold text-[#3B2F2F]/70 group-hover:text-[#3B2F2F]/90 transition-colors font-sans">
                              {mode.label}
                            </span>
                          </div>
                          <p className="text-[9.5px] text-[#5C4033]/40 font-sans leading-snug pl-[22px]">
                            {mode.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Divider */}
                <div className="mx-5 border-t border-[#5C4033]/8" />

                {/* Quick Asks */}
                <div className="p-5 pt-3">
                  <div className="eyebrow !mb-3">Quick Asks</div>
                  <div className="flex flex-col gap-1.5">
                    {metrics.dynamicQuestions.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => handleSend(q)}
                        disabled={isLoading || apiKeyMissing || noCasesYet}
                        className="group w-full text-left px-3.5 py-2.5 rounded-xl border border-[#5C4033]/8 bg-transparent hover:bg-[#3D5A35]/5 hover:border-[#3D5A35]/18 transition-all duration-200 flex items-center justify-between gap-2 disabled:opacity-50"
                      >
                        <span className="text-[10.5px] text-[#3B2F2F]/60 font-medium leading-snug group-hover:text-[#3B2F2F]/82 transition-colors font-sans">
                          {q}
                        </span>
                        <ChevronRight className="w-3 h-3 text-[#3D5A35]/30 group-hover:text-[#3D5A35]/70 transition-colors shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* ── Chat area ───────────────────────────────────────────── */}
              <div className="flex-1 flex flex-col overflow-hidden">

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-4 custom-scrollbar">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {/* First agent message — styled as a pre-analysis callout */}
                      {i === 0 && msg.role === 'agent' ? (
                        <div
                          className="max-w-[78%] rounded-2xl rounded-tl-sm overflow-hidden border border-[#5C4033]/8"
                          style={{ background: 'rgba(217,208,196,0.22)' }}
                        >
                          <p className="px-4 pt-3.5 pb-3 text-[11.5px] leading-relaxed font-sans text-[#3B2F2F]" style={{ whiteSpace: 'pre-line' }}>
                            {msg.text}
                          </p>
                        </div>

                      ) : msg.role === 'user' ? (
                        <div className="max-w-[78%] px-4 py-3 rounded-2xl rounded-tr-sm text-[11.5px] leading-relaxed font-sans bg-[#3D5A35] text-[#fff8f0]">
                          {msg.text}
                        </div>
                      ) : (
                        <div
                          className="max-w-[84%] px-4 py-3.5 rounded-2xl rounded-tl-sm border border-[#5C4033]/8"
                          style={{ background: 'rgba(217,208,196,0.22)' }}
                        >
                          {msg.response ? (
                            <ResponseCard blocks={msg.response.blocks} viz={msg.response.viz} />
                          ) : (
                            <p className="text-[11.5px] leading-relaxed text-[#3B2F2F]/78 font-sans" style={{ whiteSpace: 'pre-line' }}>{msg.text}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Issue-tree thinking loader */}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div
                        className="rounded-2xl rounded-tl-sm border border-[#5C4033]/8 px-4 py-3.5"
                        style={{ background: 'rgba(217,208,196,0.22)' }}
                      >
                        <IssueTreeLoader />
                      </div>
                    </div>
                  )}

                  <div ref={endRef} />
                </div>

                {/* Input */}
                <div className="px-8 py-4 border-t border-[#5C4033]/8 shrink-0">
                  <div className="relative">
                    <input
                      type="text"
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !isLoading && !apiKeyMissing && !noCasesYet && handleSend(input)}
                      placeholder={
                        apiKeyMissing
                          ? 'AI analyser unavailable…'
                          : noCasesYet
                            ? 'Complete a case to unlock the analyser…'
                            : 'Ask about your feedback patterns…'
                      }
                      disabled={isLoading || apiKeyMissing || noCasesYet}
                      className="w-full bg-[#D9D0C4]/20 border border-[#5C4033]/12 rounded-xl py-3 pl-4 pr-12 text-xs text-[#3B2F2F] placeholder:text-[#5C4033]/30 focus:outline-none focus:border-[#3D5A35]/40 transition-colors disabled:opacity-60 font-sans"
                    />
                    <button
                      onClick={() => handleSend(input)}
                      disabled={isLoading || apiKeyMissing || noCasesYet || !input.trim()}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center bg-[#3D5A35] text-[#fff8f0] hover:bg-[#3D5A35]/80 transition-colors disabled:opacity-40"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FeedbackAnalyser;
