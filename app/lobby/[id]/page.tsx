'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { getDoc, onSnapshot } from 'firebase/firestore'
import { signInAnonymouslyIfNeeded, waitForAuthUser } from '@/lib/firebase/config'
import { sessionDoc } from '@/lib/firebase/collections'
import { apiPost } from '@/lib/api/client'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'

type SessionState = {
  caseId?: string
  status?: 'waiting' | 'in_progress' | 'completed'
  sessionMode?: 'remote' | 'local'
}

type PopupWindowHost = Window & {
  __compendiumInterviewerWindow?: Window | null
}

function CompactPlatformFooter() {
  return (
    <footer style={{ background: '#453a2a' }} className="mt-auto w-full px-6 py-6 md:px-10 md:py-7">
      <div className="mx-auto max-w-screen-2xl">
        <div className="mb-5 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center md:gap-10">
          <div>
            <Link href="/" style={{ fontFamily: "'Newsreader', serif" }} className="mb-2 inline-block text-2xl font-semibold tracking-tight transition-opacity hover:opacity-85">
              <span style={{ color: '#d5c4b1' }}>Case Compendium</span>
              <span style={{ color: '#aed0a1' }}>X</span>
            </Link>
            <p
              style={{
                fontFamily: "'Work Sans', sans-serif",
                color: 'rgba(213,196,177,0.5)',
                maxWidth: '280px',
                lineHeight: 1.6,
              }}
              className="text-xs"
            >
              AI-powered case practice and performance analytics for consulting interviews.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-10 gap-y-3 md:gap-x-12">
            <Link
              href="/"
              style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }}
              className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all"
            >
              Home
            </Link>
            <Link
              href="/about"
              style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }}
              className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all"
            >
              About Us
            </Link>
            <Link
              href="/privacy-policy"
              style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }}
              className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all"
            >
              Privacy Policy
            </Link>
            <a
              href="mailto:contact@casecompendiumx.in?subject=Compendium%20X%20Privacy%20Request"
              style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }}
              className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all"
            >
              Contact Us
            </a>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(213,196,177,0.12)', paddingTop: '12px' }} className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
          <div className="flex items-center gap-5">
            <a href="https://www.linkedin.com/company/casecompendiumx" target="_blank" rel="noreferrer" style={{ color: 'rgba(213,196,177,0.7)' }} className="hover:text-white transition-all" title="LinkedIn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
              </svg>
            </a>
            <a href="mailto:contact@casecompendiumx.in" style={{ color: 'rgba(213,196,177,0.7)' }} className="hover:text-white transition-all" title="Email Us">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
              </svg>
            </a>
          </div>
          <p style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.35)', lineHeight: 1.8 }} className="text-[10px] tracking-[0.2em] uppercase">
            &copy; 2026 Case CompendiumX. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

function SelectionShellHeader() {
  return (
    <header
      className="fixed top-0 w-full z-[100]"
      style={{
        height: '70px',
        background: 'rgba(255,248,240,0.9)',
        backdropFilter: 'blur(28px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
        borderBottom: '1px solid rgba(92,64,51,0.06)',
      }}
    >
      <div className="mx-auto flex h-full max-w-screen-2xl items-center justify-between px-4 md:px-12">
        <Link href="/" className="flex items-center gap-1 text-left transition-opacity hover:opacity-85">
          <Image
            src="/logo.png"
            alt="Case Compendium X"
            width={56}
            height={56}
            className="h-14 w-14 object-contain"
          />
          <div style={{ fontFamily: "'Newsreader', serif" }} className="text-xl font-semibold tracking-tight">
            <span className="text-[#453a2a]">Case Compendium</span>
            <span className="text-[#3D5A35]">X</span>
          </div>
        </Link>
      </div>
    </header>
  )
}

function CandidateLobby({
  requestedSessionMode,
  interviewerLink,
  sessionIssue,
  candidateActionStatus,
  waitingNudgeVisible,
  onCancelSession,
  onPrimaryAction,
}: {
  requestedSessionMode: 'remote' | 'local'
  interviewerLink: string
  sessionIssue: string
  candidateActionStatus: string
  waitingNudgeVisible: boolean
  onCancelSession: () => void
  onPrimaryAction: () => void
}) {
  const isLocalSession = requestedSessionMode === 'local'
  const interviewerLinkDisplay = isLocalSession ? '' : interviewerLink.replace(/^https?:\/\//, '')
  const interviewerLinkPreview = isLocalSession
    ? ''
    : interviewerLinkDisplay.length > 46
      ? `${interviewerLinkDisplay.slice(0, 22)}...${interviewerLinkDisplay.slice(-16)}`
      : interviewerLinkDisplay
  const remoteCopySucceeded = candidateActionStatus === 'Link copied'
  const remoteCopyFailed = candidateActionStatus === 'Unable to copy'
  const localWindowReady = candidateActionStatus === 'Interviewer window ready'
  const localPopupBlocked = candidateActionStatus === 'Allow popups to continue'
  const remoteActionButtonLabel =
    remoteCopySucceeded
      ? 'Copied'
      : remoteCopyFailed
        ? 'Retry'
        : 'Copy link'
  const localActionButtonLabel =
    localWindowReady
      ? 'Ready'
      : localPopupBlocked
        ? 'Allow popups'
        : 'Show controls'
  const waitingSteps = isLocalSession
    ? [
        { num: '01', text: 'Controls ready', active: true },
        { num: '02', text: 'Interviewer picks case' },
        { num: '03', text: 'Allow recording' },
        { num: '04', text: 'Review dashboard' },
      ]
    : [
        { num: '01', text: 'Send invite', active: true },
        { num: '02', text: 'Interviewer picks case' },
        { num: '03', text: 'Allow recording' },
        { num: '04', text: 'Review dashboard' },
      ]
  const statusTitle = isLocalSession ? 'Interviewer controls are ready' : 'Invite ready to share'
  const statusHelper = isLocalSession
    ? 'If the interviewer window slips behind, bring it back from here.'
    : 'Copy the invite below to open the interviewer setup.'
  const pageSubtitle = "Stay here. Your workspace opens automatically once the interviewer starts the case."
  const localActionDescription = localPopupBlocked
    ? 'Allow popups, then try again.'
    : 'Need it again? Bring the interviewer window back.'

  return (
    <div
      style={{ fontFamily: "'Work Sans', sans-serif" }}
      className="relative min-h-screen flex flex-col bg-[#fff8f0] text-[#1e1b15] antialiased selection:bg-[#3D5A35]/20 selection:text-[#3B2F2F]"
    >
      <style>{`
        @keyframes candidate-fade-up {
          from { opacity: 0; transform: translateY(16px); filter: blur(2px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes candidate-card-in {
          from { opacity: 0; transform: translateY(20px) scale(0.985); filter: blur(3px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes candidate-bg-shift {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.72; }
          50% { transform: translate3d(18px, -12px, 0) scale(1.04); opacity: 0.9; }
        }
        @keyframes candidate-glow {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.65; }
          33% { transform: translate(24px, -18px) scale(1.08); opacity: 0.8; }
          66% { transform: translate(-18px, 12px) scale(0.96); opacity: 0.58; }
        }
        @keyframes candidate-step-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes candidate-step-pulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(61,90,53,0.08), 0 0 0 0 rgba(61,90,53,0.04);
          }
          50% {
            box-shadow: 0 0 0 7px rgba(61,90,53,0.06), 0 10px 18px rgba(61,90,53,0.08);
          }
        }
        @keyframes candidate-pulse-ring {
          0% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.4); opacity: 0; }
          100% { transform: scale(1); opacity: 0.6; }
        }
        @keyframes candidate-invite-glow {
          0%, 100% {
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.62), 0 6px 14px rgba(59,47,47,0.035), 0 0 0 rgba(61,90,53,0);
            border-color: rgba(92,64,51,0.08);
          }
          50% {
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.68), 0 14px 28px rgba(61,90,53,0.05), 0 0 0 1px rgba(61,90,53,0.04);
            border-color: rgba(92,64,51,0.08);
          }
        }
        @keyframes candidate-invite-aura {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.38; }
          50% { transform: translate(14px, -8px) scale(1.06); opacity: 0.52; }
        }
        .candidate-glass {
          position: relative;
          background: rgba(255,248,240,0.6);
          backdrop-filter: blur(28px) saturate(1.5);
          -webkit-backdrop-filter: blur(28px) saturate(1.5);
          border: 1px solid rgba(92,64,51,0.08);
          box-shadow: 0 4px 14px rgba(59,47,47,0.035);
          transition: transform 0.4s cubic-bezier(0.22,1,0.36,1), box-shadow 0.4s cubic-bezier(0.22,1,0.36,1), border-color 0.4s ease;
        }
        .candidate-glass:hover {
          transform: translateY(-3px);
          box-shadow: 0 16px 48px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.03);
          border-color: rgba(61,90,53,0.15);
        }
        .candidate-glass::after {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, #3D5A35, #695c4d);
          opacity: 0;
          transition: opacity 0.4s ease;
        }
        .candidate-glass:hover::after {
          opacity: 1;
        }
        .candidate-btn {
          background: rgba(255,248,240,0.84);
          border: 1px solid rgba(61,90,53,0.16);
          color: #3D5A35;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.72), 0 1px 2px rgba(61,90,53,0.04);
          transition: all 0.25s cubic-bezier(0.22,1,0.36,1);
        }
        .candidate-btn:hover {
          background: rgba(61,90,53,0.08);
          border-color: rgba(61,90,53,0.28);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.76), 0 6px 14px rgba(61,90,53,0.06);
          transform: translateY(-1px);
        }
        .candidate-panel {
          border: 1px solid rgba(61,90,53,0.08);
          background:
            linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(244,237,227,0.74) 100%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.72);
        }
        .candidate-link-shell {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          border: 1px solid rgba(92,64,51,0.08);
          background: rgba(255,248,240,0.6);
          backdrop-filter: blur(28px) saturate(1.5);
          -webkit-backdrop-filter: blur(28px) saturate(1.5);
          box-shadow: 0 4px 14px rgba(59,47,47,0.035);
          transition: border-color 0.25s ease, transform 0.25s cubic-bezier(0.22,1,0.36,1), box-shadow 0.25s ease;
          animation: candidate-invite-glow 5.2s ease-in-out infinite;
        }
        .candidate-link-shell::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 18% 50%, rgba(61,90,53,0.06) 0%, rgba(61,90,53,0.025) 24%, transparent 62%);
          animation: candidate-invite-aura 8s ease-in-out infinite;
          pointer-events: none;
          z-index: 0;
        }
        .candidate-link-shell:hover {
          border-color: rgba(61,90,53,0.16);
          transform: translateY(-1px);
          box-shadow: 0 16px 30px rgba(61,90,53,0.05), 0 0 0 1px rgba(61,90,53,0.05);
        }
        .candidate-inline-btn {
          background: #3D5A35;
          border: 1px solid #3D5A35;
          color: white;
          box-shadow: 0 10px 22px rgba(61,90,53,0.14);
          transition: all 0.25s cubic-bezier(0.22,1,0.36,1);
        }
        .candidate-inline-btn:hover {
          background: rgba(255,248,240,0.92);
          color: #3D5A35;
        }
        .candidate-link-icon {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(61,90,53,0.08);
          background: rgba(255,248,240,0.5);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 12px rgba(61,90,53,0.04);
          flex-shrink: 0;
        }
        .candidate-chip-btn {
          position: relative;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 15px;
          border-radius: 999px;
          border: 1px solid rgba(61,90,53,0.16);
          background: rgba(255,248,240,0.82);
          color: #3D5A35;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.72), 0 1px 2px rgba(61,90,53,0.04);
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          flex-shrink: 0;
          transition: all 0.25s cubic-bezier(0.22,1,0.36,1);
        }
        .candidate-chip-btn.success {
          background: rgba(61,90,53,0.11);
          border-color: rgba(61,90,53,0.24);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.78), 0 8px 18px rgba(61,90,53,0.08);
        }
        .candidate-chip-btn.error {
          border-color: rgba(146,64,14,0.14);
          color: rgba(146,64,14,0.9);
        }
        .candidate-chip-icon {
          animation: candidate-check-in 0.28s cubic-bezier(0.22,1,0.36,1);
        }
        @keyframes candidate-check-in {
          from { opacity: 0; transform: scale(0.7) translateY(1px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .candidate-link-shell:hover .candidate-chip-btn {
          background: rgba(61,90,53,0.08);
          border-color: rgba(61,90,53,0.24);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.76), 0 6px 14px rgba(61,90,53,0.06);
          transform: translateY(-1px);
        }
        .candidate-step-active {
          animation: candidate-step-pulse 2.8s ease-in-out infinite;
        }
      `}</style>

      <SelectionShellHeader />

      <main className="relative flex min-h-[calc(100vh-70px)] flex-1 flex-col justify-center overflow-hidden px-4 pb-20 pt-[90px] md:px-8 md:pb-24">
        <div className="mx-auto max-w-3xl w-full">
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div
              className="absolute inset-x-0 top-0 h-[320px]"
              style={{ background: 'linear-gradient(180deg, rgba(244,237,227,0.72) 0%, rgba(255,248,240,0) 100%)' }}
            />
            <div
              className="absolute -top-2 left-[8%] h-[420px] w-[420px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(61,90,53,0.095) 0%, rgba(61,90,53,0.055) 22%, transparent 68%)', animation: 'candidate-bg-shift 15s ease-in-out infinite' }}
            />
            <div
              className="absolute top-[18%] right-[6%] h-[340px] w-[340px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(92,64,51,0.065) 0%, rgba(92,64,51,0.035) 24%, transparent 70%)', animation: 'candidate-glow 17s ease-in-out infinite reverse' }}
            />
            <div
              className="absolute bottom-[12%] left-[22%] h-[260px] w-[260px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(196,168,130,0.075) 0%, transparent 66%)', animation: 'candidate-glow 18s ease-in-out infinite' }}
            />
          </div>

          <div
            className="mb-7 max-w-[760px]"
            style={{ animation: 'candidate-fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both' }}
          >
            <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 pl-[2px]">
              <span className="text-[7px] tracking-[0.1em] font-semibold px-1.5 py-[1px] rounded-sm border border-[#3D5A35]/20 text-[#3D5A35]/60 bg-[#3D5A35]/5 leading-tight uppercase">
                Candidate Mode
              </span>
              <span className="text-[7px] tracking-[0.1em] font-semibold px-1.5 py-[1px] rounded-sm border border-[#C4A882]/30 text-[#C4A882] bg-[#C4A882]/8 leading-tight uppercase">
                {requestedSessionMode === 'local' ? 'Same Device' : 'Remote Partner'}
              </span>
            </div>
            <h1
              className="text-4xl font-light leading-[0.94] tracking-tight text-[#453a2a] md:text-5xl"
              style={{ fontFamily: "'Newsreader', serif" }}
            >
              Waiting for <span className="text-[#3D5A35]">Interviewer</span>
            </h1>
            <p className="mt-4 max-w-[620px] pl-[2px] text-[13px] leading-relaxed text-[#5c4033]/62">
              {pageSubtitle}
            </p>
          </div>

          <div
            className="candidate-glass overflow-hidden rounded-xl"
            style={{ animation: 'candidate-card-in 0.6s cubic-bezier(0.22,1,0.36,1) 0.15s both' }}
          >
            <div className="relative flex items-center gap-3 overflow-hidden px-6 py-5">
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: 'radial-gradient(ellipse at 50% 80%, rgba(61,90,53,0.05) 0%, transparent 70%)' }}
              />
              <div
                className="pointer-events-none absolute bottom-0 left-6 right-6 h-[1px]"
                style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(61,90,53,0.1) 20%, rgba(196,168,130,0.08) 80%, transparent 100%)' }}
              />
              <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[#3D5A35]/8">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3D5A35" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div className="relative">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inset-0 rounded-full bg-[#3D5A35]" style={{ animation: 'candidate-pulse-ring 2s ease-in-out infinite' }} />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#3D5A35]" />
                  </span>
                  <span className="text-[12px] font-medium text-[#3B2F2F]">{statusTitle}</span>
                </div>
                <span className="mt-1 block text-[10px] text-[#5C4033]/35">
                  {statusHelper}
                </span>
              </div>
            </div>

            <div className="px-6 py-6">
              <div className={`grid gap-5 ${waitingSteps.length === 4 ? 'md:grid-cols-4' : 'md:grid-cols-5'}`}>
                {waitingSteps.map((step, index) => (
                  <div
                    key={step.num}
                    className="flex flex-col items-center gap-2.5 text-center"
                    style={{ animation: `candidate-step-in 0.4s cubic-bezier(0.22,1,0.36,1) ${0.24 + index * 0.08}s both` }}
                  >
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[9px] font-semibold tracking-wider ${
                      step.active ? 'bg-[#3D5A35] text-white' : 'bg-[#D9D0C4]/25 text-[#5C4033]/40'
                    } ${step.active ? 'candidate-step-active' : ''}`}>
                      {step.num}
                    </span>
                    <span className={`text-[12px] leading-snug ${
                      step.active ? 'font-medium text-[#3B2F2F]' : 'text-[#5C4033]/50'
                    }`}>
                      {step.text}
                    </span>
                  </div>
                ))}
              </div>

              {isLocalSession ? (
                <div className="mt-6 mx-auto w-full max-w-[540px]">
                  <button
                    type="button"
                    onClick={onPrimaryAction}
                    className="candidate-link-shell flex w-full items-center gap-3 rounded-[28px] px-3.5 py-3 text-left"
                  >
                    <span className="candidate-link-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3D5A35" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                        <rect x="4" y="3" width="16" height="12" rx="2" />
                        <path d="M8 21h8" />
                        <path d="M12 15v6" />
                      </svg>
                    </span>
                    <span className="relative z-[1] min-w-0 flex-1 pr-1">
                      <span className="block truncate text-[12px] text-[#453a2a]/72">
                        {localActionDescription}
                      </span>
                    </span>
                    <span className={`candidate-chip-btn ${localWindowReady ? 'success' : ''} ${localPopupBlocked ? 'error' : ''}`}>
                      {localWindowReady ? (
                        <svg
                          className="candidate-chip-icon"
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : null}
                      {localActionButtonLabel}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="mt-6 mx-auto w-full max-w-[540px]">
                  <button
                    type="button"
                    onClick={onPrimaryAction}
                    className="candidate-link-shell flex w-full items-center gap-3 rounded-[28px] px-3.5 py-3 text-left"
                  >
                    <span className="candidate-link-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3D5A35" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                        <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4" />
                        <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 1 0 7.07 7.07L13 20" />
                      </svg>
                    </span>
                    <span className="relative z-[1] min-w-0 flex-1 pr-1">
                      <span
                        title={interviewerLink}
                        className="block truncate text-[12px] text-[#453a2a]/72"
                        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                      >
                        {interviewerLinkPreview}
                      </span>
                    </span>
                    <span className={`candidate-chip-btn ${remoteCopySucceeded ? 'success' : ''} ${remoteCopyFailed ? 'error' : ''}`}>
                      {remoteCopySucceeded ? (
                        <svg
                          className="candidate-chip-icon"
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : null}
                      {remoteActionButtonLabel}
                    </span>
                  </button>
                </div>
              )}

              {waitingNudgeVisible ? (
                <div className="mt-5 rounded-[22px] border border-[#b48a57]/22 bg-[rgba(255,245,233,0.92)] px-4 py-4 text-left">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#5c4033]">
                    Still waiting
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[#5c4033]">
                    {isLocalSession
                      ? "Your interviewer window hasn't picked a case yet. If it's stuck, you can cancel and start again."
                      : "Your interviewer hasn't joined yet. Make sure you've shared the invite link — or cancel and come back later."}
                  </p>
                  <button
                    type="button"
                    onClick={onCancelSession}
                    className="mt-3 inline-flex items-center justify-center rounded-full border border-[#5c4033]/25 bg-white/60 px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] text-[#5c4033] transition hover:border-[#5c4033]/50 hover:bg-white/90"
                  >
                    Cancel session
                  </button>
                </div>
              ) : null}

              {sessionIssue ? (
                <div className="mt-5 rounded-[22px] border border-[#b48a57]/18 bg-[rgba(255,245,233,0.85)] px-4 py-4 text-left">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#92400e]">
                    Connection Notice
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[#92400e]">{sessionIssue}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </main>

      <CompactPlatformFooter />
    </div>
  )
}

function InterviewerLobby({
  lobbyId,
  requestedSessionMode,
  router,
}: {
  lobbyId: string
  requestedSessionMode: string
  router: AppRouterInstance
}) {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    startRef.current = Date.now()
    const interval = setInterval(() => {
      if (startRef.current === null) return
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div
      style={{ fontFamily: "'Work Sans', sans-serif" }}
      className="relative min-h-screen flex flex-col bg-[#fff8f0] text-[#1e1b15] antialiased selection:bg-[#3D5A35]/20 selection:text-[#3B2F2F]"
    >
      <style>{`
        @keyframes _hi{from{opacity:0;transform:translateY(10px)}to{opacity:0.5;transform:translateY(0)}}
        @keyframes _name{from{opacity:0;transform:translateY(16px);filter:blur(8px)}to{opacity:1;transform:translateY(0);filter:blur(0px)}}
        @keyframes lobby-fade-up {
          from { opacity: 0; transform: translateY(16px); filter: blur(2px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes lobby-card-in {
          from { opacity: 0; transform: translateY(20px) scale(0.985); filter: blur(3px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes lobby-glow {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.7; }
          33% { transform: translate(30px, -20px) scale(1.1); opacity: 0.85; }
          66% { transform: translate(-20px, 15px) scale(0.95); opacity: 0.65; }
        }
        @keyframes lobby-step-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes lobby-step-pulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(61,90,53,0.08), 0 0 0 0 rgba(61,90,53,0.04);
          }
          50% {
            box-shadow: 0 0 0 7px rgba(61,90,53,0.06), 0 10px 18px rgba(61,90,53,0.08);
          }
        }
        @keyframes lobby-btn-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes lobby-pulse-ring {
          0% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.4); opacity: 0; }
          100% { transform: scale(1); opacity: 0.6; }
        }
        .lobby-glass {
          position: relative;
          background: rgba(255,248,240,0.6);
          backdrop-filter: blur(28px) saturate(1.5);
          -webkit-backdrop-filter: blur(28px) saturate(1.5);
          border: 1px solid rgba(92,64,51,0.08);
          box-shadow: 0 4px 14px rgba(59,47,47,0.035);
          transition: transform 0.4s cubic-bezier(0.22,1,0.36,1), box-shadow 0.4s cubic-bezier(0.22,1,0.36,1), border-color 0.4s ease;
        }
        .lobby-glass:hover {
          transform: translateY(-3px);
          box-shadow: 0 16px 48px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.03);
          border-color: rgba(61,90,53,0.15);
        }
        .lobby-glass::after {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, #3D5A35, #695c4d);
          opacity: 0;
          transition: opacity 0.4s ease;
        }
        .lobby-glass:hover::after {
          opacity: 1;
        }
        .lobby-btn {
          background: rgba(255,248,240,0.84);
          border: 1px solid rgba(61,90,53,0.16);
          color: #3D5A35;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.72), 0 1px 2px rgba(61,90,53,0.04);
          transition: all 0.25s cubic-bezier(0.22,1,0.36,1);
        }
        .lobby-btn:hover {
          background: rgba(61,90,53,0.08);
          border-color: rgba(61,90,53,0.28);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.76), 0 6px 14px rgba(61,90,53,0.06);
          transform: translateY(-1px);
        }
        .lobby-step-active {
          animation: lobby-step-pulse 2.8s ease-in-out infinite;
        }
      `}</style>

      {/* Navbar */}
      <header
        className="fixed top-0 w-full z-[100]"
        style={{
          height: '70px',
          background: 'rgba(255,248,240,0.9)',
          backdropFilter: 'blur(28px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
          borderBottom: '1px solid rgba(92,64,51,0.06)',
        }}
      >
        <div className="mx-auto flex h-full max-w-screen-2xl items-center justify-between px-4 md:px-12">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="flex items-center gap-1 bg-transparent p-0 text-left"
          >
            <Image
              src="/logo.png"
              alt="Case Compendium X"
              width={56}
              height={56}
              className="h-14 w-14 object-contain"
            />
            <div style={{ fontFamily: "'Newsreader', serif" }} className="text-xl font-semibold tracking-tight">
              <span className="text-[#453a2a]">Case Compendium</span>
              <span className="text-[#3D5A35]">X</span>
            </div>
          </button>
        </div>
      </header>

      <main className="relative flex min-h-[calc(100vh-70px)] flex-1 flex-col justify-center px-4 pb-20 pt-[90px] md:px-8 md:pb-24">
        <div className="mx-auto max-w-3xl w-full">

          {/* Ambient glow */}
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div
              className="absolute top-[25%] left-[10%] w-[400px] h-[400px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(61,90,53,0.09) 0%, transparent 60%)', animation: 'lobby-glow 12s ease-in-out infinite' }}
            />
            <div
              className="absolute top-[35%] right-[8%] w-[320px] h-[320px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(92,64,51,0.06) 0%, transparent 60%)', animation: 'lobby-glow 16s ease-in-out infinite reverse' }}
            />
          </div>

          {/* Header */}
          <div
            className="mb-7 max-w-[760px]"
            style={{ animation: 'lobby-fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both' }}
          >
            <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 pl-[2px]">
              <span className="text-[7px] tracking-[0.1em] font-semibold px-1.5 py-[1px] rounded-sm border border-[#3D5A35]/20 text-[#3D5A35]/60 bg-[#3D5A35]/5 leading-tight uppercase">
                Interviewer Mode
              </span>
              <span className="text-[7px] tracking-[0.1em] font-semibold px-1.5 py-[1px] rounded-sm border border-[#C4A882]/30 text-[#C4A882] bg-[#C4A882]/8 leading-tight uppercase">
                {requestedSessionMode === 'local' ? 'Same Device' : 'Remote'}
              </span>
            </div>
            <h1
              className="text-4xl font-light leading-[0.94] tracking-tight text-[#453a2a] md:text-5xl"
              style={{ fontFamily: "'Newsreader', serif" }}
            >
              <span className="inline-block" style={{ fontWeight: 300, animation: '_hi 0.45s ease forwards', opacity: 0 }}>Welcome,</span>
              {' '}
              <span className="inline-block text-[#3D5A35]" style={{ fontWeight: 400, animation: '_name 0.7s cubic-bezier(0.16,1,0.3,1) 0.08s forwards', opacity: 0 }}>Interviewer</span>
            </h1>
            <p className="mt-4 max-w-[620px] pl-[2px] text-[13px] leading-relaxed text-[#5c4033]/62">
              Select a case to begin. Everything after that is handled automatically for both sides.
            </p>
          </div>

          {/* Main card */}
          <div
            className="lobby-glass rounded-xl overflow-hidden"
            style={{ animation: 'lobby-card-in 0.6s cubic-bezier(0.22,1,0.36,1) 0.15s both' }}
          >
            {/* Status zone - glow bleeds into steps */}
            <div className="relative px-6 py-5 flex items-center justify-between overflow-hidden">
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: 'radial-gradient(ellipse at 50% 80%, rgba(61,90,53,0.05) 0%, transparent 70%)' }}
              />
              {/* Gradient divider instead of hard border */}
              <div
                className="pointer-events-none absolute bottom-0 left-6 right-6 h-[1px]"
                style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(61,90,53,0.1) 20%, rgba(196,168,130,0.08) 80%, transparent 100%)' }}
              />
              <div className="relative flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#3D5A35]/8 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3D5A35" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inset-0 rounded-full bg-[#3D5A35]" style={{ animation: 'lobby-pulse-ring 2s ease-in-out infinite' }} />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#3D5A35]" />
                    </span>
                    <span className="text-[12px] text-[#3B2F2F] font-medium">Candidate connected</span>
                  </div>
                  <span className="text-[10px] text-[#5C4033]/35 mt-1 block">{elapsed >= 30 ? 'Your candidate is ready' : `Waiting ${formatTime(elapsed)}`}</span>
                </div>
              </div>
            </div>

            {/* Horizontal steps */}
            <div className="px-6 py-6">
              <div className="grid grid-cols-5 gap-5">
                {[
                  { num: '01', text: 'Pick a case', active: true },
                  { num: '02', text: 'Run the session' },
                  { num: '03', text: 'Rate and feedback' },
                  { num: '04', text: 'AI evaluation' },
                  { num: '05', text: 'Insights delivered' },
                ].map((step, i) => (
                  <div
                    key={step.num}
                    className="flex flex-col items-center text-center gap-2.5"
                    style={{ animation: `lobby-step-in 0.4s cubic-bezier(0.22,1,0.36,1) ${0.3 + i * 0.08}s both` }}
                  >
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[9px] font-semibold tracking-wider ${
                      step.active
                        ? 'bg-[#3D5A35] text-white'
                        : 'bg-[#D9D0C4]/25 text-[#5C4033]/40'
                    } ${step.active ? 'lobby-step-active' : ''}`}>
                      {step.num}
                    </span>
                    <span className={`text-[12px] leading-snug ${
                      step.active ? 'text-[#3B2F2F] font-medium' : 'text-[#5C4033]/50'
                    }`}>{step.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="px-6 pb-6">
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/repository?mode=select&lobby=${lobbyId}&sessionMode=${requestedSessionMode}`
                  )
                }
                className="lobby-btn w-full rounded-full px-3 py-2.5 text-[9px] font-medium uppercase tracking-[0.16em]"
              >
                Open Case Library
              </button>
            </div>
          </div>

        </div>
      </main>

      <CompactPlatformFooter />
    </div>
  )
}

export default function LobbyPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const lobbyId = params.id as string

  const isInterviewer = searchParams.get('role') === 'interviewer'
  const requestedSessionMode = searchParams.get('mode') === 'local' ? 'local' : 'remote'
  const [checkingCandidate, setCheckingCandidate] = useState(!isInterviewer)
  const [sessionIssue, setSessionIssue] = useState('')
  const [candidateActionStatus, setCandidateActionStatus] = useState('')
  // After ~5 min in 'waiting' status (interviewer hasn't joined yet) we show
  // a nudge with a "Cancel" button so the candidate isn't stuck staring at
  // the same screen forever. We don't auto-redirect — the interviewer could
  // still be on their way and a surprise redirect would be worse than a stale
  // tab.
  const [waitingNudgeVisible, setWaitingNudgeVisible] = useState(false)

  // Interviewers arrive via shared invite links. Silently provision an
  // anonymous Firebase user so they can call /api routes (which all require
  // a valid bearer token) without ever needing to sign up. Anonymous users
  // get a real UID — the server-side identity check and rules-scoped reads
  // both work as if they were a regular signed-in user.
  useEffect(() => {
    if (!isInterviewer) return
    void signInAnonymouslyIfNeeded().catch(() => {
      // Auth failure here will surface later as an /api 401 — let that path
      // own the user-facing error rather than blocking the page now.
    })
  }, [isInterviewer])

  const isLocalSession = requestedSessionMode === 'local'
  const interviewerLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/lobby/${lobbyId}?role=interviewer&mode=${requestedSessionMode}`
      : '...'

  const flashCandidateActionStatus = (message: string) => {
    setCandidateActionStatus(message)
    window.setTimeout(() => setCandidateActionStatus(''), 2200)
  }

  const focusOrOpenLocalInterviewerWindow = () => {
    const popupWidth = 800
    const popupHeight = 800
    const popupHost = window as PopupWindowHost
    const left = Math.max(0, window.screenX + Math.round((window.outerWidth - popupWidth) / 2))
    const top = Math.max(0, window.screenY + Math.round((window.outerHeight - popupHeight) / 2))

    if (popupHost.__compendiumInterviewerWindow && !popupHost.__compendiumInterviewerWindow.closed) {
      popupHost.__compendiumInterviewerWindow.focus()
      flashCandidateActionStatus('Interviewer window ready')
      return
    }

    const interviewerWindow = window.open(
      `/lobby/${lobbyId}?role=interviewer&mode=local`,
      'InterviewerControl',
      `popup=yes,resizable=yes,width=${popupWidth},height=${popupHeight},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
    )

    if (!interviewerWindow) {
      flashCandidateActionStatus('Allow popups to continue')
      return
    }

    popupHost.__compendiumInterviewerWindow = interviewerWindow
    try {
      interviewerWindow.resizeTo(popupWidth, popupHeight)
    } catch {
      // Some browsers ignore programmatic resizing.
    }
    interviewerWindow.focus()
    flashCandidateActionStatus('Interviewer window ready')
  }

  useEffect(() => {
    if (isInterviewer) return

    let unsubscribeSession = () => {}
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let waitingNudgeTimer: ReturnType<typeof setTimeout> | null = null
    const WAITING_NUDGE_DELAY_MS = 5 * 60 * 1000
    const sessionRef = sessionDoc(lobbyId)
    const clearPoll = () => {
      if (!pollTimer) return
      clearInterval(pollTimer)
      pollTimer = null
    }
    const armWaitingNudge = () => {
      if (waitingNudgeTimer) return
      waitingNudgeTimer = setTimeout(() => {
        setWaitingNudgeVisible(true)
      }, WAITING_NUDGE_DELAY_MS)
    }
    const disarmWaitingNudge = () => {
      if (waitingNudgeTimer) {
        clearTimeout(waitingNudgeTimer)
        waitingNudgeTimer = null
      }
      setWaitingNudgeVisible(false)
    }

    const workspaceRoute = (caseId: string, mode?: SessionState['sessionMode']) => {
      const resolvedMode = mode === 'local' ? 'local' : 'remote'
      return `/case/${caseId}/workspace?lobby=${lobbyId}&mode=${resolvedMode}`
    }

    const routeFromSessionData = (data: SessionState | null) => {
      if (!data) return
      if (data.status === 'in_progress' && data.caseId) {
        disarmWaitingNudge()
        router.replace(workspaceRoute(data.caseId, data.sessionMode))
        return
      }
      if (data.status === 'completed') {
        disarmWaitingNudge()
        router.replace('/dashboard')
        return
      }
      if (data.status === 'waiting') {
        armWaitingNudge()
      }
    }

    const startPolling = () => {
      if (pollTimer) return
      pollTimer = setInterval(async () => {
        try {
          const sessionSnapshot = await getDoc(sessionRef)
          if (!sessionSnapshot.exists()) {
            setSessionIssue('Session not found. Generate a fresh practice link.')
            return
          }
          setSessionIssue('')
          routeFromSessionData(sessionSnapshot.data() as SessionState)
        } catch {
          setSessionIssue('Connection unstable. Retrying...')
        }
      }, 4000)
    }

    const stopPolling = () => {
      clearPoll()
      setSessionIssue('')
    }

    const handleSessionEndedPayload = (raw: string | null) => {
      if (!raw) return
      try {
        const data = JSON.parse(raw)
        if (data?.lobbyId === lobbyId) {
          router.replace('/dashboard')
        }
      } catch {
        // Ignore malformed localStorage payloads.
      }
    }

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === 'compendium-session-start' && event.newValue) {
        try {
          const data = JSON.parse(event.newValue)
          if (data.lobbyId === lobbyId) {
            router.replace(workspaceRoute(data.caseId, data.mode))
          }
        } catch {
          // Ignore malformed localStorage payloads.
        }
      }
      if (event.key === 'compendium-session-ended') {
        handleSessionEndedPayload(event.newValue)
      }
    }

    const setupCandidateSession = async () => {
      try {
        const user = await waitForAuthUser()
        if (!user) {
          router.push(`/login?redirect=/lobby/${lobbyId}`)
          return
        }

        const existingSession = await getDoc(sessionRef)
        if (existingSession.exists()) {
          const existingData = existingSession.data() as SessionState
          if (existingData.status === 'in_progress' && existingData.caseId) {
            router.replace(workspaceRoute(existingData.caseId, existingData.sessionMode))
            return
          }
          if (existingData.status === 'completed') {
            router.replace('/dashboard')
            return
          }
        }

        await apiPost('/api/sessions', {
          lobbyId,
          sessionMode: requestedSessionMode,
        })

        setCheckingCandidate(false)

        unsubscribeSession = onSnapshot(
          sessionRef,
          (snapshot) => {
            if (!snapshot.exists()) {
              setSessionIssue('Session not found. Generate a fresh practice link.')
              startPolling()
              return
            }
            stopPolling()
            routeFromSessionData(snapshot.data() as SessionState)
          },
          () => {
            setSessionIssue('Live updates paused. Reconnecting...')
            startPolling()
          }
        )

        window.addEventListener('storage', handleStorageEvent)
        const existing = localStorage.getItem('compendium-session-start')
        if (existing) {
          try {
            const parsed = JSON.parse(existing)
            if (parsed.lobbyId === lobbyId) {
              router.replace(workspaceRoute(parsed.caseId, parsed.mode))
            }
          } catch {
            // Ignore malformed localStorage payloads.
          }
        }
        handleSessionEndedPayload(localStorage.getItem('compendium-session-ended'))
      } catch {
        setCheckingCandidate(false)
        setSessionIssue('Unable to initialize session. Please refresh this page.')
      }
    }

    setupCandidateSession()

    return () => {
      unsubscribeSession()
      clearPoll()
      if (waitingNudgeTimer) {
        clearTimeout(waitingNudgeTimer)
        waitingNudgeTimer = null
      }
      window.removeEventListener('storage', handleStorageEvent)
    }
  }, [isInterviewer, lobbyId, requestedSessionMode, router])

  const handleCandidatePrimaryAction = async () => {
    if (isLocalSession) {
      focusOrOpenLocalInterviewerWindow()
      return
    }

    try {
      await navigator.clipboard.writeText(interviewerLink)
      flashCandidateActionStatus('Link copied')
    } catch {
      flashCandidateActionStatus('Unable to copy')
    }
  }

  if (!isInterviewer && checkingCandidate) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fff8f0] text-[#5c4033]">
        Preparing your session...
      </div>
    )
  }

  if (isInterviewer) {
    return (
      <InterviewerLobby
        lobbyId={lobbyId}
        requestedSessionMode={requestedSessionMode}
        router={router}
      />
    )
  }

  return (
    <CandidateLobby
      requestedSessionMode={requestedSessionMode}
      interviewerLink={interviewerLink}
      sessionIssue={sessionIssue}
      candidateActionStatus={candidateActionStatus}
      waitingNudgeVisible={waitingNudgeVisible}
      onCancelSession={() => router.push('/practice')}
      onPrimaryAction={() => {
        void handleCandidatePrimaryAction()
      }}
    />
  )
}
