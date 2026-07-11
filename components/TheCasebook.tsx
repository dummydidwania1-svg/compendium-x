'use client'

import React, { useEffect, useRef, useState, useTransition } from 'react'
import Footer from '@/components/dashboard/Footer'

/* ─── Section nav ─── */

const NAV_SECTIONS = [
  { id: 'preview', label: 'Preview' },
  { id: 'guide', label: 'The Guide' },
  { id: 'tools', label: 'Tools' },
]

/* ─── Guide rules ─── */

const GUIDE_RULES = [
  {
    heading: 'Form a case group',
    text: "In order to prepare for case interviews, candidates are recommended to form their own case groups, ideally with not more than 4 people in the group. Solve the cases in pairs. One person usually takes on the role of the 'interviewer' and the other, the 'interviewee'. Only the interviewer must go through the case to understand the problem. After this, the 'interviewer' gives the case to the 'interviewee' who makes an attempt to solve the case. Other members of the case group can also be a part of the process by observing the interview. Finally, the members can discuss the case and give their individual insights. The interviewee's solution can be compared to the one in the book to analyze things which could have been approached differently.",
  },
  {
    heading: 'Do not read the cases on your own',
    text: 'One of the most important things that a candidate should keep in mind is to never read the case transcripts on their own. The case format involves an interviewer and an interviewee because that methodology is best suited to understand how an actual interview will be like. Reading cases without actually solving them with a partner will not allow a candidate to tweak frameworks and bring in their own element of creativity which is highly rewarded in a case-interview setting. It also gives away answers to most case problems which renders them invalid for further use as you already know the answer to the problem.',
  },
  {
    heading: 'Be flexible when it comes to frameworks',
    text: 'There are no strait-jacket solutions to solve a case problem. Frameworks in this book can serve as a guiding tool but are in no way exhaustive for all case types. As a result, try to work with them and incorporate them in your approach for a more structured solution but never try to squeeze a framework where it does not belong. Eventually, as you practice more, you will be able to incorporate finer details in the frameworks that are best suited to how you would like to solve a problem. This is a recommended practice that all candidates should try and adopt; it can be crucial for differentiation when you are competing against other candidates.',
  },
  {
    heading: 'Give honest feedback',
    text: 'A setting where honest, constructive feedback is appreciated is important in order to develop case-solving skills. Be open to peer feedback and consult a senior who has gone through the process in case of any clarifications required. Make sure you incorporate the feedback going forward.',
  },
  {
    heading: 'Optimal solutions in this book',
    text: "As authors and editors, we were debating whether the case in this book should be in an as-close-to-perfect form or a direct live transcript. Ultimately, we decided to go ahead with the former. The idea is that when you are practicing these cases yourself or even doing them in interviews, you will never be perfect – and that's alright. But, in your quest to get over the mark, you will need access to information on the best possible solutions, which helps you notice the gaps in your approach. So, fret not if your solutions aren't identical to those in the book, that's by design.",
  },
]

/* ─── Tools ─── */

const TOOLS = [
  {
    eyebrow: '01 · Clarifying questions',
    heading: 'Clarifying questions',
    text: 'These are a list of important preliminary questions which should be asked in the context of the case. Similar cases have similar preliminary questions. However, it is important to contextualize the questions with respect to every individual case.',
  },
  {
    eyebrow: '02 · Brownie points',
    heading: 'Brownie points',
    text: "One effective way to catch the interviewer's eye is to mention facts related to the case that not everyone would think of. This demonstrates your knowledge of the world and ability to think in the moment. Although this is not necessary, it makes you stand out, giving you an edge over other candidates.",
  },
  {
    eyebrow: '03 · Keep in mind',
    heading: 'Keep in mind',
    text: "These are tips that you can incorporate in the way you approach cases. As and when you solve more cases, you will realize there are certain unsaid rules in the solving process. The 'keep in mind' boxes are a good way to improve the way you communicate your solution to the interviewer.",
  },
]

/* ─── Page CSS ─── */

const PAGE_CSS = `
  .cb-root {
    font-family: 'Work Sans', sans-serif;
    background: #fff8f0;
    color: #453a2a;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }
  .cb-root *::selection { background: rgba(92,64,51,.15); color: #3b2f2f; }

  .cb-wrap { max-width: 1320px; margin: 0 auto; padding: 0 60px; }
  @media (max-width: 768px) { .cb-wrap { padding: 0 28px; } }
  @media (max-width: 480px) { .cb-wrap { padding: 0 20px; } }

  /* Reveal */
  .cb-reveal {
    opacity: 0;
    transform: translateY(36px) scale(.985);
    filter: blur(8px);
    transition: opacity 1.15s cubic-bezier(.16,1,.3,1),
                transform 1.15s cubic-bezier(.16,1,.3,1),
                filter .9s ease;
    will-change: opacity, transform, filter;
  }
  .cb-reveal.visible { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
  @media (prefers-reduced-motion: reduce) {
    .cb-reveal { transition: none; opacity: 1; transform: none; filter: none; }
  }

  /* Hero */
  .cb-hero { max-width: 1320px; margin: 0 auto; padding: 94px 60px 24px; text-align: center; }
  @media (max-width: 768px) { .cb-hero { padding: 88px 28px 20px; } }

  .cb-eyebrow {
    display: block; font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: .3em;
    color: rgba(92,64,51,.48); margin-bottom: 14px;
  }
  .cb-headline {
    font-family: 'Newsreader', serif;
    font-size: clamp(40px, 6vw, 72px); font-weight: 300;
    line-height: 1.0; letter-spacing: -.025em; color: #453a2a;
  }

  /* Sections */
  .cb-section { position: relative; padding: 132px 0; scroll-margin-top: 90px; }
  .cb-section:first-of-type { padding-top: 28px; }
  .cb-section::before {
    content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%);
    width: min(640px, 80%); height: 1px;
    background: linear-gradient(to right, transparent 0%, rgba(92,64,51,.18) 25%, rgba(92,64,51,.28) 50%, rgba(92,64,51,.18) 75%, transparent 100%);
  }
  .cb-section::after {
    content: ''; position: absolute; top: -3px; left: 50%; transform: translateX(-50%) rotate(45deg);
    width: 5px; height: 5px; background: #5C4033; opacity: .55;
  }
  .cb-section:first-of-type::before,
  .cb-section:first-of-type::after { display: none; }

  .cb-section-ey {
    display: block; font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .3em; color: rgba(92,64,51,.45); margin-bottom: 10px; margin-top: 8px;
  }
  .cb-section-title {
    font-family: 'Newsreader', serif; font-size: clamp(22px, 3vw, 30px);
    font-weight: 300; color: #453a2a; letter-spacing: -.01em; line-height: 1.25; margin-bottom: 22px;
  }

  .cb-body { font-size: 15px; line-height: 1.9; color: #5a4f43; max-width: 760px; }

  /* Preview / Archival letter */
  .cb-letter { max-width: 720px; margin: 0 auto; text-align: left; }

  /* Archival plate (section header) */
  .cb-plate { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 48px; }
  .cb-plate-lbl {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .3em; color: rgba(92,64,51,.55); white-space: nowrap; padding-left: .3em;
  }
  .cb-plate-line { flex: 0 0 clamp(56px, 10vw, 110px); height: 1px; }
  .cb-plate-line.left  { background: linear-gradient(to left,  rgba(92,64,51,.28), transparent); }
  .cb-plate-line.right { background: linear-gradient(to right, rgba(92,64,51,.28), transparent); }
  .cb-plate-diamond { width: 4px; height: 4px; background: #5C4033; opacity: .5; transform: rotate(45deg); flex-shrink: 0; }

  /* Letter frame — corner brackets */
  .cb-letterframe { position: relative; padding: 46px 44px 56px; }
  @media (max-width: 560px) { .cb-letterframe { padding: 38px 24px 46px; } }
  .cb-corner { position: absolute; width: 28px; height: 28px; border: 0 solid rgba(92,64,51,.18); pointer-events: none; }
  .cb-corner.tl { top: 0; left: 0; border-top-width: 1px; border-left-width: 1px; }
  .cb-corner.tr { top: 0; right: 0; border-top-width: 1px; border-right-width: 1px; }
  .cb-corner.bl { bottom: 0; left: 0; border-bottom-width: 1px; border-left-width: 1px; }
  .cb-corner.br { bottom: 0; right: 0; border-bottom-width: 1px; border-right-width: 1px; }

  /* Scholar Green breathing aura — the only green on this page */
  .cb-aura {
    position: absolute; left: 50%; bottom: -70px; transform: translateX(-50%);
    width: 120%; height: 240px; pointer-events: none; z-index: 0;
    background: radial-gradient(ellipse at center, rgba(61,90,53,.09) 0%, transparent 65%);
    animation: cbAura 7s ease-in-out infinite;
  }
  @keyframes cbAura {
    0%, 100% { opacity: .55; transform: translateX(-50%) scale(1); }
    50%      { opacity: 1;   transform: translateX(-50%) scale(1.06); }
  }
  @media (prefers-reduced-motion: reduce) { .cb-aura { animation: none; } }

  .cb-para {
    position: relative; z-index: 1;
    font-family: 'Newsreader', serif; font-weight: 400;
    font-size: 17px; line-height: 1.9; color: #4a3f30; margin-bottom: 32px;
  }
  .cb-para:last-of-type { margin-bottom: 0; }
  .cb-letter-em {
    font-style: italic; font-weight: 500;
    font-size: 1.02em; color: #3b2f2f;
  }
  .cb-letter-fleuron {
    position: relative; z-index: 1;
    width: 5px; height: 5px; background: #5C4033; opacity: .55;
    transform: rotate(45deg); margin: 52px auto 0;
  }

  /* Guide rules */
  .cb-rules { max-width: 860px; }
  .cb-rule {
    display: flex; gap: 20px; align-items: flex-start; padding: 34px 0;
    border-bottom: 1px solid rgba(92,64,51,.07);
    opacity: 0; transform: translateX(-10px);
    transition: opacity .6s cubic-bezier(.22,1,.36,1), transform .6s cubic-bezier(.22,1,.36,1), background .3s ease;
  }
  .cb-rule:first-child { border-top: 1px solid rgba(92,64,51,.07); }
  .cb-rule.visible { opacity: 1; transform: translateX(0); }
  .cb-rule:hover { background: rgba(92,64,51,.02); }
  @media (prefers-reduced-motion: reduce) { .cb-rule { transition: none; opacity: 1; transform: none; } }
  .cb-rule-n {
    font-family: 'Newsreader', serif; font-size: 15px; font-weight: 300;
    color: rgba(92,64,51,.38); min-width: 34px; flex-shrink: 0; padding-top: 4px;
  }
  .cb-rule-h {
    font-family: 'Newsreader', serif; font-size: clamp(19px, 2.4vw, 24px); font-weight: 300;
    color: #453a2a; letter-spacing: -.01em; line-height: 1.3; margin: 0 0 12px;
  }
  .cb-rule-t { font-size: 15px; line-height: 1.85; color: #5a4f43; max-width: 760px; }

  /* Tools / lens grid */
  .cb-lenses {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0;
    align-items: stretch;
    margin-top: 4px;
    border-top: 1px solid rgba(92,64,51,.16);
  }
  @media (max-width: 760px) {
    .cb-lenses { grid-template-columns: 1fr; border-top: none; }
  }

  .cb-lens {
    display: flex; flex-direction: column;
    padding: 26px 28px 8px;
    background: transparent;
    border-left: 1px solid rgba(92,64,51,.10);
    transition: background .3s ease;
  }
  .cb-lens:first-child { border-left: none; padding-left: 0; }
  .cb-lens:hover { background: rgba(92,64,51,.02); }
  @media (max-width: 760px) {
    .cb-lens {
      border-left: none;
      border-top: 1px solid rgba(92,64,51,.12);
      padding: 24px 0 4px;
    }
    .cb-lens:first-child { border-top: none; padding-top: 8px; }
  }

  .cb-lens-ey {
    font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .24em;
    color: rgba(92,64,51,.5); margin-bottom: 12px;
  }
  .cb-lens-h {
    font-family: 'Newsreader', serif; font-size: 19px; font-weight: 300;
    color: #453a2a; line-height: 1.25; letter-spacing: -.01em;
    margin: 0 0 18px;
  }
  .cb-lens-t { font-size: 14px; line-height: 1.6; color: #5a4f43; }

  /* Section nav */
  .cb-snav { position: fixed; right: 28px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 16px; z-index: 50; }
  @media (max-width: 1300px) { .cb-snav { display: none; } }
  .cb-snav-btn { display: flex; align-items: center; gap: 9px; background: none; border: none; cursor: pointer; padding: 6px 0; justify-content: flex-end; }
  .cb-snav-lbl { font-family: 'Work Sans', sans-serif; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .2em; color: #5C4033; opacity: 0; transition: opacity .18s ease; pointer-events: none; white-space: nowrap; }
  .cb-snav-btn:hover .cb-snav-lbl { opacity: 1; }
  .cb-snav-bar { width: 18px; height: 2px; border-radius: 1px; background: rgba(92,64,51,.22); transition: width .28s cubic-bezier(.22,1,.36,1), background .28s ease; flex-shrink: 0; }
  .cb-snav-btn:hover .cb-snav-bar { background: rgba(92,64,51,.5); width: 26px; }
  .cb-snav-btn.active .cb-snav-bar { width: 30px; background: #5C4033; }
`

/* ─── Main component ─── */

export default function TheCasebook() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [activeSection, setActiveSection] = useState('preview')
  const [, startTransition] = useTransition()

  useEffect(() => {
    const root = rootRef.current; if (!root) return
    const io = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (!e.isIntersecting) return
        const el = e.target as HTMLElement
        setTimeout(() => el.classList.add('visible'), parseInt(el.dataset.delay ?? '0', 10))
        io.unobserve(el)
      }),
      { threshold: 0.05, rootMargin: '0px 0px -18% 0px' },
    )
    root.querySelectorAll('.cb-reveal, .cb-rule').forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const ACTIVATION_OFFSET = 0.30
    let raf = 0
    const compute = () => {
      raf = 0
      const line = window.innerHeight * ACTIVATION_OFFSET
      let bestId = NAV_SECTIONS[0].id
      let bestDist = Infinity
      for (const s of NAV_SECTIONS) {
        const el = document.getElementById(s.id)
        if (!el) continue
        const top = el.getBoundingClientRect().top
        const dist = line - top
        if (dist >= 0 && dist < bestDist) { bestDist = dist; bestId = s.id }
      }
      startTransition(() => setActiveSection(prev => prev === bestId ? prev : bestId))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(compute) }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    compute()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div ref={rootRef} className="cb-root">
      <style>{PAGE_CSS}</style>

      <nav className="cb-snav" aria-label="Page sections">
        {NAV_SECTIONS.map(s => (
          <button
            key={s.id}
            className={`cb-snav-btn${activeSection === s.id ? ' active' : ''}`}
            onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            aria-label={`Go to ${s.label}`}
          >
            <span className="cb-snav-lbl">{s.label}</span>
            <span className="cb-snav-bar" />
          </button>
        ))}
      </nav>

      <header className="cb-hero">
        <span className="cb-eyebrow cb-reveal" data-delay="0">From the original edition</span>
        <h1 className="cb-headline cb-reveal" data-delay="55">The Casebook</h1>
      </header>

      <main>
        {/* Section 1: Preview — The Archival Letter */}
        <section id="preview" className="cb-section">
          <div className="cb-wrap">
            <div className="cb-letter">
              <div className="cb-plate cb-reveal" data-delay="0">
                <span className="cb-plate-line left" />
                <span className="cb-plate-diamond" />
                <span className="cb-plate-lbl">Preview</span>
                <span className="cb-plate-diamond" />
                <span className="cb-plate-line right" />
              </div>

              <div className="cb-letterframe">
                <span className="cb-corner tl" />
                <span className="cb-corner tr" />
                <span className="cb-corner bl" />
                <span className="cb-corner br" />
                <div className="cb-aura" />

                <p className="cb-para cb-reveal" data-delay="0">
                  As third-year students, passing out of Shri Ram College of Commerce, after a rigorous placement season, our team wanted to pass on the knowledge that we gathered throughout this year, to aspirants stepping into our shoes in the coming years.
                </p>

                <p className="cb-para cb-reveal" data-delay="90">
                  After extensively preparing for consulting companies in the last two years and cracking interviews of multiple corporate giants including the likes of Kearney, Accenture Strategy, ZS Associates & Zomato, we decided to go ahead with the preparation for consulting companies as our main subject.
                </p>

                <p className="cb-para cb-reveal" data-delay="180">
                  This book happens to be <span className="cb-letter-em">University of Delhi's first Consulting Case Book</span>, having details pertaining to the case interviews of the big shots in the space. We have gathered resources from our experience and from our fellow candidates placed at McKinsey & Co., Kearney, BCG, Dalberg, L. E. K. Consulting, Kepler Cannon, Accenture Strategy, Zomato, Bain & Company, etc. This book contains end-to-end transcripts from the case interviews mentioned above, frameworks related to different case types, and all other details for a candidate to secure a job in the consulting space.
                </p>

                <p className="cb-para cb-reveal" data-delay="270">
                  We put our heart and soul into our journeys of preparing for these interviews because of how much we aspired to achieve our goals. Naturally, we also faced roadblocks at every step. We felt the need to come up with this case book because one of the major roadblocks was that there were next to <span className="cb-letter-em">no case books</span> at the <span className="cb-letter-em">undergraduate level</span>, as most of the case books are by post-graduate students for their college placements only. We had to look for interviews online and contact seniors to know about their interviews. We decided that we wouldn't want our juniors to spend time and energy in collating these resources before they started their actual preparation.
                </p>

                <p className="cb-para cb-reveal" data-delay="360">
                  With our aim to reach out to every student, regardless of their background, we will make our book available free of cost so that it is just a click away for anyone who needs it.
                </p>

                <p className="cb-para cb-reveal" data-delay="450">
                  Lastly, we would also like to recommend other resources that we used for our preparation - we found Case Interviews Cracked and IIM-A's case books to be useful references.
                </p>

                <div className="cb-letter-fleuron cb-reveal" data-delay="500" />
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: The Guide */}
        <section id="guide" className="cb-section">
          <div className="cb-wrap">
            <span className="cb-section-ey cb-reveal" data-delay="0">The Guide</span>
            <h2 className="cb-section-title cb-reveal" data-delay="55">Guide to use this casebook</h2>

            <div className="cb-rules">
              {GUIDE_RULES.map((rule, i) => (
                <div key={rule.heading} className="cb-rule" data-delay={String(i * 75)}>
                  <span className="cb-rule-n">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <h3 className="cb-rule-h">{rule.heading}</h3>
                    <p className="cb-rule-t">{rule.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 3: Tools */}
        <section id="tools" className="cb-section">
          <div className="cb-wrap">
            <span className="cb-section-ey cb-reveal" data-delay="0">Tools</span>

            <p className="cb-body cb-reveal" data-delay="55" style={{ marginBottom: 28 }}>
              Every case in this book is accompanied with:
            </p>

            <div className="cb-lenses">
              {TOOLS.map((tool, i) => (
                <div key={tool.heading} className="cb-lens cb-reveal" data-delay={String(i * 90)}>
                  <span className="cb-lens-ey">{tool.eyebrow}</span>
                  <h3 className="cb-lens-h">{tool.heading}</h3>
                  <p className="cb-lens-t">{tool.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <div style={{ borderTop: '1px solid rgba(92,64,51,.1)' }}>
        <Footer />
      </div>
    </div>
  )
}
