'use client';

import { useEffect, useRef, useState } from 'react';
import Footer from '@/components/dashboard/Footer';
import Link from 'next/link';
import Image from 'next/image';

type EditionEra = 'ink' | 'mid' | 'digital';

const EDITION_DETAILS: Record<EditionEra, { chapter: string; title: string; body: string; meta: string }> = {
  ink: {
    chapter: 'Chapter I • The Pioneers',
    title: 'The Case Compendium',
    body: 'DU’s first consulting case book: 65+ real interview transcripts, frameworks & strategies. Written by SRCC students, distributed free.',
    meta: 'SRCC • Class of 2021',
  },
  mid: {
    chapter: 'Chapter II • The Torchbearers',
    title: 'The Second Edition',
    body: 'The tradition continues: fresh cases, updated frameworks, and a legacy that crossed 1 million readers.',
    meta: 'SRCC • Class of 2022 • 1M+ readers',
  },
  digital: {
    chapter: 'Chapter III • The Platform Era',
    title: 'Case CompendiumX',
    body: 'Books are static. Your growth isn’t. AI analytics, performance dashboards, voice-powered practice; every session is now a measurable step forward.',
    meta: 'Case Repository • 3 AI Personas • Dashboard • Voice LLM',
  },
}

type Contributor = {
  name: string;
  role: string;
  bio: string;
  school?: string;
  linkedin?: string;
  photoSrc?: string;
  objectPosition?: string;
  zoom?: number;
zoomOrigin?: string;
  x: number;
  y: number;
};

type Edition = {
  year: string;
  chapter: string;
  title: string;
  era: EditionEra;
  icon: string;
  stat?: { value: string; label: string };
  anchor: { x: number; y: number };
  people: Contributor[];
};

const EDITIONS: Edition[] = [
  {
    year: '2021', chapter: 'Chapter I', title: 'The Case Compendium', era: 'ink', icon: 'menu_book',
    stat: { value: '65+', label: 'cases' }, anchor: { x: 12, y: 26 },
    people: [
      { name: 'Aradhita Tuli', role: "TETR • ex-Accenture", school: 'SRCC • Class of 2021', x: 6, y: 11,   photoSrc: '/team/aradhita-tuli.jpeg', linkedin: 'https://www.linkedin.com/in/aradhita-tuli-0a939216a/',
        bio: "Aradhita began her career at Accenture Strategy, building on a foundation of critical thinking from her days as an avid college debater. Pivoting from consulting to hands-on execution, she moved to the operating side and is currently driving growth and strategy at TETR College of Business." },
      { name: 'Nimisha Singh', role: 'Agoda • ex-Bain', school: 'SRCC • Class of 2021', x: 24, y: 17,   photoSrc: '/team/nimisha-singh.jpeg', objectPosition: 'center 15%',linkedin: 'https://www.linkedin.com/in/nimisha-singh-03637916a/',
        bio: "Nimisha was India's EY Corporate Finance Woman of the Year, 2021 and globally represented the country. The McKinsey NGWL alum interned at Walmart, EY & ScaleFactor Consulting. Coupled with being a Senior Coordinator, she headed the PR department of The Placement Cell, SRCC. Former Head Girl of her school, she is also a Zonal Gold Medalist in athletics & loves cryptic languages." },
      { name: 'Rahul Prasad', role: 'HBS • ex-Advent, Kearney', school: 'SRCC • Class of 2021', x: 2, y: 41,   photoSrc: '/team/rahul-prasad.jpeg', linkedin: 'https://www.linkedin.com/in/rahul-prasad-289422178/',
        bio: 'Rahul is currently pursuing his MBA at Harvard Business School, where he spent the summer with Capital Group in Singapore. Prior to HBS, he worked in private equity at Advent International after beginning his career in consulting at Kearney. During his time at SRCC, he was a member of the Debating Society, where he won SRCC’s 1st ever national debate competition at RGNUL. Rahul is passionate about sports and was the fastest athlete in Karnataka in 2017 and 2018.' },
      { name: 'Tushar Bagrodia', role: 'Eight Roads • ex-Kearney', school: 'SRCC • Class of 2021', x: 20, y: 43,   photoSrc: '/team/tushar-bagrodia.jpeg', linkedin: 'https://www.linkedin.com/in/tusharbagrodia/',
        bio: "Tushar discovered his love for consulting during his time at 180 Degrees Consulting, SRCC, and went on to intern at Berkeley Research Group before cracking two consulting offers. A couple of years at Kearney opened the door to venture capital - he has since been investing at Eight Roads Ventures, where he focuses on climate and technology. He has fond memories as the beatboxer of SRCC's Western Music Society." },
    ],
  },
  {
    year: '2022', chapter: 'Chapter II', title: 'The Second Edition', era: 'mid', icon: 'edit_note',
    stat: { value: '1M+', label: 'readers' }, anchor: { x: 50, y: 40 },
    people: [
      { name: 'Parth Chowdhary', role: 'Warburg Pincus • ex-McKinsey', school: 'SRCC • Class of 2022', x: 53, y: 24.5,   photoSrc: '/team/parth-chowdhary.jpeg', linkedin: 'https://www.linkedin.com/in/parth-chowdhary/',
        bio: "Parth interned at Citi and an edtech startup. He served as the President of The Economics Society, SRCC, engaging with global leaders & Nobel Laureates. He bagged offers from McKinsey & BCG. He emerged as Global Champion at the world’s largest undergraduate case competition by HSBC, and also won accolades across LSE & Univ. of Indonesia. This CAT 99.99 %iler and GMAT 770 scorer has been admitted to Kellogg’s Future Leaders program." },
      { name: 'Pratham Kalra', role: 'Filter Capital • ex-L.E.K.', school: 'SRCC • Class of 2022', x: 47, y: 57,   photoSrc: '/team/pratham-kalra.jpeg', linkedin: 'https://www.linkedin.com/in/prathamkalra/',
        bio: 'Pratham interned at Willis Towers Watson in the summer of his pre-final year in college. He is a passionate debater who led the Debating Society in college and was also the Chief Events Coordinator for Business Conclave 2022, Asia’s largest undergraduate management fest. Pratham was part of the team that represented India at the HSBC Global Case Competition 2021 and emerged victorious for the first time in the competition’s history.' },
    ],
  },
  {
    year: 'Now', chapter: 'Chapter III', title: 'Case CompendiumX', era: 'digital', icon: 'rocket_launch',
    stat: { value: '3', label: 'AI personas' }, anchor: { x: 88, y: 44 },
    people: [
      { name: 'Nitya Mall', role: 'McKinsey', school: 'SRCC • Class of 2026', x: 81, y: 31,
        linkedin: 'https://in.linkedin.com/in/nitya-mall-5a8728286/', photoSrc: '/team/nitya-mall.jpg',
        bio: 'Received a PPO from McKinsey & Co. Previously interned at Nomura Research Institute & Samsung. Conferred the L.N. Birla Gold Medal, she served as Strategy Head at the Placement Cell, SRCC.' },
      { name: 'Pratik Agarwal', role: 'Goldman Sachs', school: 'SRCC • Class of 2026', x: 99, y: 34,
        linkedin: 'https://in.linkedin.com/in/agpratik/', photoSrc: '/team/pratik-agarwal.jpg', objectPosition: 'center 42%',
        bio: 'Previously interned at Windrose Capital, a Series-A VC fund. Served as Corporate Communications Head at the Placement Cell, SRCC.' },
      { name: 'Saksham Didwania', role: 'Kearney', school: 'SRCC • Class of 2026', x: 78, y: 56,
        linkedin: 'https://in.linkedin.com/in/sakshamd26', photoSrc: '/team/saksham-didwania.jpg',
        bio: 'Received a PPO from Accenture Strategy & interned at Samara Capital, a PE fund. With accolades in National Abacus & Chess, he served as Secretary General at the Placement Cell, SRCC.' },
      { name: 'Tanvi Bansal', role: 'Goldman Sachs • Intern', school: 'SRCC • Class of 2027', x: 99.5, y: 59,
        linkedin: 'https://in.linkedin.com/in/tanvi-bansal-298786233/', photoSrc: '/team/tanvi-bansal.jpg', objectPosition: 'center 46%', zoom: 1.15, zoomOrigin: '38% 46%',
        bio: 'Interned at Grant Thornton & Michael Page. A global semifinalist at Wharton & Bharatnatyam graduate, she served as Corporate Communications Head at the Placement Cell, SRCC.' },
    ],
  },
];

const ERA_INDEX: Record<EditionEra, number> = { ink: 0, mid: 1, digital: 2 };

// Lineage line: a meandering S-curve that walks from off the top-left corner,
// through each era anchor's center, and out off the bottom-right corner.
const SPINE_POINTS = [
  { x: -12, y: 17 },
  { x: 16, y: 27 },
  { x: 33, y: 31 },
  { x: 50, y: 40 },
  { x: 67, y: 43 },
  { x: 84, y: 44 },
  { x: 114, y: 47 },
];

const smoothPath = (pts: { x: number; y: number }[]) => {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
};

const fieldFor = (e: Edition) => {
  const xs = e.people.map((p) => p.x);
  const ys = e.people.map((p) => p.y);
  const padX = 8;
  const padY = 10;
  const minX = Math.min(...xs) - padX;
  const maxX = Math.max(...xs) + padX;
  const minY = Math.min(...ys) - padY;
  const maxY = Math.max(...ys) + padY;
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
};

const initialsOf = (name: string) =>
  name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

function NodeAvatar({ person }: { person: Contributor }) {
  const [err, setErr] = useState(false);
  const showImg = !!person.photoSrc && !err;
  return (
    <span className="cst-avatar">
      {showImg ? (
        <Image
          src={person.photoSrc as string}
          alt=""
          fill
          sizes="84px"
          quality={80}
          style={{
	objectFit: 'cover',
	objectPosition: person.objectPosition,
	transform: person.zoom ? `scale(${person.zoom})` : undefined,
	transformOrigin: person.zoomOrigin,
}}
          onError={() => setErr(true)}
        />
      ) : (
        <span className="cst-avatar-mono">{initialsOf(person.name)}</span>
      )}
    </span>
  );
}

const OurStory = () => {
const sceneRef = useRef<HTMLDivElement | null>(null);
const universeRef = useRef<HTMLDivElement | null>(null);
const heroRef = useRef<HTMLElement | null>(null);
const stageRef = useRef<HTMLElement | null>(null);
  const [live, setLive] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);
  const [active, setActive] = useState<{ person: Contributor; edition: Edition } | null>(null);
  const [dims, setDims] = useState({ w: 1280, h: 660 });
  const [hoveredEra, setHoveredEra] = useState<EditionEra | null>(null)

  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLive(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
  const els = document.querySelectorAll<HTMLElement>('.cst-root .reveal');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target as HTMLElement;
        const delay = parseInt(el.style.transitionDelay || '0', 10);
        setTimeout(() => el.classList.add('visible'), delay);
        observer.unobserve(el);
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );
  els.forEach((el) => observer.observe(el));
  return () => observer.disconnect();
}, []);

  useEffect(() => {
    const el = universeRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        if (width && height) setDims({ w: width, h: height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

 useEffect(() => {
  if (typeof window === 'undefined') return;
  if (window.innerWidth <= 860) return; // mobile: fully natural scroll
  const stage = stageRef.current;
  if (!stage) return;
  let lock = false;
  let accum = 0;
  let lastTs = 0;
  const inHero = () => window.scrollY < window.innerHeight * 0.5;
  const commit = () => {
    lock = true;
    accum = 0;
    setLive(true);
    stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => { lock = false; }, 900);
  };
  const onWheel = (e: WheelEvent) => {
    if (active) return;
    if (lock) { e.preventDefault(); return; }
    if (!inHero() || e.deltaY <= 0) { accum = 0; return; } // slow / other → natural scroll
    const now = performance.now();
    if (now - lastTs > 140) accum = 0; // sliding velocity window
    lastTs = now;
    accum += e.deltaY;
    if (accum > 160) { e.preventDefault(); commit(); } // fast flick → smooth snap
  };
  window.addEventListener('wheel', onWheel, { passive: false });
  return () => window.removeEventListener('wheel', onWheel);
}, [active]);

const onMove = (e: React.MouseEvent) => {
    const s = sceneRef.current;
    if (!s) return;
    const r = s.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width;
    const my = (e.clientY - r.top) / r.height;
    s.style.setProperty('--mx', `${(mx * 100).toFixed(1)}%`);
    s.style.setProperty('--my', `${(my * 100).toFixed(1)}%`);
    s.style.setProperty('--px', `${(mx - 0.5).toFixed(3)}`);
    s.style.setProperty('--py', `${(my - 0.5).toFixed(3)}`);
    s.style.setProperty('--gx', `${e.clientX}px`);
s.style.setProperty('--gy', `${e.clientY}px`);
  };

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(null);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [active]);

  const spineD = smoothPath(SPINE_POINTS.map((p) => ({ x: (p.x / 100) * dims.w, y: (p.y / 100) * dims.h })));

  let nodeIndex = 0;

  return (
    <div className="cst-root">
          {hoveredEra && (
  <aside className={`cst-edition-overlay cst-edition-overlay--${hoveredEra}`} role="status" aria-live="polite">
    <span className="cst-overlay-info" aria-hidden="true">
      <span className="material-symbols-outlined">info</span>
    </span>
    <span className="cst-overlay-chapter">{EDITION_DETAILS[hoveredEra].chapter}</span>
    <h3 className="cst-overlay-title">{EDITION_DETAILS[hoveredEra].title}</h3>
    <p className="cst-overlay-body">{EDITION_DETAILS[hoveredEra].body}</p>
  </aside>
)}
<header className="cst-hero" ref={heroRef}>
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

  <div className="text-center mt-32 reveal">
    <span className="font-label text-[10px] uppercase tracking-[0.3em] text-[#3D5A35]/50 font-semibold block mb-3">The Team Behind Case Compendium</span>
    <h2 className="font-headline text-4xl md:text-6xl font-light text-[#453a2a] tracking-tight">Meet the Founders</h2>
  </div>

  <button
    type="button"
    className="cst-hero-cue"
    onClick={() => {
      setLive(true);
      stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }}
    aria-label="Scroll to timeline"
  >
    <span className="material-symbols-outlined">keyboard_arrow_down</span>
  </button>
</header>

<section className="cst-stage" ref={stageRef}>
  <section
    className={`cst-scene${live ? ' live' : ''}${focus !== null ? ' has-focus' : ''}`}
    ref={sceneRef}
    onMouseMove={onMove}
    onMouseLeave={() => setFocus(null)}
    aria-label="The constellation of Case Compendium contributors"
  >

        <div className="cst-aura" aria-hidden="true" />
        <div className="cst-nebula n0" aria-hidden="true" />
        <div className="cst-nebula n1" aria-hidden="true" />
        <div className="cst-nebula n2" aria-hidden="true" />
        <div className="cst-motes" aria-hidden="true">
          {Array.from({ length: 22 }).map((_, i) => (
            <span key={i} style={{
              left: `${(i * 37) % 100}%`,
              top: `${(i * 61) % 100}%`,
              animationDelay: `${(i % 7) * 0.8}s`,
              animationDuration: `${6 + (i % 5)}s`,
            }} />
          ))}
        </div>

        <div
          className="cst-universe"
          ref={universeRef}
          style= {{transform: 'translate(calc(var(--px) * -22px), calc(var(--py) * -16px))' }}
        >
          {EDITIONS.map((edition) => {
            const z = ERA_INDEX[edition.era];
            const f = fieldFor(edition);
            return (
              <div
                key={`field-${edition.title}`}
                className={`cst-field era-${edition.era}${focus === z ? ' is-focus' : ''}`}
                aria-hidden="true"
                style={{ left: `${f.left}%`, top: `${f.top}%`, width: `${f.width}%`, height: `${f.height}%` }}
              />
            );
          })}

          

          <svg className="cst-spine-svg" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="cstSpineGrad" x1="0" y1="0" x2={dims.w} y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#c2a585" />
                <stop offset="45%" stopColor="#8a7960" />
                <stop offset="100%" stopColor="#3D5A35" />
              </linearGradient>
            </defs>
            <path className="cst-spine" d={spineD} pathLength={1} stroke="url(#cstSpineGrad)" />
            <path className="cst-spine-shimmer" d={spineD} pathLength={1} />
          </svg>

          {EDITIONS.map((edition) => {
            const z = ERA_INDEX[edition.era];
            return (
              <div key={edition.title} className={`cst-cluster era-${edition.era}${focus === z ? ' is-focus' : ''}`}>
                <div
                  className="cst-anchor"
onMouseEnter={() => setHoveredEra(edition.era)}
onMouseLeave={() => setHoveredEra(null)}
onFocus={() => setHoveredEra(edition.era)}
onBlur={() => setHoveredEra(null)}
                  style={{ left: `${edition.anchor.x}%`, top: `${edition.anchor.y}%`, transitionDelay: `${0.5 + z * 0.5}s`, ['--gd']: `${z * 0.05}s` } as React.CSSProperties}
                >
                  <span className="cst-anchor-ring" aria-hidden="true" />
                  <span className="cst-anchor-core">
                    <span className="material-symbols-outlined">{edition.icon}</span>
                  </span>
                  <span className="cst-anchor-meta">
                    <span className="cst-anchor-year">{edition.year}</span>
                    <span className="cst-anchor-title">{edition.title}</span>
                    {edition.stat && (
                      <span className="cst-anchor-stat"><b>{edition.stat.value}</b> {edition.stat.label}</span>
                    )}
                  </span>
                </div>

                {edition.people.map((person, j) => {
                  const delay = 0.85 + z * 0.5 + j * 0.12;
                  const gd = nodeIndex * 0.05;
                  nodeIndex += 1;
                  return (
                    <button
                      type="button"
                      key={person.name + j}
                      className={`cst-node cst-node--${edition.era}`}
onMouseEnter={() => setFocus(z)}
onMouseLeave={() => setFocus(null)}

                      onClick={() => setActive({ person, edition })}
                      style={{ left: `${person.x}%`, top: `${person.y}%`, transitionDelay: `${delay}s`, ['--gd']: `${gd}s` } as React.CSSProperties}
                    >
                      <span className="cst-orb"><NodeAvatar person={person} /></span>
                      <span className="cst-label">
                        <span className="cst-label-name">{person.name}</span>
                        <span className="cst-label-role">{person.role}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
  </div>
  </section>
</section>

<section className="-mt-[279px] relative z-10 pt-20 md:pt-28 pb-10 px-8">
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

{active && (
        <div className="cst-dossier-backdrop" onClick={() => setActive(null)}>
          <div className="cst-dossier" role="dialog" aria-modal="true" aria-label={active.person.name} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="cst-dossier-close" aria-label="Close" onClick={() => setActive(null)}>
              <span className="material-symbols-outlined">close</span>
            </button>
            <div className="cst-dossier-head">
              <span className="cst-dossier-photo"><NodeAvatar person={active.person} /></span>
              <div>
                <p className="cst-dossier-edition">{active.edition.chapter} · {active.edition.year}</p>
                <h3 className="cst-dossier-name">{active.person.name}</h3>
                <span className="cst-dossier-role">{active.person.role}</span>
              </div>
            </div>
            <p className="cst-dossier-bio">{active.person.bio}</p>
            <div className="cst-dossier-foot">
              {active.person.school && <span className="cst-dossier-school">{active.person.school}</span>}
              {active.person.linkedin && (
                <a className="cst-dossier-link" href={active.person.linkedin} target="_blank" rel="noopener noreferrer">
                  LinkedIn <span className="material-symbols-outlined">arrow_outward</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

export default OurStory;