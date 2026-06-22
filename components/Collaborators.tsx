'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Footer from '@/components/dashboard/Footer'

const FIRMS = [
  { name: 'Accenture Strategy',       people: ['Chhavi Atal', 'Kaavya Singhal', 'Latika Dutta'] },
  { name: 'Auctus Advisors',          people: ['Khushi Goyal', 'Parineet Choudhary'] },
  { name: 'Bain & Company',           people: ['Aarushi Gupta', 'Krtin Tandon', 'Vaibhav Garg', 'Vedant S. Jangam'] },
  { name: 'Bain Capability Network',  people: ['Agrim Jain', 'Kinshuk Soperna', 'Mahir Dhariwal', 'Satvik Agarwal', 'Yashwardhan Saraf'] },
  { name: 'Boston Consulting Group',  people: ['Anirudh Arya', 'Rishabh Bafna', 'Yash Ajmera'] },
  { name: 'Dalberg',                  people: ['Harshit Jain', 'Jatin Jindal', 'Shreya Roy'] },
  { name: 'FTI Consulting',           people: ['Ishaan Mittal'] },
  { name: 'J.P. Morgan Chase & Co.', people: ['Neharika Garg'] },
  { name: 'Kearney',                  people: ['Khushi Bhojnagarwala', 'Siddharth Bapna'] },
  { name: 'L.E.K. Consulting',        people: ['Jasleen Allagh'] },
  { name: 'McKinsey & Co.',           people: ['Aanam Ahmed', 'Ansh Aggarwal', 'Himanshu Chhabra', 'Jayani Shah', 'Kriteesha Janveja'] },
  { name: 'Monitor Deloitte',         people: ['Amrit Chadha'] },
  { name: 'Z.S. Associates',          people: ['Aarsh Nayyar', 'Chaitanya Sahwney', 'Kshitij Singh', 'Nakul Gupta'] },
]

const TOTAL_PEOPLE = FIRMS.reduce((s, f) => s + f.people.length, 0)
const TOTAL_FIRMS  = FIRMS.length

const PAGE_CSS = `
  /* ── Root ─────────────────────────────────────────── */
  .cl-root {
    font-family: 'Work Sans', sans-serif;
    background: #fff8f0;
    color: #453a2a;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }
  .cl-root *::selection { background: rgba(61,90,53,.15); color: #3b2f2f; }

  /* ── Scroll reveal ─────────────────────────────────── */
  .reveal {
    opacity: 0;
    transform: translateY(28px);
    transition: opacity .9s cubic-bezier(.22,1,.36,1),
                transform .9s cubic-bezier(.22,1,.36,1);
  }
  .reveal.visible { opacity: 1; transform: translateY(0); }

  /* ── Hero ──────────────────────────────────────────── */
  .cl-hero {
    position: relative;
    padding: 140px 40px 80px;
    max-width: 920px;
    margin: 0 auto;
    overflow: hidden;
  }
  .cl-hero-bg {
    position: absolute;
    right: -20px;
    top: 50%;
    transform: translateY(-46%);
    font-family: 'Newsreader', serif;
    font-size: clamp(200px, 28vw, 340px);
    line-height: 1;
    color: rgba(61,90,53,.042);
    user-select: none;
    pointer-events: none;
    font-weight: 300;
    letter-spacing: -.04em;
  }
  .cl-eyebrow {
    display: block;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .3em;
    color: rgba(61,90,53,.5);
    margin-bottom: 20px;
  }
  .cl-headline {
    font-family: 'Newsreader', serif;
    font-size: clamp(52px, 9vw, 92px);
    line-height: 1.0;
    color: #453a2a;
    font-weight: 300;
    letter-spacing: -.02em;
    margin-bottom: 24px;
  }
  .cl-subtext {
    font-size: 16px;
    line-height: 1.8;
    color: #5a4f43;
    max-width: 520px;
    margin-bottom: 40px;
  }

  /* ── Stats ─────────────────────────────────────────── */
  .cl-stats { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
  .cl-stat  { display: flex; align-items: baseline; gap: 8px; }
  .cl-stat-num {
    font-family: 'Newsreader', serif;
    font-size: 30px;
    font-weight: 400;
    color: #3D5A35;
    line-height: 1;
    min-width: 2ch;
  }
  .cl-stat-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .2em;
    color: rgba(69,58,42,.4);
  }
  .cl-stat-divider { width: 1px; height: 28px; background: rgba(61,90,53,.15); }

  /* ── Firm list ─────────────────────────────────────── */
  .cl-list { padding: 8px 40px 88px; }
  .cl-container { max-width: 920px; margin: 0 auto; }

  /* Firm block — no hover on the container; rule draws itself on scroll */
  .cl-firm {
    position: relative;
    padding: 44px 0 40px;
  }

  /* Top rule sweeps left → right when .active is added */
  .cl-firm::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    height: 1px;
    width: 0;
    background: rgba(61,90,53,.18);
    transition: width .8s cubic-bezier(.22,1,.36,1);
  }
  .cl-firm.active::before { width: 100%; }

  /* Closing rule under the last firm */
  .cl-firm:last-child::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    height: 1px;
    width: 0;
    background: rgba(61,90,53,.18);
    transition: width .8s cubic-bezier(.22,1,.36,1) .15s;
  }
  .cl-firm:last-child.active::after { width: 100%; }

  /* Firm header slides in from left when active */
  .cl-firm-header {
    margin-bottom: 24px;
    opacity: 0;
    transform: translateX(-20px);
    transition: opacity .7s cubic-bezier(.22,1,.36,1),
                transform .7s cubic-bezier(.22,1,.36,1);
  }
  .cl-firm.active .cl-firm-header { opacity: 1; transform: translateX(0); }

  /* Firm label — muted by default, sharpens only when a name inside is hovered */
  .cl-firm-name {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .24em;
    color: rgba(61,90,53,.55);
    transition: letter-spacing .55s ease, color .4s ease;
  }
  .cl-firm:has(.cl-name:hover) .cl-firm-name {
    letter-spacing: .29em;
    color: #3D5A35;
  }

  /* Names — flex wrap, each name enters via JS .name-active */
  .cl-names {
    display: flex;
    flex-wrap: wrap;
    column-gap: 52px;
    row-gap: 14px;
  }

  /* Names start hidden; JS staggers them in */
  .cl-firm .cl-name {
    font-family: 'Newsreader', serif;
    font-size: 26px;
    font-style: italic;
    font-weight: 400;
    color: #453a2a;
    cursor: default;
    position: relative;
    padding-bottom: 3px;
    line-height: 1.4;
    white-space: nowrap;
    opacity: 0;
    transform: translateY(18px) scale(.97);
    filter: blur(5px);
    transition: opacity .7s cubic-bezier(.22,1,.36,1),
                transform .7s cubic-bezier(.22,1,.36,1),
                filter .7s cubic-bezier(.22,1,.36,1),
                color .3s ease,
                text-shadow .4s ease;
  }
  .cl-firm .cl-name.name-active {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }

  /* Underline sweeps in, name glows on hover */
  .cl-name::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 0;
    height: 1px;
    background: #3D5A35;
    transition: width .4s cubic-bezier(.22,1,.36,1);
  }
  .cl-name:hover { color: #3D5A35; text-shadow: 0 0 28px rgba(61,90,53,.18); }
  .cl-name:hover::after { width: 100%; }

  /* Focus effect — hover one name, the rest recede */
  .cl-names:has(.cl-name:hover) .cl-name:not(:hover) {
    opacity: .18;
    transition: opacity .22s ease,
                transform .7s cubic-bezier(.22,1,.36,1),
                filter .7s cubic-bezier(.22,1,.36,1),
                color .3s ease,
                text-shadow .4s ease;
  }

  /* ── Closing ────────────────────────────────────────── */
  .cl-closing {
    position: relative;
    overflow: hidden;
    padding: 88px 40px;
    background: linear-gradient(180deg, #fff8f0 0%, #f4ede3 55%, #fff8f0 100%);
  }
  .cl-closing::before {
    content: '';
    position: absolute;
    width: 600px;
    height: 380px;
    top: 50%;
    left: 50%;
    background: radial-gradient(ellipse at center, rgba(61,90,53,.09) 0%, transparent 65%);
    animation: closingAura 7s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes closingAura {
    0%, 100% { opacity: .5; transform: translate(-50%,-50%) scale(.95); }
    50%       { opacity: 1;  transform: translate(-50%,-50%) scale(1.06); }
  }
  .cl-closing-inner {
    max-width: 600px;
    margin: 0 auto;
    text-align: center;
    position: relative;
    z-index: 1;
  }
  .cl-closing-rule {
    width: 0;
    height: 1px;
    background: rgba(61,90,53,.25);
    margin: 0 auto 32px;
    transition: width .7s cubic-bezier(.22,1,.36,1) .3s;
  }
  .cl-closing-inner.visible .cl-closing-rule { width: 48px; }
  .cl-closing-eyebrow {
    display: block;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .3em;
    color: rgba(61,90,53,.4);
    margin-bottom: 28px;
    cursor: default;
    transition: letter-spacing .6s ease, color .5s ease;
  }
  .cl-closing-eyebrow:hover { letter-spacing: .42em; color: rgba(61,90,53,.65); }
  .cl-closing-pull {
    font-family: 'Newsreader', serif;
    font-size: 26px;
    font-style: italic;
    font-weight: 300;
    color: #453a2a;
    line-height: 1.4;
    margin-bottom: 24px;
    cursor: default;
    transition: color .5s ease, text-shadow .5s ease;
  }
  .cl-closing-pull:hover {
    color: #3D5A35;
    text-shadow: 0 0 32px rgba(61,90,53,.2), 0 0 80px rgba(61,90,53,.08);
  }
  .cl-closing-body {
    font-size: 15px;
    line-height: 1.9;
    color: #5a4f43;
  }

  /* ── CTA ─────────────────────────────────────────────── */
  .cl-cta { padding: 56px 40px 80px; text-align: center; }
  .cl-cta-heading {
    font-family: 'Newsreader', serif;
    font-size: 28px;
    font-weight: 300;
    color: #453a2a;
    letter-spacing: -.01em;
    line-height: 1.2;
    margin-bottom: 24px;
  }

  /* ── Responsive ─────────────────────────────────────── */
  @media (max-width: 640px) {
    .cl-hero    { padding: 118px 24px 60px; }
    .cl-hero-bg { opacity: .025; right: -12px; }
    .cl-list    { padding: 0 24px 64px; }
    .cl-closing { padding: 64px 24px; }
    .cl-cta     { padding: 40px 24px 64px; }
    .cl-stat-divider { display: none; }
    .cl-stats   { gap: 14px; }
    .cl-firm    { padding: 28px 0 24px; }
    .cl-names   { column-gap: 28px; row-gap: 10px; }
    .cl-name    { white-space: normal; font-size: 22px; }
  }
`

export default function Collaborators() {
  const rootRef  = useRef<HTMLDivElement>(null)
  const animRef  = useRef(false)
  const [displayPeople, setDisplayPeople] = useState(0)
  const [displayFirms,  setDisplayFirms]  = useState(0)

  /* General reveal observer — hero, closing, CTA */
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const el = entry.target as HTMLElement
          const delay = parseInt(el.style.transitionDelay || '0', 10)
          setTimeout(() => el.classList.add('visible'), delay)
          io.unobserve(el)
        })
      },
      { threshold: 0.08, rootMargin: '0px 0px -32px 0px' },
    )
    root.querySelectorAll('.reveal').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  /* Firm observer — adds .active (header slides) then staggers .name-active per name */
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const timeouts: ReturnType<typeof setTimeout>[] = []
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const firm = entry.target as HTMLElement
          firm.classList.add('active')
          const names = Array.from(firm.querySelectorAll<HTMLElement>('.cl-name'))
          names.forEach((name, j) => {
            const t = setTimeout(() => name.classList.add('name-active'), 150 + j * 90)
            timeouts.push(t)
          })
          io.unobserve(firm)
        })
      },
      { threshold: 0.15, rootMargin: '0px 0px -80px 0px' },
    )
    root.querySelectorAll('.cl-firm').forEach((el) => io.observe(el))
    return () => {
      io.disconnect()
      timeouts.forEach(clearTimeout)
    }
  }, [])

  /* Count-up on mount */
  useEffect(() => {
    if (animRef.current) return
    animRef.current = true
    const frames   = 50
    const interval = 1400 / frames
    let f = 0
    const timer = setInterval(() => {
      f += 1
      const ease = 1 - Math.pow(1 - f / frames, 3)
      setDisplayPeople(Math.round(ease * TOTAL_PEOPLE))
      setDisplayFirms(Math.round(ease * TOTAL_FIRMS))
      if (f >= frames) clearInterval(timer)
    }, interval)
    return () => clearInterval(timer)
  }, [])

  return (
    <div ref={rootRef} className="cl-root">
      <style>{PAGE_CSS}</style>

      <main>
        {/* ── Hero ─────────────────────────────────────── */}
        <header className="cl-hero">
          <div className="cl-hero-bg" aria-hidden="true">{displayPeople}</div>

          <span className="cl-eyebrow reveal" style={{ transitionDelay: '0ms' }}>
            Acknowledgements
          </span>

          <h1 className="cl-headline reveal" style={{ transitionDelay: '60ms' }}>
            Collaborators
          </h1>

          <p className="cl-subtext reveal" style={{ transitionDelay: '140ms' }}>
            This book was possible because they chose to share. Every case in the library,
            every framework on the platform, carries the fingerprints of people who gave their
            time and knowledge for those they had never met.
          </p>

          <div className="cl-stats reveal" style={{ transitionDelay: '220ms' }}>
            <div className="cl-stat">
              <span className="cl-stat-num">{displayPeople}</span>
              <span className="cl-stat-label">contributors</span>
            </div>
            <div className="cl-stat-divider" />
            <div className="cl-stat">
              <span className="cl-stat-num">{displayFirms}</span>
              <span className="cl-stat-label">firms</span>
            </div>
          </div>
        </header>

        {/* ── Firm list ────────────────────────────────── */}
        <section className="cl-list">
          <div className="cl-container">
            {FIRMS.map((firm) => (
              <div key={firm.name} className="cl-firm" data-firm-name={firm.name}>
                <div className="cl-firm-header">
                  <span className="cl-firm-name">{firm.name}</span>
                </div>
                <div className="cl-names">
                  {firm.people.map((person) => (
                    <span key={person} className="cl-name">
                      {person}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Closing ──────────────────────────────────── */}
        <section className="cl-closing">
          <div className="cl-closing-inner reveal" style={{ transitionDelay: '0ms' }}>
            <div className="cl-closing-rule" />
            <span className="cl-closing-eyebrow">And to those not named here</span>
            <p className="cl-closing-pull">We are forever indebted.</p>
            <p className="cl-closing-body">
              Behind every name on this page stood people who asked nothing but believed in
              everything. Our families, who held us through the doubt and celebrated every
              small win. Our friends, who sat across the table at midnight and were the last
              to tell us to give up. You will not find your names listed here, but you are
              woven into every word of this book.
            </p>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────── */}
        <section className="cl-cta">
          <h2 className="cl-cta-heading reveal" style={{ transitionDelay: '0ms' }}>
            Now it's your turn.
          </h2>
          <Link
            href="/"
            className="inline-block bg-[#3D5A35] text-white px-10 py-4 text-xs uppercase tracking-[0.2em] hover:bg-[#3D5A35]/90 transition-all reveal"
            style={{ transitionDelay: '80ms' }}
          >
            Explore
          </Link>
        </section>
      </main>

      <Footer currentPage="about" />
    </div>
  )
}
