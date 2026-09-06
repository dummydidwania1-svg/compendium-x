'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import Footer from '@/components/dashboard/Footer';

type PanelId = 'panel-1' | 'panel-2' | 'panel-3';

const FOUNDERS = [
  {
    name: 'Nitya Mall',
    badge: 'McKinsey & Co.',
    description: 'Received a PPO from McKinsey & Co. Previously interned at Nomura Research Institute & Samsung. Conferred the L.N. Birla Gold Medal, she served as Strategy Head at the Placement Cell, SRCC.',
    school: 'SRCC • Class of 2026',
    linkedin: 'https://in.linkedin.com/in/nitya-mall-5a8728286/',
    photoSrc: '/team/nitya-mall.jpg',
  },
  {
    name: 'Pratik Agarwal',
    badge: 'Goldman Sachs',
    description: 'Previously interned at Windrose Capital, a Series-A VC fund. Served as Corporate Communications Head at the Placement Cell, SRCC.',
    school: 'SRCC • Class of 2026',
    linkedin: 'https://in.linkedin.com/in/agpratik/',
    photoSrc: '/team/pratik-agarwal.jpg',
  },
  {
    name: 'Saksham Didwania',
    badge: 'Kearney',
    description: 'Received a PPO from Accenture Strategy & interned at Samara Capital, a PE fund. With accolades in National Abacus & Chess, he served as Secretary General at the Placement Cell, SRCC.',
    school: 'SRCC • Class of 2026',
    linkedin: 'https://in.linkedin.com/in/sakshamd26',
    photoSrc: '/team/saksham-didwania.jpg',
  },
  {
    name: 'Tanvi Bansal',
    badge: 'Goldman Sachs • Intern',
    description: 'Tanvi interned at Goldman Sachs’ Private Wealth division, preceded by experience at Michael Page, alongside stints spanning sectors including financial advisory and consulting. She currently leads the Placement Cell, SRCC, as Secretary General. Having represented India at the Wharton Investment Competition as Team Leader, she is a CUET AIR 5 scorer and also holds a bachelor’s degree in Bharatanatyam.',
    school: 'SRCC • Class of 2027',
    linkedin: 'https://in.linkedin.com/in/tanvi-bansal-298786233/',
    photoSrc: '/team/tanvi-bansal.jpg',
  },
];

const TIMELINE_NODES = [
  {
    id: 'panel-1' as PanelId,
    year: '2021',
    label: 'The First Edition',
    icon: 'menu_book',
    dotStyle: { background: '#fff8f0', border: '2px solid #453a2a' },
    iconStyle: { color: '#453a2a' },
    textStyle: { color: '#453a2a' },
  },
  {
    id: 'panel-2' as PanelId,
    year: '2022',
    label: 'The Second Edition',
    icon: 'edit_note',
    dotStyle: { background: '#fff8f0', border: '2px solid #695c4d' },
    iconStyle: { color: '#695c4d' },
    textStyle: { color: '#695c4d' },
  },
  {
    id: 'panel-3' as PanelId,
    year: 'Now',
    label: 'CompendiumX',
    icon: 'rocket_launch',
    dotStyle: { background: '#3D5A35', border: '2px solid #3D5A35' },
    iconStyle: { color: '#fff8f0' },
    textStyle: { color: '#3D5A35' },
  },
];

const PANEL_ONE_PEOPLE = [
  { initials: 'AT', name: 'Aradhita Tuli', detail: "Masters' Union • ex-Accenture" },
  { initials: 'NS', name: 'Nimisha Singh', detail: 'Agoda • ex-Bain & Co.' },
  { initials: 'RP', name: 'Rahul Prasad', detail: 'Harvard MBA • ex-Advent, Kearney' },
  { initials: 'TB', name: 'Tushar Bagrodia', detail: 'Eight Roads VC • ex-Kearney' },
];

const PANEL_TWO_PEOPLE = [
  { initials: 'PC', name: 'Parth Chowdhary', detail: 'Warburg Pincus • ex-McKinsey & Co.' },
  { initials: 'PK', name: 'Pratham Kalra', detail: 'Filter Capital • ex-L.E.K. Consulting' },
];

const PLATFORM_FEATURES = [
  { icon: 'library_books', label: 'Case Repository' },
  { icon: 'psychology', label: '3 AI Personas' },
  { icon: 'dashboard', label: 'Dashboard' },
  { icon: 'graphic_eq', label: 'Voice LLM' },
];

const LinkedInIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
  </svg>
);

const FounderAvatar = ({ name, photoSrc }: { name: string; photoSrc?: string }) => {
  const [hasError, setHasError] = useState(!photoSrc);
  const imageStyle =
    photoSrc === '/team/pratik-agarwal.jpg'
      ? { transform: 'translateX(4px) scale(1.04)', transformOrigin: 'center', objectPosition: 'center 42%' as const }
      : photoSrc === '/team/tanvi-bansal.jpg'
        ? { transform: 'translateX(3px) scale(1.17)', transformOrigin: 'center', objectPosition: 'center 46%' as const }
      : undefined;

  return (
    <div className="founder-avatar">
      {!hasError && photoSrc ? (
        <Image
          src={photoSrc}
          alt={name}
          fill
          sizes="100px"
          quality={80}
          style={imageStyle}
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="photo-placeholder" aria-hidden="true">
          <span className="material-symbols-outlined">person</span>
          <span className="ph-label">Photo</span>
        </div>
      )}
    </div>
  );
};

const AboutPage = () => {
  const [activePanel, setActivePanel] = useState<PanelId>('panel-1');
  const rootRef = useRef<HTMLDivElement>(null);
  const autoCycleRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const element = entry.target as HTMLElement;
        const delay = parseInt(element.style.transitionDelay || '0', 10);
        setTimeout(() => {
          element.classList.add('visible');
        }, delay);
        observer.unobserve(element);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    root.querySelectorAll('.reveal').forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const panels: PanelId[] = ['panel-1', 'panel-2', 'panel-3'];
    let index = 0;

    autoCycleRef.current = setInterval(() => {
      index += 1;
      if (index >= panels.length) {
        if (autoCycleRef.current) clearInterval(autoCycleRef.current);
        autoCycleRef.current = null;
        return;
      }
      setActivePanel(panels[index]);
    }, 1800);

    return () => {
      if (autoCycleRef.current) clearInterval(autoCycleRef.current);
    };
  }, []);

  const handlePanelSelect = (panel: PanelId) => {
    if (autoCycleRef.current) {
      clearInterval(autoCycleRef.current);
      autoCycleRef.current = null;
    }
    setActivePanel(panel);
  };

  return (
    <div
      ref={rootRef}
      style={{ fontFamily: "var(--font-work-sans), 'Work Sans', sans-serif", background: '#fff8f0', color: '#1e1b15' }}
      className="min-h-screen antialiased selection:bg-[#3D5A35]/20 selection:text-[#3B2F2F]"
    >
      <style>{`
        .font-headline { font-family: var(--font-newsreader), 'Newsreader', serif; }
        .font-body { font-family: var(--font-work-sans), 'Work Sans', sans-serif; }
        .font-label { font-family: var(--font-work-sans), 'Work Sans', sans-serif; }
        .material-symbols-outlined {
          font-family: 'Material Symbols Outlined';
          font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;
        }
        .reveal {
          opacity: 0;
          transform: translateY(32px);
          transition: all 0.8s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .reveal.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .founder-card {
          background: #f4ede3;
          border: 1px solid rgba(61,90,53,0.08);
          padding: 36px 28px;
          position: relative;
          overflow: hidden;
          transition: transform 0.4s ease, box-shadow 0.4s ease;
          display: flex;
          flex-direction: column;
        }
        .founder-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 16px 48px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04);
        }
        .founder-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #3D5A35, #695c4d);
          opacity: 0;
          transition: opacity 0.4s ease;
        }
        .founder-card:hover::before { opacity: 1; }
        .founder-avatar {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(61,90,53,0.08), rgba(69,58,42,0.08));
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
          overflow: hidden;
          position: relative;
        }
        .founder-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .founder-avatar .photo-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .founder-avatar .photo-placeholder span.material-symbols-outlined {
          font-size: 28px;
          color: rgba(69,58,42,0.25);
          font-variation-settings: 'FILL' 1, 'wght' 300;
        }
        .founder-avatar .photo-placeholder .ph-label {
          font-family: var(--font-work-sans), 'Work Sans', sans-serif;
          font-size: 7px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: rgba(69,58,42,0.25);
          font-weight: 600;
        }
        .edition-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          font-family: var(--font-work-sans), 'Work Sans', sans-serif;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          font-weight: 600;
        }
        @keyframes count-up {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .stat-num { animation: count-up 0.6s ease forwards; }
        .tl-track {
          display: flex;
          align-items: flex-start;
          position: relative;
          padding: 0 48px;
        }
        .tl-line {
          position: absolute;
          top: 28px;
          left: 48px;
          right: 48px;
          height: 2px;
          background: linear-gradient(90deg, #453a2a 0%, #695c4d 40%, #3D5A35 100%);
          z-index: 0;
        }
        .tl-node {
          position: relative;
          z-index: 2;
          flex: 0 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          transition: transform 0.3s ease;
          background: transparent;
          border: none;
          padding: 0;
        }
        .tl-node:hover { transform: translateY(-4px); }
        .tl-dot {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.4s cubic-bezier(0.22,1,0.36,1);
          box-shadow: 0 2px 12px rgba(0,0,0,0.06);
        }
        .tl-node:hover .tl-dot {
          box-shadow: 0 8px 32px rgba(0,0,0,0.12);
          transform: scale(1.1);
        }
        .tl-node.active .tl-dot {
          transform: scale(1.15);
          box-shadow: 0 8px 32px rgba(61,90,53,0.2);
          animation: tl-pulse 2.4s ease-in-out infinite;
        }
        @keyframes tl-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(61,90,53,0.25); }
          50% { box-shadow: 0 0 0 12px rgba(61,90,53,0); }
        }
        .tl-year {
          font-family: var(--font-work-sans), 'Work Sans', sans-serif;
          font-size: 10px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          font-weight: 600;
          margin-top: 12px;
          transition: color 0.3s;
        }
        .tl-label {
          font-family: var(--font-newsreader), 'Newsreader', serif;
          font-size: 13px;
          font-style: italic;
          margin-top: 4px;
          transition: color 0.3s;
          max-width: 120px;
          text-align: center;
          line-height: 1.3;
        }
        .tl-panel {
          opacity: 0;
          transform: translateY(16px);
          transition: all 0.5s cubic-bezier(0.22,1,0.36,1);
          pointer-events: none;
          position: absolute;
          left: 0;
          right: 0;
        }
        .tl-panel.active {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }
        .tl-person {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 0;
          border-bottom: 1px solid rgba(61,90,53,0.06);
          transition: opacity 0.3s;
        }
        .tl-person:last-child { border-bottom: none; }
        .tl-person:hover { opacity: 0.7; }
        .tl-person-icon {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
      `}</style>

      <main>
        <header className="pt-40 pb-20 px-8">
          <div className="max-w-4xl mx-auto text-center">
            <span className="font-label text-[10px] uppercase tracking-[0.3em] text-[#3D5A35]/50 font-semibold block mb-4">Our Story</span>
            <h1 className="font-headline text-5xl md:text-7xl text-[#453a2a] leading-[1.08] tracking-tight mb-6">
              Built by students,
              <br />
              <span className="text-[#3D5A35] italic font-light">for students.</span>
            </h1>
            <p className="font-body text-lg text-[#434840] max-w-2xl mx-auto leading-relaxed">
              Case CompendiumX is the next evolution of case interview preparation, combining structured practice with AI-driven insights. What began as a curated case repository by students, for students, has evolved into a platform that turns every practice session into a measurable step forward.
            </p>
          </div>
        </header>

        <section className="py-20 px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16 reveal">
              <span className="font-label text-[10px] uppercase tracking-[0.3em] text-[#3D5A35]/50 font-semibold block mb-3">The Team Behind CompendiumX</span>
              <h2 className="font-headline text-4xl md:text-6xl font-light text-[#453a2a] tracking-tight">Meet the Founders</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 reveal" style={{ transitionDelay: '0.15s' }}>
              {FOUNDERS.map((founder) => (
                <div key={founder.name} className="founder-card">
                  <FounderAvatar name={founder.name} photoSrc={founder.photoSrc} />
                  <h3 className="font-headline text-xl text-[#453a2a] italic mb-1">{founder.name}</h3>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="edition-badge bg-[#3D5A35]/10 text-[#3D5A35]">{founder.badge}</span>
                  </div>
                  <p className="font-body text-xs text-[#434840] leading-relaxed mb-4">{founder.description}</p>
                  <div className="flex items-center gap-2 mt-auto">
                    <span className="material-symbols-outlined text-[#3D5A35]/30" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>
                      school
                    </span>
                    <span className="font-label text-[9px] uppercase tracking-[0.15em] text-[#434840]/50">{founder.school}</span>
                  </div>
                  <a
                    href={founder.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 mt-3 text-[#3D5A35]/40 hover:text-[#3D5A35] transition-colors"
                    title="LinkedIn"
                  >
                    <LinkedInIcon />
                    <span className="font-label text-[9px] uppercase tracking-[0.1em]">LinkedIn</span>
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 px-8" style={{ background: 'linear-gradient(180deg, #fff8f0 0%, #f4ede3 50%, #fff8f0 100%)' }}>
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16 reveal">
              <span className="font-label text-[10px] uppercase tracking-[0.3em] text-[#3D5A35]/50 font-semibold block mb-3">From Book to Platform</span>
              <h2 className="font-headline text-4xl md:text-5xl font-light text-[#453a2a] tracking-tight mb-3">The Evolution</h2>
              <p className="font-body text-xs text-[#434840]/50 flex items-center justify-center gap-1.5">
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>touch_app</span>
                Click a milestone to explore
              </p>
            </div>

            <div className="relative mb-16 reveal" style={{ transitionDelay: '0.1s' }}>
              <div className="tl-line" />
              <div className="tl-track justify-between">
                {TIMELINE_NODES.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    className={`tl-node ${activePanel === node.id ? 'active' : ''}`}
                    data-panel={node.id}
                    onClick={() => handlePanelSelect(node.id)}
                  >
                    <div className="tl-dot" style={node.dotStyle}>
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: '24px', fontVariationSettings: "'FILL' 1", ...node.iconStyle }}
                      >
                        {node.icon}
                      </span>
                    </div>
                    <span className="tl-year" style={node.textStyle}>{node.year}</span>
                    <span className="tl-label" style={node.textStyle}>{node.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="relative reveal" style={{ minHeight: '280px', transitionDelay: '0.2s' }}>
              <div id="panel-1" className={`tl-panel ${activePanel === 'panel-1' ? 'active' : ''}`}>
                <div className="flex flex-col md:flex-row gap-10">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="material-symbols-outlined text-[#453a2a]/30" style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}>menu_book</span>
                      <span className="font-label text-[9px] uppercase tracking-[0.2em] text-[#453a2a]/40 font-semibold">Chapter I | The Pioneers</span>
                    </div>
                    <h3 className="font-headline text-2xl text-[#453a2a] italic mb-3">The Case Compendium</h3>
                    <p className="font-body text-sm text-[#434840] leading-relaxed">
                      DU&rsquo;s first consulting case book: 65+ real interview transcripts, frameworks & strategies. Written by SRCC students, distributed free.
                    </p>
                  </div>
                  <div className="flex-1">
                    <span className="font-label text-[9px] uppercase tracking-[0.15em] text-[#453a2a]/30 font-semibold block mb-2">SRCC • Class of 2021</span>
                    {PANEL_ONE_PEOPLE.map((person) => (
                      <div key={person.name} className="tl-person">
                        <div className="tl-person-icon" style={{ background: 'rgba(69,58,42,0.08)' }}>
                          <span className="font-headline text-[11px] text-[#453a2a]">{person.initials}</span>
                        </div>
                        <div>
                          <span className="font-body text-sm text-[#453a2a] font-medium">{person.name}</span>
                          <br />
                          <span className="font-label text-[9px] uppercase tracking-[0.1em] text-[#434840]/40">{person.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div id="panel-2" className={`tl-panel ${activePanel === 'panel-2' ? 'active' : ''}`}>
                <div className="flex flex-col md:flex-row gap-10">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="material-symbols-outlined text-[#695c4d]/30" style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}>edit_note</span>
                      <span className="font-label text-[9px] uppercase tracking-[0.2em] text-[#695c4d]/40 font-semibold">Chapter II | The Torchbearers</span>
                    </div>
                    <h3 className="font-headline text-2xl text-[#453a2a] italic mb-3">The Second Edition</h3>
                    <p className="font-body text-sm text-[#434840] leading-relaxed mb-4">
                      The tradition continues: fresh cases, updated frameworks, and a legacy that crossed <strong>1 million readers</strong>.
                    </p>
                    <div className="inline-flex items-center gap-3 bg-[#3D5A35]/[0.04] px-5 py-3">
                      <span className="font-headline text-2xl text-[#3D5A35]">1M+</span>
                      <span className="font-label text-[9px] uppercase tracking-[0.12em] text-[#434840]/40 font-semibold">readers</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <span className="font-label text-[9px] uppercase tracking-[0.15em] text-[#695c4d]/30 font-semibold block mb-2">SRCC • Class of 2022</span>
                    {PANEL_TWO_PEOPLE.map((person) => (
                      <div key={person.name} className="tl-person">
                        <div className="tl-person-icon" style={{ background: 'rgba(105,92,77,0.08)' }}>
                          <span className="font-headline text-[11px] text-[#695c4d]">{person.initials}</span>
                        </div>
                        <div>
                          <span className="font-body text-sm text-[#453a2a] font-medium">{person.name}</span>
                          <br />
                          <span className="font-label text-[9px] uppercase tracking-[0.1em] text-[#434840]/40">{person.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div id="panel-3" className={`tl-panel ${activePanel === 'panel-3' ? 'active' : ''}`}>
                <div className="flex flex-col md:flex-row gap-10">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="material-symbols-outlined text-[#3D5A35]/30" style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}>rocket_launch</span>
                      <span className="font-label text-[9px] uppercase tracking-[0.2em] text-[#3D5A35]/40 font-semibold">Chapter III | The Platform Era</span>
                    </div>
                    <h3 className="font-headline text-2xl text-[#3D5A35] italic mb-3">
                      Case Compendium<span className="font-bold not-italic">X</span>
                    </h3>
                    <p className="font-body text-sm text-[#434840] leading-relaxed">
                      Books are static. Your growth isn&rsquo;t. AI analytics, performance dashboards, voice-powered practice; every session is now a measurable step forward.
                    </p>
                  </div>
                  <div className="flex-1">
                    <div className="grid grid-cols-2 gap-3">
                      {PLATFORM_FEATURES.map((feature) => (
                        <div key={feature.label} className="flex items-center gap-3 bg-[#3D5A35]/[0.04] p-4 rounded">
                          <span className="material-symbols-outlined text-[#3D5A35]" style={{ fontSize: '22px', fontVariationSettings: "'FILL' 1" }}>
                            {feature.icon}
                          </span>
                          <span className="font-body text-xs text-[#1e1b15] font-medium">{feature.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-10 px-8">
          <div className="max-w-3xl mx-auto text-center reveal">
            <h2 className="font-headline text-3xl md:text-4xl font-light text-[#453a2a] tracking-tight mb-6">Ready to start your journey?</h2>
            <Link
              href="/"
              className="inline-block bg-[#3D5A35] text-white px-10 py-4 text-xs uppercase tracking-[0.2em] hover:bg-[#3D5A35]/90 transition-all"
            >
              Explore
            </Link>
          </div>
        </section>
      </main>

      <Footer currentPage="about" />
    </div>
  );
};

export default AboutPage;
