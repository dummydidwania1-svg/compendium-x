'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Footer from '@/components/dashboard/Footer'

type Person = { name: string; linkedin: string }
type Firm = { name: string; people: Person[] }

const FIRMS: Firm[] = [
  { name: 'Accenture Strategy', people: [
    { name: 'Chhavi Atal',     linkedin: 'https://www.linkedin.com/in/chhavi-atal-876749149/' },
    { name: 'Kaavya Singhal',  linkedin: 'https://www.linkedin.com/in/kaavya-singhal-598baa152/' },
    { name: 'Latika Dutta',    linkedin: 'https://www.linkedin.com/in/latika-dutta/' },
    { name: 'Saksham Kaila',   linkedin: 'https://www.linkedin.com/in/saksham-kaila-335500278/' },
  ]},
  { name: 'Bain & Company', people: [
    { name: 'Satvik Agarwal',    linkedin: 'https://www.linkedin.com/in/satvikagarwal22/' },
    { name: 'Vaibhav Garg',      linkedin: 'https://www.linkedin.com/in/vaibhav-garg-363716165/' },
  ]},
  { name: 'Bain Capability Network', people: [
    { name: 'Aarushi Gupta',      linkedin: 'https://www.linkedin.com/in/aarushi-gupta-87630b16b/' },
    { name: 'Kinshuk Soperna',    linkedin: 'https://www.linkedin.com/in/kinshuk-soperna-9a2276190/' },
    { name: 'Mahir Dhariwal',     linkedin: 'https://www.linkedin.com/in/mahir-dhariwal-45480b190/' },
    { name: 'Vedant S. Jangam',   linkedin: 'https://www.linkedin.com/in/vedant-s-jangam-a8610916a/' },
  ]},
  { name: 'Boston Consulting Group', people: [
    { name: 'Anirudh Arya',    linkedin: 'https://www.linkedin.com/in/anirudh-arya-/' },
    { name: 'Harshit Jain',    linkedin: 'https://www.linkedin.com/in/harshit-jain-srcc22/' },
    { name: 'Krtin Tandon',    linkedin: 'https://www.linkedin.com/in/krtin-tandon/' },
    { name: 'Manav Mahajan',   linkedin: 'https://www.linkedin.com/in/manav-mahajan-120653221/' },
    { name: 'Rishabh Bafna',   linkedin: 'https://www.linkedin.com/in/rishabh-bafna/' },
    { name: 'V Saikalayan',    linkedin: 'https://www.linkedin.com/in/v-saikalyan-626a6b257/' },
    { name: 'Yash Ajmera',     linkedin: 'https://www.linkedin.com/in/yash-ajmera-731416185/' },
  ]},
  { name: 'Dalberg', people: [
    { name: 'Bhavya Nayak',  linkedin: 'https://www.linkedin.com/in/bhavya-nayak/' },
    { name: 'Daksh Kalra',   linkedin: 'https://www.linkedin.com/in/dakshkalra/' },
    { name: 'Jatin Jindal',  linkedin: 'https://www.linkedin.com/in/jatin-jindal-485843196/' },
    { name: 'Shreya Roy',    linkedin: 'https://www.linkedin.com/in/shreya-roy-69720391/' },
  ]},
  { name: 'FTI Consulting', people: [
    { name: 'Ishaan Mittal', linkedin: 'https://www.linkedin.com/in/ishaan-mittal-cfa-04a730192/' },
  ]},
  { name: 'J.P. Morgan Chase & Co.', people: [
    { name: 'Neharika Garg', linkedin: 'https://www.linkedin.com/in/neharika-garg-84370613b/' },
  ]},
  { name: 'Kearney', people: [
    { name: 'Khushi Bhojnagarwala', linkedin: 'https://www.linkedin.com/in/khushibhojnagarwala/' },
    { name: 'Shreyas Jain',         linkedin: 'https://www.linkedin.com/in/shreyasjainsrcc/' },
    { name: 'Siddharth Bapna',      linkedin: 'https://www.linkedin.com/in/siddharthbapna/' },
  ]},
  { name: 'Kepler Cannon', people: [
    { name: 'Paavni Dewan',      linkedin: 'https://www.linkedin.com/in/paavni-dewan/' },
    { name: 'Shagun Fogla',      linkedin: 'https://www.linkedin.com/in/shagun-fogla-3687b8203/' },
    { name: 'Yashwardhan Saraf', linkedin: 'https://www.linkedin.com/in/yash-vardhan-saraf/' },
  ]},
  { name: 'L.E.K. Consulting', people: [
    { name: 'Jasleen Allagh', linkedin: 'https://www.linkedin.com/in/jasleen-a-20453b188/' },
  ]},
  { name: 'McKinsey & Co.', people: [
    { name: 'Aanam Ahmed',        linkedin: 'https://www.linkedin.com/in/aanam-ahmed/' },
    { name: 'Ananya Miriam Jose', linkedin: 'https://www.linkedin.com/in/ananya-miriam-jose-20a26b27b/' },
    { name: 'Ansh Aggarwal',      linkedin: 'https://www.linkedin.com/in/ansh-aggarwal-15448a1a9/' },
    { name: 'Himanshu Chhabra',   linkedin: 'https://www.linkedin.com/in/himanshuchhabra/' },
    { name: 'Jayani Shah',        linkedin: 'https://www.linkedin.com/in/jayani-s-4b2417155/' },
    { name: 'Kriteesha Janveja',  linkedin: 'https://www.linkedin.com/in/kriteesha-janveja-91571b144/' },
    { name: 'Nimisha Dhawan',     linkedin: 'https://www.linkedin.com/in/nimisha-dhawan-3740bb259/' },
    { name: 'Shreya Rohatgi',     linkedin: 'https://www.linkedin.com/in/shreya-rohatgi-72b2a8256/' },
  ]},
  { name: 'Monitor Deloitte', people: [
    { name: 'Amrit Chadha', linkedin: 'https://www.linkedin.com/in/amrit-chadha-3a368718b/' },
  ]},
  { name: 'Strategy&', people: [
    { name: 'Agrim Jain', linkedin: 'https://www.linkedin.com/in/agrim-jain-1650b3192/' },
  ]},
  { name: 'YCP Auctus', people: [
    { name: 'Khushi Goyal',        linkedin: 'https://www.linkedin.com/in/khushi-goyal-445b41193/' },
    { name: 'Parineet Choudhary',  linkedin: 'https://www.linkedin.com/in/parineet-kaur-chowdhury-0340aa192/' },
  ]},
  { name: 'Z.S. Associates', people: [
    { name: 'Aarsh Nayyar',      linkedin: 'https://www.linkedin.com/in/aarsh-nayyar-62b660193/' },
    { name: 'Chaitanya Sahwney', linkedin: 'https://www.linkedin.com/in/chaitanya-sawhney-3abb49193/' },
    { name: 'Kshitij Singh',     linkedin: 'https://www.linkedin.com/in/kshitijsingh18/' },
    { name: 'Nakul Gupta',       linkedin: 'https://www.linkedin.com/in/nakul-gupta1/' },
  ]},
]

const TOTAL_PEOPLE = FIRMS.reduce((s, f) => s + f.people.length, 0)
const TOTAL_FIRMS = FIRMS.length

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
    text-decoration: none;
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
  .cl-name:hover { color: #3D5A35; text-shadow: 0 0 28px rgba(61,90,53,.18); cursor: pointer; }
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
            This book was possible because they chose to share. Every case in the repository,
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
                    <a
                      key={person.name}
                      href={person.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cl-name"
                    >
                      {person.name}
                    </a>
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
