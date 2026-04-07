'use client';

import { type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, Volume2, X } from 'lucide-react';

interface DemoStep {
  id: string;
  indexLabel: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  placeholderLabel: string;
  videoSrc?: string;
  posterSrc?: string;
  accentColor: string;
  accentSoft: string;
  autoDurationMs: number;
  mediaScale?: number;
  mediaPosition?: string;
}

interface AIDemoModalProps {
  onClose: () => void;
}

const DEMO_STEPS: DemoStep[] = [
  {
    id: 'analyser',
    indexLabel: '01',
    eyebrow: 'The Intelligence',
    title: 'The Analyser',
    subtitle: 'Patterns across feedback.',
    placeholderLabel: 'Replace with the Analyser demo MP4.',
    videoSrc: '/demo-videos/analyser.mp4',
    accentColor: '#695c4d',
    accentSoft: 'rgba(105,92,77,0.14)',
    autoDurationMs: 7200,
    mediaScale: 1.04,
    mediaPosition: 'center center',
  },
  {
    id: 'coach',
    indexLabel: '02',
    eyebrow: 'The Strategy',
    title: 'The Coach',
    subtitle: 'One sharp next step.',
    placeholderLabel: 'Replace with the Coach demo MP4.',
    videoSrc: '/demo-videos/coach.mp4',
    accentColor: '#3D5A35',
    accentSoft: 'rgba(61,90,53,0.14)',
    autoDurationMs: 7600,
    mediaScale: 1.04,
    mediaPosition: 'center center',
  },
  {
    id: 'tracker',
    indexLabel: '03',
    eyebrow: 'The Progress',
    title: 'The Tracker',
    subtitle: 'Preparation against a target.',
    placeholderLabel: 'Replace with the Tracker demo MP4.',
    videoSrc: '/demo-videos/tracker.mp4',
    accentColor: '#453a2a',
    accentSoft: 'rgba(69,58,42,0.14)',
    autoDurationMs: 7000,
    mediaScale: 1.04,
    mediaPosition: 'center center',
  },
];

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const DemoPlaceholderStage = ({
  step,
  progress,
}: {
  step: DemoStep;
  progress: number;
}) => (
  <div className="demo-stage-shell">
    <div
      className="demo-stage-surface"
      style={{
        background: `linear-gradient(135deg, ${step.accentSoft} 0%, rgba(255,248,240,0.94) 42%, rgba(232,226,216,0.88) 100%)`,
      }}
    >
      <div
        className="demo-stage-glow demo-stage-glow-left"
        style={{ background: `radial-gradient(circle, ${step.accentSoft} 0%, transparent 72%)` }}
      />
      <div
        className="demo-stage-glow demo-stage-glow-right"
        style={{ background: `radial-gradient(circle, rgba(255,255,255,0.78) 0%, transparent 74%)` }}
      />

      <div className="demo-stage-header">
        <span className="demo-stage-kicker">
          {step.indexLabel} / {step.eyebrow}
        </span>
        <span className="demo-stage-kicker">Video Placeholder</span>
      </div>

      <div className="demo-stage-center">
        <div
          className="demo-stage-play"
          style={{ boxShadow: `0 18px 44px ${step.accentSoft}` }}
        >
          <Play size={24} strokeWidth={2.2} />
        </div>

        <div className="demo-stage-copy">
          <h4>{step.title}</h4>
          <p>{step.placeholderLabel}</p>
        </div>
      </div>

      <div className="demo-stage-ghost">
        <div className="demo-stage-ghost-top">
          <span className="demo-stage-dot" style={{ background: step.accentColor }} />
          <span className="demo-stage-dot" />
          <span className="demo-stage-dot" />
        </div>
        <div className="demo-stage-ghost-lines">
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className="demo-stage-timeline">
        <div
          className="demo-stage-timeline-fill"
          style={{
            width: `${Math.max(progress * 100, 4)}%`,
            background: `linear-gradient(90deg, ${step.accentColor} 0%, rgba(255,248,240,0.92) 180%)`,
          }}
        />
      </div>
    </div>
  </div>
);

const AIDemoModal = ({ onClose }: AIDemoModalProps) => {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [activeProgress, setActiveProgress] = useState(0);
  const [isVideoPaused, setIsVideoPaused] = useState(false);
  const [isUserPaused, setIsUserPaused] = useState(false);
  const [controlFlash, setControlFlash] = useState<'play' | 'pause' | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);
  const interactionLockUntilRef = useRef(0);

  const currentStep = DEMO_STEPS[activeStepIndex];
  const isLastStep = activeStepIndex === DEMO_STEPS.length - 1;
  const showVideoChrome = isUserPaused || controlFlash !== null;

  const cancelProgressLoop = () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  };

  const clearControlFlash = () => {
    if (flashTimeoutRef.current !== null) {
      window.clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = null;
    }
  };

  const showControlFlash = (type: 'play' | 'pause') => {
    clearControlFlash();
    setControlFlash(type);
    flashTimeoutRef.current = window.setTimeout(() => {
      setControlFlash(null);
      flashTimeoutRef.current = null;
    }, 720);
  };

  const getVideoProgress = (video: HTMLVideoElement) => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return 0;
    return Math.max(0, Math.min(1, video.currentTime / video.duration));
  };

  const stopAndResetVideo = () => {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    try {
      video.currentTime = 0;
    } catch {
      // Ignore reset errors on unloaded media.
    }
  };

  const goToStep = (index: number) => {
    cancelProgressLoop();
    clearControlFlash();
    stopAndResetVideo();
    setIsVideoPaused(false);
    setIsUserPaused(false);
    setActiveProgress(0);
    setActiveStepIndex(Math.max(0, Math.min(index, DEMO_STEPS.length - 1)));
  };

  const goToNext = () => {
    if (isLastStep) return;
    goToStep(activeStepIndex + 1);
  };

  const goToPrevious = () => {
    if (activeStepIndex === 0) return;
    goToStep(activeStepIndex - 1);
  };

  const startSyntheticProgress = (step: DemoStep, stepIndex: number) => {
    const startedAt = performance.now();

    const animate = (timestamp: number) => {
      const ratio = Math.min((timestamp - startedAt) / step.autoDurationMs, 1);
      setActiveProgress(ratio);

      if (ratio >= 1) {
        if (stepIndex < DEMO_STEPS.length - 1) {
          setActiveStepIndex(stepIndex + 1);
        }
        return;
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
  };

  const startVideoProgressLoop = (video: HTMLVideoElement, stepIndex: number) => {
    cancelProgressLoop();

    const animate = () => {
      if (stepIndex !== activeStepIndex) return;

      setActiveProgress(getVideoProgress(video));

      if (!video.paused && !video.ended) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
  };

  const handleVideoToggle = async () => {
    if (performance.now() < interactionLockUntilRef.current) return;

    const activeVideoElement = videoRef.current;
    if (!currentStep.videoSrc || !activeVideoElement) return;

    if (activeVideoElement.paused || activeVideoElement.ended) {
      if (activeVideoElement.ended) {
        try {
          activeVideoElement.currentTime = 0;
        } catch {
          // Ignore reset errors on unloaded media.
        }
      }

      try {
        await activeVideoElement.play();
        setIsVideoPaused(false);
        setIsUserPaused(false);
        startVideoProgressLoop(activeVideoElement, activeStepIndex);
        showControlFlash('play');
      } catch {
        startSyntheticProgress(currentStep, activeStepIndex);
      }

      return;
    }

    activeVideoElement.pause();
    cancelProgressLoop();
    setActiveProgress(getVideoProgress(activeVideoElement));
    setIsVideoPaused(true);
    setIsUserPaused(true);
    showControlFlash('pause');
  };

  const handleProgressBarSeek = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const activeVideoElement = videoRef.current;
    if (!currentStep.videoSrc || !activeVideoElement || !Number.isFinite(activeVideoElement.duration) || activeVideoElement.duration <= 0) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;

    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));

    try {
      activeVideoElement.currentTime = ratio * activeVideoElement.duration;
    } catch {
      return;
    }

    setActiveProgress(ratio);

    if (!activeVideoElement.paused && !activeVideoElement.ended) {
      startVideoProgressLoop(activeVideoElement, activeStepIndex);
    }
  };

  useEffect(() => {
    closeButtonRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !modalRef.current) return;

      const focusables = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((element) => !element.hasAttribute('disabled') && element.tabIndex !== -1);

      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first || !modalRef.current.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelProgressLoop();
      clearControlFlash();
      stopAndResetVideo();
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    cancelProgressLoop();
    clearControlFlash();
    stopAndResetVideo();
    setActiveProgress(0);
    setIsVideoPaused(false);
    setIsUserPaused(false);
    interactionLockUntilRef.current = performance.now() + 320;

    const step = DEMO_STEPS[activeStepIndex];
    const activeVideo = videoRef.current;

    if (!step.videoSrc) {
      startSyntheticProgress(step, activeStepIndex);

      return () => {
        cancelProgressLoop();
      };
    }

    if (activeVideo) {
      activeVideo.muted = false;
      activeVideo.volume = 1;
      activeVideo.playsInline = true;
      activeVideo.preload = 'auto';

      try {
        activeVideo.currentTime = 0;
      } catch {
        // Ignore reset errors on unloaded media.
      }

      const handleLoadedMetadata = () => {
        setActiveProgress(getVideoProgress(activeVideo));
      };

      const handlePlaying = () => {
        setIsVideoPaused(false);
        setIsUserPaused(false);
        startVideoProgressLoop(activeVideo, activeStepIndex);
      };

      const handlePause = () => {
        cancelProgressLoop();
        setActiveProgress(getVideoProgress(activeVideo));

        if (!activeVideo.ended) {
          setIsVideoPaused(true);
        }
      };

      const handleEnded = () => {
        cancelProgressLoop();
        setActiveProgress(1);
        setIsVideoPaused(false);
        setIsUserPaused(false);

        if (activeStepIndex < DEMO_STEPS.length - 1) {
          setActiveStepIndex((prev) => Math.min(prev + 1, DEMO_STEPS.length - 1));
        }
      };

      activeVideo.addEventListener('loadedmetadata', handleLoadedMetadata);
      activeVideo.addEventListener('playing', handlePlaying);
      activeVideo.addEventListener('pause', handlePause);
      activeVideo.addEventListener('ended', handleEnded);

      activeVideo.play()
        .then(() => {
          setIsVideoPaused(false);
          setIsUserPaused(false);
          startVideoProgressLoop(activeVideo, activeStepIndex);
        })
        .catch(() => {
          startSyntheticProgress(step, activeStepIndex);
        });

      return () => {
        cancelProgressLoop();
        activeVideo.pause();
        activeVideo.removeEventListener('loadedmetadata', handleLoadedMetadata);
        activeVideo.removeEventListener('playing', handlePlaying);
        activeVideo.removeEventListener('pause', handlePause);
        activeVideo.removeEventListener('ended', handleEnded);
      };
    }

    return () => {
      cancelProgressLoop();
    };
  }, [activeStepIndex]);

  const stepProgresses = useMemo(
    () =>
      DEMO_STEPS.map((_, index) => {
        if (index < activeStepIndex) return 1;
        if (index === activeStepIndex) return activeProgress;
        return 0;
      }),
    [activeProgress, activeStepIndex]
  );

  return (
    <>
      <style>{`
        @keyframes demo-node-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(61,90,53,0.18); }
          70% { box-shadow: 0 0 0 10px rgba(61,90,53,0); }
        }
        .demo-modal-shell {
          background:
            radial-gradient(circle at top left, rgba(61,90,53,0.05), transparent 24%),
            radial-gradient(circle at bottom right, rgba(69,58,42,0.06), transparent 28%),
            rgba(255,248,240,0.97);
        }
        .demo-tour-rail-scroll::-webkit-scrollbar,
        .demo-tour-stage-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .demo-tour-rail-scroll::-webkit-scrollbar-thumb,
        .demo-tour-stage-scroll::-webkit-scrollbar-thumb {
          background: rgba(92,64,51,0.16);
          border-radius: 999px;
        }
        .demo-rail-button {
          position: relative;
          display: grid;
          grid-template-columns: 26px 18px 1fr;
          gap: 14px;
          width: 100%;
          border: none;
          background: transparent;
          padding: 0;
          text-align: left;
          cursor: pointer;
        }
        .demo-rail-index {
          padding-top: 2px;
          font-family: 'Work Sans', sans-serif;
          font-size: 9px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          font-weight: 700;
          color: rgba(92,64,51,0.38);
        }
        .demo-rail-track {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .demo-rail-node {
          width: 12px;
          height: 12px;
          border-radius: 999px;
          border: 1px solid rgba(61,90,53,0.18);
          background: rgba(255,248,240,0.96);
          box-shadow: 0 0 0 3px rgba(255,248,240,0.98);
          z-index: 2;
          transition: all 0.28s ease;
        }
        .demo-rail-node.active {
          background: #3D5A35;
          border-color: #3D5A35;
          animation: demo-node-pulse 2.6s ease-in-out infinite;
        }
        .demo-rail-node.complete {
          background: rgba(61,90,53,0.7);
          border-color: rgba(61,90,53,0.72);
        }
        .demo-rail-line {
          position: relative;
          width: 2px;
          min-height: 54px;
          margin-top: 8px;
          flex: 1;
          border-radius: 999px;
          background: rgba(61,90,53,0.1);
          overflow: hidden;
        }
        .demo-rail-line-fill {
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          bottom: 0;
          border-radius: inherit;
          background: linear-gradient(180deg, rgba(61,90,53,0.22) 0%, rgba(61,90,53,0.88) 100%);
          transform-origin: top center;
          transition: transform 0.16s linear;
        }
        .demo-rail-copy {
          padding-bottom: 20px;
        }
        .demo-rail-eyebrow {
          display: block;
          margin-bottom: 6px;
          font-family: 'Work Sans', sans-serif;
          font-size: 8px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-weight: 700;
          color: rgba(61,90,53,0.5);
        }
        .demo-rail-title {
          display: block;
          font-family: 'Newsreader', serif;
          font-size: 1.08rem;
          line-height: 1.05;
          color: rgba(69,58,42,0.86);
          transition: color 0.24s ease;
        }
        .demo-rail-button:hover .demo-rail-title,
        .demo-rail-button[data-active='true'] .demo-rail-title {
          color: #1e1b15;
        }
        .demo-mobile-steps {
          display: none;
        }
        .demo-mobile-step {
          position: relative;
          overflow: hidden;
        }
        .demo-mobile-step-fill {
          position: absolute;
          left: 0;
          right: auto;
          bottom: 0;
          height: 2px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(61,90,53,0.48) 0%, rgba(61,90,53,0.92) 100%);
          transition: width 0.15s linear;
        }
        .demo-stage-shell {
          position: relative;
          overflow: hidden;
          border-radius: 28px;
          border: 1px solid rgba(61,90,53,0.1);
          background: rgba(255,248,240,0.84);
          box-shadow: 0 28px 80px rgba(0,0,0,0.1);
        }
        .demo-stage-shell[data-chrome-visible='true'] .demo-stage-progress-rail,
        .demo-stage-shell[data-paused='true'] .demo-stage-progress-rail,
        .demo-stage-shell:hover .demo-stage-progress-rail {
          opacity: 0.9;
        }
        .demo-stage-shell:hover .demo-stage-progress-rail {
          height: 3px;
          background: rgba(255,248,240,0.14);
          box-shadow: 0 -10px 24px rgba(18,16,13,0.14);
        }
        .demo-stage-shell:hover .demo-stage-progress-fill {
          filter: saturate(1.06) brightness(1.02);
          box-shadow: 0 0 10px rgba(255,248,240,0.12);
        }
        .demo-stage-surface {
          position: relative;
          aspect-ratio: 16 / 9;
          overflow: hidden;
          background: #171412;
        }
        .demo-stage-media-wrap {
          position: absolute;
          inset: 0;
          overflow: hidden;
        }
        .demo-stage-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          background: #171412;
          transform-origin: center center;
          transition: transform 0.35s ease, filter 0.35s ease;
        }
        .demo-stage-shell[data-paused='true'] .demo-stage-video {
          filter: saturate(0.94) brightness(0.9);
        }
        .demo-stage-video-tint {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(18,16,13,0.03) 0%, rgba(18,16,13,0.02) 36%, rgba(18,16,13,0.22) 100%),
            radial-gradient(circle at 50% 18%, rgba(255,248,240,0.06), transparent 32%);
          pointer-events: none;
        }
        .demo-stage-glow {
          position: absolute;
          width: 320px;
          height: 320px;
          border-radius: 999px;
          filter: blur(26px);
          pointer-events: none;
          opacity: 0.9;
        }
        .demo-stage-glow-left {
          left: -8%;
          top: -18%;
        }
        .demo-stage-glow-right {
          right: -4%;
          bottom: -20%;
        }
        .demo-stage-header {
          position: absolute;
          top: 18px;
          left: 20px;
          right: 20px;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .demo-stage-kicker {
          font-family: 'Work Sans', sans-serif;
          font-size: 8px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          font-weight: 700;
          color: rgba(92,64,51,0.5);
        }
        .demo-stage-center {
          position: absolute;
          inset: 0;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 18px;
          padding: 32px;
          text-align: center;
        }
        .demo-stage-play {
          width: 82px;
          height: 82px;
          border-radius: 999px;
          border: 1px solid rgba(61,90,53,0.12);
          background: rgba(255,248,240,0.86);
          color: #453a2a;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(14px);
        }
        .demo-stage-copy h4 {
          margin: 0;
          font-family: 'Newsreader', serif;
          font-size: clamp(2rem, 4vw, 3rem);
          line-height: 0.95;
          letter-spacing: -0.04em;
          color: #453a2a;
        }
        .demo-stage-copy p {
          margin: 10px 0 0;
          font-family: 'Work Sans', sans-serif;
          font-size: 0.8rem;
          line-height: 1.5;
          color: rgba(67,72,64,0.72);
        }
        .demo-stage-ghost {
          position: absolute;
          right: 24px;
          bottom: 28px;
          z-index: 2;
          width: min(27%, 220px);
          min-width: 160px;
          padding: 16px;
          border-radius: 22px;
          border: 1px solid rgba(61,90,53,0.1);
          background: rgba(255,248,240,0.68);
          box-shadow: 0 16px 38px rgba(61,90,53,0.08);
          backdrop-filter: blur(12px);
        }
        .demo-stage-ghost-top {
          display: flex;
          gap: 7px;
          margin-bottom: 14px;
        }
        .demo-stage-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: rgba(92,64,51,0.16);
        }
        .demo-stage-ghost-lines {
          display: grid;
          gap: 8px;
        }
        .demo-stage-ghost-lines span {
          display: block;
          height: 8px;
          border-radius: 999px;
          background: rgba(61,90,53,0.08);
        }
        .demo-stage-ghost-lines span:nth-child(1) {
          width: 92%;
        }
        .demo-stage-ghost-lines span:nth-child(2) {
          width: 74%;
        }
        .demo-stage-ghost-lines span:nth-child(3) {
          width: 84%;
        }
        .demo-stage-progress-rail,
        .demo-stage-timeline {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 4;
          height: 2px;
          background: rgba(255,248,240,0.08);
          overflow: hidden;
          opacity: 0.18;
          transition: opacity 0.24s ease;
        }
        .demo-stage-progress-fill,
        .demo-stage-timeline-fill {
          height: 100%;
          transform-origin: left center;
          transition: transform 0.15s linear, width 0.15s linear, filter 0.2s ease, box-shadow 0.2s ease;
        }
        .demo-stage-progress-hitbox {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 5;
          height: 18px;
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
        }
        .demo-stage-resume {
          position: absolute;
          inset: 0;
          z-index: 4;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: rgba(18,16,13,0.12);
          cursor: pointer;
          transition: background 0.22s ease;
        }
        .demo-stage-resume:hover {
          background: rgba(18,16,13,0.16);
        }
        .demo-stage-resume-inner {
          width: 88px;
          height: 88px;
          border-radius: 999px;
          border: 1px solid rgba(255,248,240,0.24);
          background: rgba(255,248,240,0.18);
          color: #fff8f0;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(18px);
          box-shadow: 0 18px 38px rgba(0,0,0,0.18);
        }
        .demo-stage-flash {
          position: absolute;
          inset: 0;
          z-index: 4;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.18s ease;
        }
        .demo-stage-flash.visible {
          opacity: 1;
        }
        .demo-stage-flash-pill {
          width: 64px;
          height: 64px;
          border-radius: 999px;
          border: 1px solid rgba(255,248,240,0.22);
          background: rgba(255,248,240,0.14);
          color: #fff8f0;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(16px);
          box-shadow: 0 16px 34px rgba(0,0,0,0.16);
        }
        @media (max-width: 768px) {
          .demo-mobile-steps {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
          }
          .demo-stage-header {
            top: 14px;
            left: 14px;
            right: 14px;
          }
          .demo-stage-copy h4 {
            font-size: 2rem;
          }
          .demo-stage-copy p {
            font-size: 0.76rem;
          }
          .demo-stage-play {
            width: 72px;
            height: 72px;
          }
          .demo-stage-ghost {
            display: none;
          }
          .demo-stage-resume-inner {
            width: 78px;
            height: 78px;
          }
          .demo-stage-flash-pill {
            width: 58px;
            height: 58px;
          }
          .demo-stage-progress-rail,
          .demo-stage-timeline {
            opacity: 0.72;
          }
        }
      `}</style>

      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6"
        style={{ background: 'rgba(27,24,19,0.56)', backdropFilter: 'blur(10px)' }}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-demo-modal-title"
          className="demo-modal-shell relative w-full max-w-[1120px] overflow-hidden rounded-[32px] border border-[#3D5A35]/10 shadow-[0_30px_90px_rgba(0,0,0,0.22)]"
        >
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close guided AI demo"
            onClick={onClose}
            className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-[#3D5A35]/10 bg-[#fff8f0]/90 text-[#5C4033]/60 transition-all hover:border-[#3D5A35]/20 hover:text-[#453a2a]"
          >
            <X size={18} strokeWidth={2.1} />
          </button>

          <div className="grid max-h-[92vh] grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="demo-tour-rail-scroll hidden overflow-y-auto border-r border-[#3D5A35]/10 bg-[#faf3e9]/70 px-7 py-7 md:block">
              <div className="mb-8 pr-8">
                <span className="inline-flex rounded-full border border-[#3D5A35]/10 bg-[#fff8f0]/80 px-3 py-1 font-['Work_Sans'] text-[9px] font-semibold uppercase tracking-[0.2em] text-[#3D5A35]/60">
                  AI Demo
                </span>
                <h3
                  id="ai-demo-modal-title"
                  className="mt-4 font-['Newsreader'] text-[2rem] leading-[0.95] tracking-[-0.04em] text-[#453a2a]"
                >
                  AI Models
                </h3>
              </div>

              <div className="space-y-1">
                {DEMO_STEPS.map((step, index) => {
                  const isActive = index === activeStepIndex;
                  const isComplete = index < activeStepIndex;

                  return (
                    <button
                      key={step.id}
                      type="button"
                      className="demo-rail-button"
                      data-active={isActive}
                      onClick={() => goToStep(index)}
                    >
                      <span className="demo-rail-index">{step.indexLabel}</span>

                      <span className="demo-rail-track" aria-hidden="true">
                        <span className={`demo-rail-node ${isActive ? 'active' : isComplete ? 'complete' : ''}`} />
                        {index < DEMO_STEPS.length - 1 && (
                          <span className="demo-rail-line">
                            <span
                              className="demo-rail-line-fill"
                              style={{ transform: `scaleY(${stepProgresses[index]})` }}
                            />
                          </span>
                        )}
                      </span>

                      <span className="demo-rail-copy">
                        <span className="demo-rail-eyebrow">{step.eyebrow}</span>
                        <span className="demo-rail-title">{step.title}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section className="demo-tour-stage-scroll overflow-y-auto px-4 pb-5 pt-5 md:px-8 md:pb-7 md:pt-7">
              <div className="demo-mobile-steps mb-4 md:hidden">
                {DEMO_STEPS.map((step, index) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => goToStep(index)}
                    className="demo-mobile-step rounded-[16px] border border-[#3D5A35]/10 bg-[#fff8f0]/70 px-3 py-3 text-left"
                  >
                    <span className="block font-['Work_Sans'] text-[8px] font-semibold uppercase tracking-[0.18em] text-[#3D5A35]/60">
                      {step.indexLabel}
                    </span>
                    <span className="mt-1 block font-['Newsreader'] text-[15px] leading-none text-[#453a2a]">
                      {step.title}
                    </span>
                    <span className="demo-mobile-step-fill" style={{ width: `${stepProgresses[index] * 100}%` }} />
                  </button>
                ))}
              </div>

              <div className="mb-3 flex items-start justify-between gap-6 pr-12">
                <div>
                  <span className="mb-2 block font-['Work_Sans'] text-[9px] font-semibold uppercase tracking-[0.22em] text-[#3D5A35]/60">
                    {currentStep.indexLabel} / {currentStep.eyebrow}
                  </span>
                  <h2 className="font-['Newsreader'] text-[2rem] leading-[0.94] tracking-[-0.04em] text-[#453a2a] md:text-[2.45rem]">
                    {currentStep.title}
                  </h2>
                  <p className="mt-1 text-[14px] text-[#434840]/70 md:text-[15px]">
                    {currentStep.subtitle}
                  </p>
                </div>

                <div className="hidden shrink-0 items-center gap-2 rounded-full border border-[#3D5A35]/10 bg-[#fff8f0]/80 px-3 py-2 md:flex">
                  <Volume2 size={14} strokeWidth={2.1} className="text-[#3D5A35]/70" />
                  <span className="font-['Work_Sans'] text-[9px] font-semibold uppercase tracking-[0.18em] text-[#5C4033]/60">
                    Audio on
                  </span>
                </div>
              </div>

              {currentStep.videoSrc ? (
                <div
                  className="demo-stage-shell"
                  data-chrome-visible={showVideoChrome}
                  data-paused={isUserPaused}
                  onClick={handleVideoToggle}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void handleVideoToggle();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={isVideoPaused ? 'Resume demo video' : 'Pause demo video'}
                >
                  <div className="demo-stage-surface">
                    <div
                      className="demo-stage-glow demo-stage-glow-left"
                      style={{ background: `radial-gradient(circle, ${currentStep.accentSoft} 0%, transparent 72%)` }}
                    />
                    <div
                      className="demo-stage-glow demo-stage-glow-right"
                      style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 74%)' }}
                    />

                    <div className="demo-stage-media-wrap">
                      <video
                        ref={videoRef}
                        src={currentStep.videoSrc}
                        poster={currentStep.posterSrc}
                        playsInline
                        preload="metadata"
                        className="demo-stage-video"
                        style={{
                          transform: `scale(${currentStep.mediaScale ?? 1})`,
                          objectPosition: currentStep.mediaPosition ?? 'center center',
                        }}
                      />
                    </div>

                    <div className="demo-stage-video-tint" />

                    {isUserPaused && (
                      <div className="demo-stage-resume" aria-hidden="true">
                        <span className="demo-stage-resume-inner">
                          <Play size={28} strokeWidth={2.2} />
                        </span>
                      </div>
                    )}

                    <div className={`demo-stage-flash ${controlFlash ? 'visible' : ''}`}>
                      <span className="demo-stage-flash-pill">
                        {controlFlash === 'pause' ? <Pause size={24} strokeWidth={2.2} /> : <Play size={24} strokeWidth={2.2} />}
                      </span>
                    </div>

                    <button
                      type="button"
                      aria-label="Seek through video"
                      className="demo-stage-progress-hitbox"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleProgressBarSeek(event);
                      }}
                    />

                    <div className="demo-stage-progress-rail">
                      <div
                        className="demo-stage-progress-fill"
                        style={{
                          transform: `scaleX(${Math.max(activeProgress, 0.01)})`,
                          background: `linear-gradient(90deg, ${currentStep.accentColor} 0%, rgba(255,248,240,0.92) 180%)`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <DemoPlaceholderStage step={currentStep} progress={activeProgress} />
              )}

              <div className="mt-5 flex items-center justify-between gap-4">
                <div className="font-['Work_Sans'] text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5C4033]/40">
                  {currentStep.indexLabel} / {DEMO_STEPS.length.toString().padStart(2, '0')}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={goToPrevious}
                    disabled={activeStepIndex === 0}
                    className="inline-flex h-11 items-center gap-2 rounded-full border border-[#3D5A35]/10 bg-[#fff8f0]/80 px-4 font-['Work_Sans'] text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5C4033]/60 transition-all hover:border-[#3D5A35]/20 hover:text-[#453a2a] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <ChevronLeft size={16} strokeWidth={2.2} />
                    Prev
                  </button>

                  <button
                    type="button"
                    onClick={isLastStep ? () => goToStep(0) : goToNext}
                    className="inline-flex h-11 items-center gap-2 rounded-full border border-[#3D5A35]/10 bg-[#3D5A35] px-4 font-['Work_Sans'] text-[10px] font-semibold uppercase tracking-[0.18em] text-[#fff8f0] transition-all hover:bg-[#2f4d28]"
                  >
                    {isLastStep ? 'Replay' : 'Next'}
                    {isLastStep ? <Play size={15} strokeWidth={2.2} /> : <ChevronRight size={16} strokeWidth={2.2} />}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
};

export default AIDemoModal;
