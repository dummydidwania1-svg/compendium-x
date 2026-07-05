'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useRef, useState } from 'react';import AIDemoModal from '@/components/AIDemoModal';
import Footer from '@/components/dashboard/Footer';

type TabId = 'ai-models' | 'dashboard' | 'repository';

const CONTRIBUTOR_LOGOS = [
  { src: '/colleges/srcc.png', alt: 'SRCC', title: 'Shri Ram College of Commerce' },
  { src: '/colleges/st-stephens.png', alt: "St. Stephen's", title: "St. Stephen's College, Delhi" },
  { src: '/colleges/sscbs.png', alt: 'SSCBS', title: 'Shaheed Sukhdev College of Business Studies' },
  { src: '/colleges/lsr.png', alt: 'LSR', title: 'Lady Shri Ram College' },
  { src: '/colleges/ashoka.png', alt: 'Ashoka', title: 'Ashoka University' },
  { src: '/colleges/iit-delhi.png', alt: 'IIT Delhi', title: 'Indian Institute of Technology Delhi' },
  { src: '/colleges/iit-bombay.png', alt: 'IIT Bombay', title: 'Indian Institute of Technology Bombay' },
  { src: '/colleges/iit-kharagpur.png', alt: 'IIT Kharagpur', title: 'Indian Institute of Technology Kharagpur' },
  { src: '/colleges/iit-kanpur.png', alt: 'IIT Kanpur', title: 'Indian Institute of Technology Kanpur' },
  { src: '/colleges/iit-madras.png', alt: 'IIT Madras', title: 'Indian Institute of Technology Madras' },
];

const FEATURE_CARDS = [
  {
    eyebrow: '01 / The Intelligence',
    title: 'The Analyser',
    description:
      'Most candidates get a score and move on. The Analyser dissects every session across 10+ dimensions, from structure and reasoning to communication and creativity, building an intelligence profile that sharpens with each case. Blind spots surfaced, weaknesses tracked across case types, raw transcripts turned into feedback no interviewer could deliver in real-time.',
    icon: 'lightbulb',
  },
  {
    eyebrow: '02 / The Strategy',
    title: 'The Coach',
    description:
      'Scores tell you where you stand, not what to fix. The Coach synthesises your Analyser data into targeted action plans, pinpointing the single highest-leverage skill to work on next. It adapts as your performance shifts, recalibrating priorities so every practice session counts.',
    icon: 'rocket_launch',
  },
  {
    eyebrow: '03 / The Progress',
    title: 'The Tracker',
    description:
      'Without structure, preparation drifts. The Tracker maps your target interview date, sets case quotas by type and difficulty, and benchmarks your actual pace against the plan. Fall behind, and it recalibrates. Stay ahead, and it raises the bar.',
    icon: 'target',
  },
];

const DASH_CALLOUTS = [
  {
    number: '01',
    title: 'Case Score',
    description: 'Your composite performance rating across all dimensions and case types.',
    anchor: 'left',
    positionStyle: { top: '70px', left: '-210px', width: '190px' },
    color: '#3D5A35',
  },
  {
    number: '02',
    title: 'Skill Profile',
    description: 'Granular breakdown across structure, delivery, analysis, and creativity.',
    anchor: 'right',
    positionStyle: { top: '70px', right: '-210px', width: '190px' },
    color: '#3D5A35',
  },
  {
    number: '03',
    title: 'Practice Log',
    description: 'Full case history with LLM transcripts, scores, and replayable sessions.',
    anchor: 'right',
    positionStyle: { top: '200px', right: '-210px', width: '190px' },
    color: '#453a2a',
  },
  {
    number: '04',
    title: 'Performance Trend',
    description: 'Customisable time-series view of your improvement trajectory.',
    anchor: 'left',
    positionStyle: { bottom: '30px', left: '-210px', width: '190px' },
    color: '#3D5A35',
  },
];

const DASH_ZONE_THRESHOLDS = [0, 0.12, 0.28, 0.45];
const REPO_THRESHOLDS = [0, 0.12, 0.3];

const REPOSITORY_LAYERS = {
  0: {
    title: 'The Repository',
    icon: 'library_books',
    calloutNumber: '01 / The Foundation',
    calloutTitle: 'Case Repository',
    calloutDescription: '70+ curated cases spanning 5 years of real interviews from top consulting firms.',
    calloutSide: 'right',
  },
  1: {
    title: 'The Drilldowns',
    icon: 'query_stats',
    calloutNumber: '02 / The Depth',
    calloutTitle: 'Drilldowns',
    calloutDescription: 'Case-by-case breakdowns explaining the why and how, building structured thinking.',
    calloutSide: 'left',
  },
  2: {
    title: 'The Forum',
    icon: 'forum',
    calloutNumber: '03 / The Crown',
    calloutTitle: 'Forum',
    calloutDescription: 'Peer discussions and shared strategies from fellow candidates.',
    calloutSide: 'right',
  },
};

const REPOSITORY_RENDER_ORDER = [2, 1, 0];

const DEMO_STEPS = [
  { id: 1, label: 'Repository',  icon: 'library_books',     src: '/demo/step1.mp4' },
  { id: 2, label: 'Modes',       icon: 'splitscreen',        src: '/demo/step2.mp4' },
  { id: 3, label: 'Live Case',   icon: 'record_voice_over',  src: '/demo/step3.mp4' },
  { id: 4, label: 'Feedback',    icon: 'rate_review',        src: '/demo/step4.mp4' },
  { id: 5, label: 'Dashboard',   icon: 'dashboard',          src: '/demo/step5.mp4' },
];

const HUMAN_ONLY_POINTS = [
  'Authentic pressure and interpersonal dynamics',
  'Inconsistent feedback across partners',
  'No structured progress tracking',
  'Sessions unrecorded; insights fade',
];

const FULL_AI_POINTS = [
  'Scalable, accessible, unlimited reps',
  'Synthetic scenarios can plateau over time',
  'Pressure dynamics differ from live settings',
  'Some nuances still need human interaction',
];

const COMPENDIUM_X_POINTS = [
  'Real partners + AI analysis on every session',
  '10+ dimensions scored in real-time',
  'Searchable, replayable session repository',
  'Predictive readiness mapping',
];

const PerspectiveIcon = ({ name }: { name: string }) => (
  <div className="relative w-44 h-44 flex items-center justify-center" style={{ perspective: '600px' }}>
    <div className="absolute inset-[-10px] rounded-full blur-2xl" style={{ background: 'rgba(61,90,53,0.06)' }} />
    <span
      className="material-symbols-outlined relative z-10 text-[#3D5A35]"
      style={{
        fontSize: '160px',
        fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 48",
        transform: 'rotateY(-12deg) rotateX(6deg)',
        filter: 'drop-shadow(4px 6px 3px rgba(61,90,53,0.2)) drop-shadow(8px 12px 16px rgba(61,90,53,0.1))',
      }}
    >
      {name}
    </span>
  </div>
);

const ContributorLogoTile = ({ src, alt, title }: { src: string; alt: string; title: string }) => {
  const [hasError, setHasError] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="w-[110px] h-[110px] flex items-center justify-center"
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hasError ? (
        <span className="font-label text-[10px] uppercase tracking-[0.14em] text-[#453a2a]/60 text-center">
          {alt}
        </span>
      ) : (
        <img
          src={src}
          alt={alt}
          title={title}
          className="max-w-full max-h-full object-contain"
          style={{
            opacity: hovered ? 1 : 0.65,
            filter: hovered
              ? 'grayscale(0) sepia(0) hue-rotate(360deg) saturate(1) brightness(1) contrast(1)'
              : 'grayscale(1) sepia(0.45) hue-rotate(330deg) saturate(0.55) brightness(0.82) contrast(0.95)',
            transition: 'filter 0.35s ease, opacity 0.35s ease',
          }}
          loading="lazy"
          onError={() => setHasError(true)}
        />
      )}
    </div>
  );
};

const HomePage = () => {
  const [activeTab, setActiveTab] = useState<TabId>('ai-models');
  const [featureProgress, setFeatureProgress] = useState(0);
  const [showDemoModal, setShowDemoModal] = useState(false);

  const sectionRef = useRef<HTMLElement>(null);
  const tabProgressRef = useRef<Record<TabId, number>>({ 'ai-models': 0, dashboard: 0, repository: 0 });
  const tabVisitedRef = useRef<Record<TabId, boolean>>({ 'ai-models': true, dashboard: false, repository: false });
  const activeTabRef = useRef<TabId>('ai-models');
  activeTabRef.current = activeTab;

const videoRefs = useRef<(HTMLVideoElement | null)[]>(new Array(DEMO_STEPS.length).fill(null));
const videoContainerRef = useRef<HTMLDivElement>(null);
const [currentStep, setCurrentStep] = useState(0);
const [stepProgress, setStepProgress] = useState(0);
const [isVideoPlaying, setIsVideoPlaying] = useState(false);
const [videoReady, setVideoReady] = useState(false);
const [hasStarted, setHasStarted] = useState(false);
const [isMuted, setIsMuted] = useState(false);
const [isCompleted, setIsCompleted] = useState(false);

  const getProgress = useCallback(() => {
    const section = sectionRef.current;
    if (!section) return 0;

    const rect = section.getBoundingClientRect();
    const scrolled = 70 - rect.top;
    const maxScroll = rect.height - window.innerHeight;

    if (maxScroll <= 0) return 0;

    return Math.max(0, Math.min(1, scrolled / maxScroll));
  }, []);

  const scrollToProgress = useCallback((progress: number) => {
    const section = sectionRef.current;
    if (!section) return;

    const sectionTop = section.getBoundingClientRect().top + (window.scrollY || window.pageYOffset);
    const maxScroll = section.offsetHeight - window.innerHeight;
    const targetY = sectionTop - 70 + progress * maxScroll;
    window.scrollTo(0, Math.max(0, targetY));
  }, []);

  useEffect(() => {
    const onScroll = () => setFeatureProgress(getProgress());

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => window.removeEventListener('scroll', onScroll);
  }, [getProgress]);

  useEffect(() => {
    const revealedSet = new WeakSet<Element>();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const element = entry.target as HTMLElement;

        if (entry.isIntersecting) {
          const isFirst = !revealedSet.has(element);
          const delay = isFirst ? parseInt(element.dataset.delay || '0', 10) : 80;

          setTimeout(() => {
            element.classList.add('visible');
            const glow = element.querySelector('[class*="pipe-glow"]') as HTMLElement | null;
            if (glow) glow.classList.add('visible');

            if (isFirst) {
              revealedSet.add(element);
              if (element.classList.contains('pipe-stage')) {
                setTimeout(() => element.classList.add('pipe-float'), 900);
              }
            } else if (element.classList.contains('pipe-stage')) {
              setTimeout(() => element.classList.add('pipe-float'), 400);
            }
          }, delay);
        } else {
          element.classList.remove('visible', 'pipe-float');
          const glow = element.querySelector('[class*="pipe-glow"]') as HTMLElement | null;
          if (glow) glow.classList.remove('visible');
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

    document.querySelectorAll('.pipe-stage, .pipeline-reveal, .demo-section-reveal, .demo-timeline-reveal, .grant-label-reveal, .grant-slide-left, .grant-slide-right').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

// Eagerly preload all videos on page mount (no autoplay)
useEffect(() => {
  DEMO_STEPS.forEach((step, i) => {
    const v = videoRefs.current[i];
    if (v) {
      v.src = step.src;
      v.load();
    }
  });
}, []);

// Fade in video container once first video can display a frame
useEffect(() => {
  const firstVideo = videoRefs.current[0];
  if (!firstVideo) return;

  const reveal = () => setVideoReady(true);

  // If already has enough data, reveal immediately
  if (firstVideo.readyState >= 2) {
    reveal();
    return;
  }

  firstVideo.addEventListener('canplay', reveal, { once: true });

  // Fallback: fade in after 2s no matter what
  const fallbackTimer = setTimeout(reveal, 2000);

  return () => {
    firstVideo.removeEventListener('canplay', reveal);
    clearTimeout(fallbackTimer);
  };
}, []);

// Pause video when user scrolls away
useEffect(() => {
  const container = videoContainerRef.current;
  if (!container) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting && isVideoPlaying) {
        const video = videoRefs.current[currentStep];
        if (video) {
          video.pause();
          setIsVideoPlaying(false);
        }
      }
    },
    { threshold: 0.3 }
  );

  observer.observe(container);
  return () => observer.disconnect();
}, [currentStep, isVideoPlaying]);

// Track progress + auto-advance on video end
useEffect(() => {
  const video = videoRefs.current[currentStep];
  if (!video) return;

  const onTimeUpdate = () => {
    const d = video.duration;
    if (!d || !isFinite(d)) return;
    setStepProgress(video.currentTime / d);
  };

const onEnded = () => {
  video.pause();

  // Last step — show replay overlay instead of looping
  if (currentStep === DEMO_STEPS.length - 1) {
    setIsVideoPlaying(false);
    setStepProgress(1);
    setIsCompleted(true);
    return;
  }

  // Not last step — advance to next
  const next = currentStep + 1;
  setCurrentStep(next);
  setStepProgress(0);
  const nextVideo = videoRefs.current[next];
  if (nextVideo) {
    nextVideo.currentTime = 0;
    nextVideo.muted = false;
    nextVideo.play().catch(() => {});
    setIsVideoPlaying(true);
  }
};

  video.addEventListener('timeupdate', onTimeUpdate);
  video.addEventListener('ended', onEnded);
  return () => {
    video.removeEventListener('timeupdate', onTimeUpdate);
    video.removeEventListener('ended', onEnded);
  };
}, [currentStep]);

  const handleTabSwitch = (tab: TabId) => {
    const targetProgress = tabVisitedRef.current[tab] ? tabProgressRef.current[tab] : 0;
    tabProgressRef.current[activeTabRef.current] = getProgress();
    tabVisitedRef.current[tab] = true;
    setFeatureProgress(targetProgress);
    setActiveTab(tab);

    requestAnimationFrame(() => {
      scrollToProgress(targetProgress);
    });
  };

const handleStepClick = (stepIndex: number) => {
  if (isCompleted) setIsCompleted(false);
  if (stepIndex === currentStep && !isCompleted) return;
  const currentVideo = videoRefs.current[currentStep];
  if (currentVideo) currentVideo.pause();

  setCurrentStep(stepIndex);
  setStepProgress(0);

  const nextVideo = videoRefs.current[stepIndex];
  if (nextVideo) {
    nextVideo.currentTime = 0;
    if (hasStarted) {
      // Only auto-play next step if user has already started watching
      nextVideo.muted = false;
      nextVideo.play().catch(() => {});
      setIsVideoPlaying(true);
    }
  }
};

const handleVideoToggle = () => {
  const video = videoRefs.current[currentStep];
  if (!video) return;

  if (!hasStarted) {
    // First play — start from beginning, unmuted
    video.currentTime = 0;
    video.muted = false;
    setIsMuted(false);
    video.play().catch(() => {});
    setHasStarted(true);
    setIsVideoPlaying(true);
    return;
  }

  if (isVideoPlaying) {
    video.pause();
    setIsVideoPlaying(false);
  } else {
    video.play().catch(() => {});
    setIsVideoPlaying(true);
  }
};

const handleMuteToggle = (e: React.MouseEvent) => {
  e.stopPropagation(); // Don't trigger play/pause
  const video = videoRefs.current[currentStep];
  if (!video) return;
  video.muted = !video.muted;
  setIsMuted(video.muted);
};

  const handleReplay = () => {
  setIsCompleted(false);
  setCurrentStep(0);
  setStepProgress(0);

  // Pause current video (last step) just in case
  const lastVideo = videoRefs.current[DEMO_STEPS.length - 1];
  if (lastVideo) lastVideo.pause();

  // Start from step 1
  const firstVideo = videoRefs.current[0];
  if (firstVideo) {
    firstVideo.currentTime = 0;
    firstVideo.muted = isMuted;
    firstVideo.play().catch(() => {});
    setIsVideoPlaying(true);
  }

  videoContainerRef.current?.focus();
};

  const aiCard1Visible = activeTab === 'ai-models' && featureProgress > 0.15;
  const aiCard2Visible = activeTab === 'ai-models' && featureProgress > 0.4;
  const aiDemoVisible = activeTab === 'ai-models' && featureProgress > 0.55;
  const dashboardCtaVisible = activeTab === 'dashboard' && featureProgress >= 0.65;
  const repositoryCtaVisible = activeTab === 'repository' && featureProgress >= 0.5;

  const isDashboardZoneVisible = (index: number) =>
    activeTab === 'dashboard' && (index === 0 || featureProgress >= DASH_ZONE_THRESHOLDS[index]);

  const isRepositoryLayerVisible = (index: number) =>
    activeTab === 'repository' && (index === 0 || featureProgress >= REPO_THRESHOLDS[index]);

  return (
    <div style={{ fontFamily: "'Work Sans', sans-serif", background: '#fff8f0', color: '#1e1b15' }} className="antialiased">
      <style>{`
        .font-headline { font-family: 'Newsreader', serif; }
        .font-body { font-family: 'Work Sans', sans-serif; }
        .font-label { font-family: 'Work Sans', sans-serif; }

        .word-carousel {
          display: inline-flex;
          flex-direction: column;
          height: 1.1em;
          overflow: hidden;
          vertical-align: top;
          position: relative;
        }
        .word-item {
          position: absolute;
          left: 0;
          width: 100%;
          opacity: 0;
          transform: translateY(100%);
          animation: word-cycle 9s infinite;
        }
        .word-item:nth-child(1) { animation-delay: 0s; }
        .word-item:nth-child(2) { animation-delay: 3s; }
        .word-item:nth-child(3) { animation-delay: 6s; }
        @keyframes word-cycle {
          0% { opacity: 0; transform: translateY(100%); }
          5% { opacity: 1; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(0); }
          35% { opacity: 0; transform: translateY(-100%); }
          100% { opacity: 0; transform: translateY(-100%); }
        }

        #features-pinned {
          position: sticky;
          top: 70px;
          height: calc(100vh - 70px);
          overflow: hidden;
          background: #fff8f0;
          z-index: 10;
        }
        #features-header-inner {
          padding: 32px 2rem 20px;
          text-align: center;
          background: #fff8f0;
          position: relative;
          z-index: 5;
        }
        .card-stack-area {
          position: relative;
          max-width: 64rem;
          margin: 0 auto;
          padding: 12px 2rem 70px;
        }
        .feature-card {
          background-color: #f4ede3;
          border: 1px solid rgba(61,90,53,0.1);
          box-shadow: 0 -4px 20px rgba(0,0,0,0.06), 0 20px 40px rgba(0,0,0,0.08);
        }
        .feature-card.is-stacked {
          position: absolute;
          left: 2rem;
          right: 2rem;
          transform: translateY(calc(100vh));
          transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .feature-card.is-stacked.revealed {
          transform: translateY(0);
        }
        .card-title-bar {
          height: 50px;
          min-height: 50px;
          max-height: 50px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 0 24px;
          border-bottom: 1px solid rgba(61,90,53,0.06);
          background-color: #f4ede3;
        }
        .card-body {
          padding: 10px 24px 16px;
          background-color: #f4ede3;
        }
        @media (min-width: 768px) {
          .card-title-bar { padding: 0 48px; }
          .card-body { padding: 12px 48px 18px; }
          #features-header-inner { padding: 40px 2rem 20px; }
        }
        @media (max-height: 800px) {
          #features-header-inner { padding: 16px 2rem 10px; }
          .card-title-bar { height: 42px; min-height: 42px; max-height: 42px; }
          .card-body { padding: 8px 24px 12px; }
        }
        @media (max-height: 800px) and (min-width: 768px) {
          .card-body { padding: 8px 48px 12px; }
        }
        @media (max-height: 700px) {
          #features-header-inner { padding: 10px 2rem 8px; }
          .card-body { font-size: 0.8rem; }
        }

        .dash-container {
          max-width: 72rem;
          margin: 0 auto;
          padding: 8px 2rem 0;
          overflow: visible;
        }
        @keyframes dash-hover-float {
          0%, 100% { transform: perspective(1400px) rotateX(2deg) rotateY(-1.5deg) translateY(0); }
          50% { transform: perspective(1400px) rotateX(2deg) rotateY(-1.5deg) translateY(-8px); }
        }
        .dash-wireframe {
          position: relative;
          width: 100%;
          max-width: 660px;
          margin-left: auto;
          margin-right: auto;
          overflow: visible;
          background: #f4ede3;
          border: 1px solid rgba(61,90,53,0.08);
          box-shadow: 0 30px 80px rgba(0,0,0,0.10), 0 12px 28px rgba(0,0,0,0.06), 0 0 0 1px rgba(61,90,53,0.04);
          padding: 20px;
          animation: dash-hover-float 5s ease-in-out infinite;
          transform-style: preserve-3d;
        }
        .dash-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 12px;
          margin-bottom: 12px;
          border-bottom: 1px solid rgba(61,90,53,0.08);
        }
        .dash-topbar-title {
          font-family: 'Newsreader', serif;
          font-size: 0.9rem;
          color: #453a2a;
          font-style: italic;
        }
        .dash-filters { display: flex; gap: 6px; }
        .dash-filter-pill {
          font-size: 7px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #73796f;
          border: 1px solid rgba(61,90,53,0.1);
          padding: 2px 8px;
          background: rgba(255,248,240,0.5);
        }
        .dash-main-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 240px;
          grid-template-rows: auto auto;
          gap: 10px;
        }
        .dash-zone {
          position: relative;
          border: 2px dashed rgba(61,90,53,0.1);
          background: rgba(255,248,240,0.4);
          padding: 14px;
          transition: all 0.7s cubic-bezier(0.22,1,0.36,1);
          opacity: 0.25;
          transform: scale(0.98);
        }
        .dash-zone.active {
          border-color: rgba(61,90,53,0.35);
          background: rgba(61,90,53,0.03);
          box-shadow: 0 0 20px rgba(61,90,53,0.06);
          opacity: 1;
          transform: scale(1);
        }
        .dash-zone-log {
          grid-column: 3;
          grid-row: 1 / 3;
        }
        .dash-zone-trend { grid-column: 1 / 3; }
        .dash-zone-callout { display: none !important; }
        .skel-label {
          font-size: 7px;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: rgba(61,90,53,0.35);
          font-weight: 600;
          margin-bottom: 2px;
        }
        .skel-title {
          font-family: 'Newsreader', serif;
          font-size: 0.85rem;
          color: #453a2a;
          margin-bottom: 8px;
          opacity: 0;
          transform: translateY(6px);
          transition: all 0.5s ease 0.15s;
        }
        .dash-zone.active .skel-title {
          opacity: 1;
          transform: translateY(0);
        }
        .skel-score-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }
        .skel-score-num {
          font-family: 'Newsreader', serif;
          font-size: 1.8rem;
          color: #453a2a;
          font-weight: 300;
          opacity: 0;
          transition: opacity 0.5s ease 0.2s;
        }
        .dash-zone.active .skel-score-num { opacity: 0.3; }
        .skel-gauge {
          flex: 1;
          height: 5px;
          background: rgba(61,90,53,0.08);
          border-radius: 3px;
          overflow: hidden;
        }
        .skel-gauge-fill {
          width: 0;
          height: 100%;
          background: #3D5A35;
          border-radius: 3px;
          transition: width 1s cubic-bezier(0.22,1,0.36,1) 0.3s;
        }
        .skel-stats {
          display: flex;
          gap: 8px;
          opacity: 0;
          transition: opacity 0.5s ease 0.35s;
        }
        .dash-zone.active .skel-stats { opacity: 1; }
        .skel-stat-box {
          flex: 1;
          background: rgba(255,248,240,0.6);
          border: 1px solid rgba(61,90,53,0.06);
          padding: 6px;
          text-align: center;
        }
        .skel-stat-sm {
          font-size: 6px;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          color: rgba(61,90,53,0.4);
          font-weight: 600;
          display: block;
          margin-bottom: 1px;
        }
        .skel-stat-lg {
          font-family: 'Newsreader', serif;
          font-size: 1.2rem;
          color: #453a2a;
          opacity: 0.2;
        }
        .skel-bar-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 7px;
        }
        .skel-bar-lbl {
          font-size: 0.65rem;
          color: #434840;
          width: 56px;
          text-align: right;
          opacity: 0;
          transition: opacity 0.4s ease;
        }
        .dash-zone.active .skel-bar-lbl { opacity: 0.6; }
        .skel-bar-track {
          flex: 1;
          height: 4px;
          background: rgba(61,90,53,0.06);
          border-radius: 2px;
          overflow: hidden;
          position: relative;
        }
        .skel-bar-fill {
          height: 100%;
          background: rgba(61,90,53,0.3);
          border-radius: 2px;
          width: 0;
          transition: width 0.8s cubic-bezier(0.22,1,0.36,1) 0.2s;
        }
        .skel-bar-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #3D5A35;
          opacity: 0;
          transition: opacity 0.5s ease 0.4s;
          flex-shrink: 0;
        }
        .dash-zone.active .skel-bar-dot { opacity: 0.4; }
        .skel-tbl-head {
          display: grid;
          grid-template-columns: 1fr 48px 32px 40px;
          gap: 4px;
          padding-bottom: 5px;
          border-bottom: 1px solid rgba(61,90,53,0.08);
          margin-bottom: 4px;
        }
        .skel-th {
          font-size: 6px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: rgba(61,90,53,0.3);
          font-weight: 600;
        }
        .skel-tbl-row {
          display: grid;
          grid-template-columns: 1fr 48px 32px 40px;
          gap: 4px;
          padding: 5px 0;
          border-bottom: 1px solid rgba(61,90,53,0.04);
          opacity: 0;
          transform: translateX(8px);
          transition: all 0.4s ease;
        }
        .dash-zone.active .skel-tbl-row { opacity: 1; transform: translateX(0); }
        .dash-zone.active .skel-tbl-row:nth-child(3) { transition-delay: 0.1s; }
        .dash-zone.active .skel-tbl-row:nth-child(4) { transition-delay: 0.15s; }
        .dash-zone.active .skel-tbl-row:nth-child(5) { transition-delay: 0.2s; }
        .dash-zone.active .skel-tbl-row:nth-child(6) { transition-delay: 0.25s; }
        .skel-line {
          height: 7px;
          background: rgba(61,90,53,0.07);
          border-radius: 4px;
        }
        .skel-tag {
          display: inline-block;
          height: 10px;
          width: 30px;
          background: rgba(61,90,53,0.06);
          border-radius: 5px;
          margin-right: 2px;
          margin-top: 2px;
        }
        .skel-asset {
          width: 12px;
          height: 12px;
          border-radius: 2px;
          background: rgba(61,90,53,0.06);
          display: inline-block;
          margin-left: 2px;
        }
        .skel-chart-area {
          position: relative;
          height: 70px;
          margin: 6px 0;
          opacity: 0;
          transition: opacity 0.6s ease 0.2s;
        }
        .dash-zone.active .skel-chart-area { opacity: 1; }
        .skel-chart-ctrls {
          display: flex;
          gap: 5px;
          opacity: 0;
          transition: opacity 0.5s ease 0.4s;
        }
        .dash-zone.active .skel-chart-ctrls { opacity: 1; }
        .skel-pill {
          font-size: 7px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding: 3px 8px;
          border: 1px solid rgba(61,90,53,0.12);
          color: #73796f;
          background: rgba(255,248,240,0.5);
        }
        .skel-pill-on {
          background: #3D5A35;
          color: #fff;
          border-color: #3D5A35;
        }
        .dash-cta-wrap {
          text-align: center;
          margin-top: 14px;
          opacity: 0;
          transform: translateY(6px);
          transition: all 0.5s ease 0.5s;
        }
        .dash-cta-wrap.visible {
          opacity: 1;
          transform: translateY(0);
        }

        .repo-container {
          max-width: 72rem;
          margin: 0 auto;
          padding: 16px 2rem 0;
        }
        .pyramid-stack {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 24px 0 0;
        }
        .pyramid-tier {
          position: relative;
          display: flex;
          justify-content: center;
          width: 100%;
          margin-top: 6px;
        }
        .pyramid-tier:first-child { margin-top: 0; }
        .repo-slab {
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          opacity: 0;
          transform: translateY(-140px) scale(0.88);
          transition: all 0.7s cubic-bezier(0.34, 1.56, 0.64, 1);
          position: relative;
        }
        .repo-slab.landed {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        .repo-slab .slab-icon { color: rgba(255,255,255,0.8); }
        .repo-slab .slab-label {
          font-family: 'Newsreader', serif;
          font-size: 0.95rem;
          color: rgba(255,255,255,0.88);
          letter-spacing: 0.03em;
        }
        .repo-slab-0 {
          width: 480px;
          height: 84px;
          background: linear-gradient(135deg, #3a3020 0%, #57493a 60%, #63563f 100%);
          box-shadow: 0 14px 44px rgba(0,0,0,0.16), 0 4px 12px rgba(0,0,0,0.08), 0 -1px 0 rgba(255,255,255,0.06) inset;
          z-index: 1;
        }
        .repo-slab-1 {
          width: 370px;
          height: 76px;
          background: linear-gradient(135deg, #5c5040 0%, #7a6d5e 60%, #857868 100%);
          box-shadow: 0 10px 36px rgba(0,0,0,0.14), 0 3px 10px rgba(0,0,0,0.06), 0 -1px 0 rgba(255,255,255,0.06) inset;
          z-index: 2;
        }
        .repo-slab-2 {
          width: 260px;
          height: 68px;
          background: linear-gradient(135deg, #2f4d28 0%, #4d6d44 60%, #5a7d50 100%);
          box-shadow: 0 8px 28px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.05), 0 -1px 0 rgba(255,255,255,0.08) inset;
          z-index: 3;
        }
        .pyramid-ground {
          width: 420px;
          height: 6px;
          margin-top: 4px;
          background: radial-gradient(ellipse at center, rgba(0,0,0,0.12) 0%, transparent 70%);
          border-radius: 50%;
        }
        .tier-callout {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          align-items: center;
          gap: 10px;
          opacity: 0;
          transition: all 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.25s;
          white-space: nowrap;
          pointer-events: none;
        }
        .tier-callout-right { left: calc(50% + 258px); }
        .tier-callout-left {
          right: calc(50% + 203px);
          flex-direction: row-reverse;
          text-align: right;
        }
        .tier-callout.visible { opacity: 1; }
        .callout-connector { width: 28px; height: 2px; flex-shrink: 0; }
        .callout-body .callout-num {
          font-family: 'Work Sans', sans-serif;
          font-size: 8px;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          font-weight: 600;
          margin-bottom: 2px;
          display: block;
        }
        .callout-body .callout-title {
          font-family: 'Newsreader', serif;
          font-size: 1.05rem;
          color: #453a2a;
        }
        .callout-body .callout-desc {
          font-family: 'Work Sans', sans-serif;
          font-size: 0.72rem;
          color: #434840;
          line-height: 1.45;
          white-space: normal;
          max-width: 180px;
        }
        .repo-cta-wrap {
          text-align: center;
          margin-top: 32px;
          opacity: 0;
          transform: translateY(10px);
          transition: all 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.3s;
        }
        .repo-cta-wrap.visible {
          opacity: 1;
          transform: translateY(0);
        }

        @keyframes scroll-left {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .carousel-track {
          display: flex;
          gap: 32px;
          animation: scroll-left 25s linear infinite;
          width: max-content;
          will-change: transform;
        }
        .carousel-mask {
          mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent);
          -webkit-mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent);
        }

        .pipe-stage {
          opacity: 0;
          transform: translateY(28px);
          transition: all 0.8s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .pipe-stage.visible { opacity: 1; transform: translateY(0); }
        .pipeline-reveal {
          opacity: 0;
          transform: translateY(28px);
          transition: all 0.8s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .pipeline-reveal.visible { opacity: 1; transform: translateY(0); }
        .grant-logo-link {
          display: flex;
          align-items: center;
          transition: transform 0.35s ease;
        }
        .grant-logo-link:hover {
          transform: translateY(-2px);
        }
        .grant-slide-left {
          opacity: 0;
          transform: translateX(-32px);
          transition: opacity 0.8s cubic-bezier(0.22, 1, 0.36, 1), transform 0.8s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .grant-slide-left.visible { opacity: 1; transform: translateX(0); }
        .grant-slide-right {
          opacity: 0;
          transform: translateX(32px);
          transition: opacity 0.8s cubic-bezier(0.22, 1, 0.36, 1), transform 0.8s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .grant-slide-right.visible { opacity: 1; transform: translateX(0); }
        .grant-label-reveal {
          opacity: 0;
          transform: translateY(12px);
          transition: opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1), transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .grant-label-reveal.visible { opacity: 1; transform: translateY(0); }

        @keyframes grant-logo-breathe {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 1; }
        }
        .grant-logo-pulse-1 {
          animation: grant-logo-breathe 3s ease-in-out infinite;
        }
        .grant-logo-pulse-2 {
          animation: grant-logo-breathe 3s ease-in-out infinite;
          animation-delay: 1.5s;
        }
        .pipe-glow-brown { box-shadow: 0 0 0 0 rgba(69,58,42,0); transition: box-shadow 0.8s ease; }
        .pipe-glow-brown.visible { box-shadow: 0 0 24px 6px rgba(69,58,42,0.1), 0 0 8px 2px rgba(69,58,42,0.06); }
        .pipe-glow-bridge { box-shadow: 0 0 0 0 rgba(105,92,77,0); transition: box-shadow 0.8s ease; }
        .pipe-glow-bridge.visible { box-shadow: 0 0 24px 6px rgba(105,92,77,0.1), 0 0 8px 2px rgba(105,92,77,0.06); }
        .pipe-glow-green { box-shadow: 0 0 0 0 rgba(61,90,53,0); transition: box-shadow 0.8s ease; }
        .pipe-glow-green.visible { box-shadow: 0 0 24px 6px rgba(61,90,53,0.12), 0 0 8px 2px rgba(61,90,53,0.06); }
        @keyframes pipe-flow {
          0% { left: -6px; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { left: calc(100% + 6px); opacity: 0; }
        }
        .pipe-flow-dot { animation: pipe-flow 2.5s linear infinite; }
        @keyframes pulse-ring {
          0% { box-shadow: 0 0 0 0 rgba(61,90,53,0.2); }
          70% { box-shadow: 0 0 0 12px rgba(61,90,53,0); }
          100% { box-shadow: 0 0 0 0 rgba(61,90,53,0); }
        }
        .pipe-pulse { animation: pulse-ring 2.5s ease infinite; }
        .loop-banner {
          background: linear-gradient(90deg, transparent, rgba(61,90,53,0.06) 15%, rgba(61,90,53,0.1) 50%, rgba(61,90,53,0.06) 85%, transparent);
          padding: 20px 0;
        }
        @keyframes gentle-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        .pipe-float { animation: gentle-float 3.5s ease-in-out infinite; }
        .spectrum-card {
          padding: 28px 24px;
          position: relative;
          transition: transform 0.4s ease, box-shadow 0.4s ease, opacity 0.4s ease;
        }
        .spectrum-center {
          transform: scale(1.04);
          box-shadow: 0 8px 40px rgba(61,90,53,0.12), 0 0 0 2px rgba(61,90,53,0.15);
          z-index: 2;
        }
        .spectrum-side { opacity: 0.8; }
        .spectrum-side:hover { opacity: 1; transform: scale(1.01); }
        .spectrum-row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 14px;
        }
        .spectrum-row:last-child { margin-bottom: 0; }
        .version-badge {
          position: fixed;
          bottom: 10px;
          right: 10px;
          z-index: 9999;
          background: #3D5A35;
          color: white;
          padding: 4px 10px;
          font-size: 11px;
          font-family: monospace;
          border-radius: 4px;
          opacity: 0.7;
        }
        .material-symbols-outlined {
          font-family: 'Material Symbols Outlined';
          font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;
        }

        /* ============================================
   INTERACTIVE DEMO VIDEO SECTION
   ============================================ */

.demo-video-section {
  position: relative;
  width: 100%;
}

.demo-video-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid rgba(61, 90, 53, 0.1);
  background: #f4ede3;
  box-shadow:
    0 30px 80px rgba(0, 0, 0, 0.08),
    0 12px 28px rgba(0, 0, 0, 0.05),
    0 0 0 1px rgba(61, 90, 53, 0.04);
  transform-style: preserve-3d;
  animation: demo-video-float 5s ease-in-out infinite;
  transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.6s ease, opacity 0.6s ease;
  /* Fade-in (loaded class) */
  opacity: 0;
}

.demo-video {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: #f4ede3;
  border-radius: 4px;
  transform: scale(1.02);
}

/* Placeholder state */
.demo-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f4ede3 0%, #ece5da 100%);
}

.demo-placeholder-icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 1px solid rgba(61, 90, 53, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 248, 240, 0.8);
  transition: transform 0.5s ease, box-shadow 0.5s ease;
}

.demo-placeholder-icon:hover {
  transform: scale(1.06);
  box-shadow: 0 0 24px rgba(61, 90, 53, 0.1);
}

/* Ambient glow */
.demo-ambient-glow {
  position: absolute;
  inset: -2px;
  border-radius: 6px;
  pointer-events: none;
  z-index: -1;
  opacity: 0;
  transition: opacity 1s ease;
  box-shadow:
    0 0 40px 8px rgba(61, 90, 53, 0.06),
    0 0 16px 4px rgba(61, 90, 53, 0.04);
}

.demo-ambient-glow.playing {
  opacity: 1;
  animation: demo-glow-pulse 4s ease-in-out infinite;
}

@keyframes demo-glow-pulse {
  0%, 100% { box-shadow: 0 0 40px 8px rgba(61,90,53,0.06), 0 0 16px 4px rgba(61,90,53,0.04); }
  50% { box-shadow: 0 0 56px 12px rgba(61,90,53,0.1), 0 0 24px 6px rgba(61,90,53,0.06); }
}

/* ---- STEP TIMELINE ---- */

.demo-timeline {
  position: relative;
  margin-top: 28px;
  padding: 0 12px;
}

.demo-connector {
  flex: 1;
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 6px;
}

.demo-connector-line {
  width: 100%;
  height: 1.5px;
  border-radius: 1px;
  background: rgba(61, 90, 53, 0.08);
  position: relative;
  overflow: hidden;
}

.demo-connector-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  background: linear-gradient(90deg, rgba(61, 90, 53, 0.35), rgba(61, 90, 53, 0.1));
  border-radius: 1px;
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.8s cubic-bezier(0.22, 1, 0.36, 1);
}

.demo-connector-done .demo-connector-fill {
  transform: scaleX(1);
}

.demo-steps {
  display: flex;
  align-items: flex-start;
  position: relative;
  z-index: 1;
}

.demo-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  min-width: 64px;
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.demo-step:hover {
  transform: translateY(-2px);
}

.demo-step-dot {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  flex-shrink: 0;
}

/* Active step */
.demo-step-active .demo-step-dot {
  background: #3D5A35;
  color: #fff;
  transform: scale(1.1);
  box-shadow: 0 0 20px rgba(61, 90, 53, 0.2);
}

.demo-step-active .demo-step-label {
  color: #3D5A35;
  opacity: 1;
  font-weight: 600;
}

/* Completed step */
.demo-step-done .demo-step-dot {
  background: rgba(61, 90, 53, 0.12);
  color: #3D5A35;
}

.demo-step-done .demo-step-label {
  color: #3D5A35;
  opacity: 0.6;
}

/* Upcoming step */
.demo-step-upcoming .demo-step-dot {
  background: rgba(61, 90, 53, 0.05);
  color: rgba(61, 90, 53, 0.3);
  border: 1px solid rgba(61, 90, 53, 0.1);
}

.demo-step-upcoming .demo-step-label {
  color: #453a2a;
  opacity: 0.35;
}

.demo-step-upcoming:hover .demo-step-dot {
  background: rgba(61, 90, 53, 0.08);
  color: rgba(61, 90, 53, 0.5);
}

.demo-step-upcoming:hover .demo-step-label {
  opacity: 0.6;
}

.demo-step-label {
  font-family: 'Work Sans', sans-serif;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  transition: all 0.3s ease;
  white-space: nowrap;
}

/* Per-step micro progress bar */
.demo-step-micro {
  width: 32px;
  height: 2px;
  background: rgba(61, 90, 53, 0.1);
  border-radius: 1px;
  overflow: hidden;
}

.demo-step-micro-fill {
  height: 100%;
  background: #3D5A35;
  border-radius: 1px;
  transition: width 0.3s ease;
}

/* Active step pulse */
@keyframes pulse-ring-demo {
  0% { box-shadow: 0 0 0 0 rgba(61, 90, 53, 0.25); }
  70% { box-shadow: 0 0 0 10px rgba(61, 90, 53, 0); }
  100% { box-shadow: 0 0 0 0 rgba(61, 90, 53, 0); }
}

.pulse-ring-demo {
  animation: pulse-ring-demo 2.5s ease infinite;
}

/* ---- MOBILE ---- */

@media (max-width: 640px) {
  .demo-steps {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    gap: 4px;
    padding-bottom: 4px;
    scrollbar-width: none;
  }

  .demo-steps::-webkit-scrollbar {
    display: none;
  }

  .demo-step {
    min-width: 56px;
  }

  .demo-step-dot {
    width: 30px;
    height: 30px;
  }

  .demo-step-dot .material-symbols-outlined {
    font-size: 14px !important;
  }

  .demo-step-label {
    font-size: 7px;
    letter-spacing: 0.1em;
  }

  .demo-connector {
  min-width: 16px;
  padding: 0 2px;
  height: 30px;
}

  .demo-timeline {
    margin-top: 20px;
    padding: 0 4px;
  }
}

@media (max-width: 380px) {
  .demo-step-label {
    display: none;
  }

  .demo-step {
    min-width: 44px;
  }
}

.demo-video-wrap.loaded {
  opacity: 1;
}

/* ---- PLAY / PAUSE OVERLAY ---- */

.demo-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  cursor: pointer;
  transition: opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

.demo-overlay-hidden {
  opacity: 0;
  pointer-events: none;
}

/* Frosted glass backdrop */
.demo-overlay-glass {
  position: absolute;
  inset: 0;
  background: rgba(244, 237, 227, 0.55);
  backdrop-filter: blur(12px) saturate(1.4);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  border-radius: 4px;
}

/* Play / pause icon circle */
.demo-overlay-btn {
  position: relative;
  z-index: 1;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(61, 90, 53, 0.08);
  border: 1.5px solid rgba(61, 90, 53, 0.18);
  transition: all 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  box-shadow: 0 4px 24px rgba(61, 90, 53, 0.08);
}

.demo-overlay:hover .demo-overlay-btn {
  background: #3D5A35;
  border-color: #3D5A35;
  transform: scale(1.06);
  box-shadow: 0 8px 32px rgba(61, 90, 53, 0.2);
}

.demo-overlay-btn .material-symbols-outlined {
  color: #3D5A35;
  transition: color 0.4s ease;
}

.demo-overlay:hover .demo-overlay-btn .material-symbols-outlined {
  color: #fff;
}

/* Helper text */
.demo-overlay-label {
  position: relative;
  z-index: 1;
  font-family: 'Work Sans', sans-serif;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: #453a2a;
  opacity: 0.5;
  font-weight: 500;
  transition: opacity 0.3s ease;
}

.demo-overlay:hover .demo-overlay-label {
  opacity: 0.8;
}

/* Pause overlay — slightly less blur, quicker fade */
.demo-overlay-pause .demo-overlay-glass {
  background: rgba(244, 237, 227, 0.35);
  backdrop-filter: blur(6px) saturate(1.2);
  -webkit-backdrop-filter: blur(6px) saturate(1.2);
}

.demo-overlay-pause .demo-overlay-btn {
  width: 56px;
  height: 56px;
  background: rgba(69, 58, 42, 0.06);
  border-color: rgba(69, 58, 42, 0.15);
}

.demo-overlay-pause:hover .demo-overlay-btn {
  background: #453a2a;
  border-color: #453a2a;
}

.demo-overlay-pause .demo-overlay-btn .material-symbols-outlined {
  color: #453a2a;
}

.demo-overlay-pause:hover .demo-overlay-btn .material-symbols-outlined {
  color: #fff;
}

/* ---- SECTION ENTRANCE ---- */

.demo-section-reveal {
  opacity: 0;
  transform: translateY(40px) scale(0.97);
  transition: all 1s cubic-bezier(0.22, 1, 0.36, 1);
}

.demo-section-reveal.visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}

/* Stagger the timeline entrance */
.demo-timeline-reveal {
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.3s;
}

.demo-timeline-reveal.visible {
  opacity: 1;
  transform: translateY(0);
}

/* ---- STICKY VIDEO SHOWCASE ---- */

.demo-sticky-wrapper {
  position: relative;
  /* Height = viewport + scroll-through distance */
  height: 102vh;
}

.demo-sticky-inner {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 0;
  z-index: 5;
}

/* ---- VIDEO DEPTH / PERSPECTIVE ---- */

@keyframes demo-video-float {
  0%, 100% {
    transform: perspective(1800px) rotateX(1.5deg) rotateY(-0.8deg) translateY(0);
  }
  50% {
    transform: perspective(1800px) rotateX(1.5deg) rotateY(-0.8deg) translateY(-6px);
  }
}


.demo-video-wrap:hover {
  animation: none;
  transform: perspective(1800px) rotateX(0deg) rotateY(0deg) translateY(-4px);
  box-shadow:
    0 40px 100px rgba(0, 0, 0, 0.12),
    0 16px 36px rgba(0, 0, 0, 0.08),
    0 0 0 1px rgba(61, 90, 53, 0.08);
}

/* ---- SOUND INDICATOR ---- */

.demo-sound-indicator {
  position: absolute;
  bottom: 12px;
  right: 12px;
  z-index: 6;
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.4s ease;
  background: transparent;
  border: none;
}

.demo-sound-indicator.active {
  opacity: 0.25;
}

.demo-sound-indicator:hover {
  opacity: 0.6;
  background: rgba(61, 90, 53, 0.06);
}

/* Equalizer bars */
.demo-eq-bar {
  width: 2px;
  background: #3D5A35;
  border-radius: 1px;
  transform-origin: bottom;
}

@keyframes eq-bar-1 {
  0%, 100% { height: 4px; }
  50% { height: 12px; }
}
@keyframes eq-bar-2 {
  0%, 100% { height: 8px; }
  50% { height: 4px; }
}
@keyframes eq-bar-3 {
  0%, 100% { height: 6px; }
  50% { height: 14px; }
}

.demo-eq-bar:nth-child(1) { animation: eq-bar-1 1.2s ease-in-out infinite; }
.demo-eq-bar:nth-child(2) { animation: eq-bar-2 1s ease-in-out infinite 0.15s; }
.demo-eq-bar:nth-child(3) { animation: eq-bar-3 1.4s ease-in-out infinite 0.3s; }

/* When muted — bars freeze at low height */
.demo-sound-indicator.muted .demo-eq-bar {
  animation: none;
  height: 3px;
  opacity: 0.4;
}

.demo-sound-indicator.muted {
  opacity: 0.15;
}

.demo-sound-indicator.muted:hover {
  opacity: 0.5;
}

/* ---- REPLAY OVERLAY ---- */

.demo-overlay-replay .demo-overlay-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #f4ede3 0%, #ece5da 50%, #f0e9df 100%);
  border-radius: 4px;
  z-index: 0;
}

.demo-overlay-replay .demo-overlay-glass {
  background: rgba(244, 237, 227, 0.65);
  backdrop-filter: blur(16px) saturate(1.5);
  -webkit-backdrop-filter: blur(16px) saturate(1.5);
}

.demo-overlay-replay .demo-overlay-btn {
  width: 72px;
  height: 72px;
  background: rgba(61, 90, 53, 0.08);
  border: 1.5px solid rgba(61, 90, 53, 0.18);
}

.demo-overlay-replay:hover .demo-overlay-btn {
  background: #3D5A35;
  border-color: #3D5A35;
  transform: scale(1.06);
  box-shadow: 0 8px 32px rgba(61, 90, 53, 0.2);
}

.demo-overlay-replay .demo-overlay-btn .material-symbols-outlined {
  color: #3D5A35;
}

.demo-overlay-replay:hover .demo-overlay-btn .material-symbols-outlined {
  color: #fff;
}

.demo-overlay-replay .demo-overlay-label {
  color: #453a2a;
  opacity: 0.55;
  font-size: 10px;
  letter-spacing: 0.2em;
}

.demo-overlay-replay:hover .demo-overlay-label {
  opacity: 0.85;
}

/* Breathing + ring for replay (matches Enhancement 6 style) */
.demo-overlay-replay .demo-overlay-btn {
  animation: demo-btn-breathe 3s ease-in-out infinite;
}

.demo-overlay-replay:hover .demo-overlay-btn {
  animation: none;
}

.demo-overlay-replay .demo-overlay-ring {
  width: 96px;
  height: 96px;
  border-color: rgba(61, 90, 53, 0.12);
}

.demo-overlay-replay:hover .demo-overlay-ring {
  border-color: rgba(61, 90, 53, 0.25);
}

    /* Nudge replay overlay content to true visual center */
.demo-overlay-replay {
  padding-bottom: 24px;
}

      `}</style>

      <header className="relative min-h-screen flex flex-col items-center justify-start overflow-hidden pt-40 pb-6">
        <div className="relative z-10 max-w-5xl px-8 text-center flex flex-col items-center">
          <h1 className="font-headline text-[#453a2a] leading-[1.05] tracking-tight mb-8" style={{ fontSize: 'clamp(2.5rem, 8vw, 6rem)' }}>
            Where case prep gets
            <br />
            <span className="word-carousel text-[#3D5A35] italic font-light w-full md:w-[480px]">
              <span className="word-item">precise.</span>
              <span className="word-item">sharper.</span>
              <span className="word-item">smarter.</span>
            </span>
          </h1>
          <p className="font-body text-lg text-[#6d6151] max-w-2xl mx-auto mb-10 leading-relaxed">
            AI-powered case practice, structured frameworks, and performance analytics: everything you need to crack your next case interview.
          </p>
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 mb-6">
            <Link
              href="/repository"
              className="inline-flex min-w-[220px] items-center justify-center whitespace-nowrap bg-[#3D5A35] px-8 py-4 text-xs uppercase tracking-[0.2em] text-white transition-all hover:bg-[#3D5A35]/90"
            >
              Browse Repository
            </Link>
            <Link
              href="/practice"
              className="inline-flex min-w-[220px] items-center justify-center border border-[#3D5A35] bg-transparent px-8 py-4 text-xs uppercase tracking-[0.2em] text-[#3D5A35] transition-all hover:bg-[#3D5A35] hover:text-white"
            >
              Do A Case
            </Link>
          </div>
<div className="demo-sticky-wrapper w-full">
  <div className="demo-sticky-inner">
    <div className="max-w-5xl w-full px-4 md:px-0">
      <div ref={videoContainerRef} className="demo-video-section" tabIndex={-1}>
    {/* Video container */}
   <div className={`demo-video-wrap demo-section-reveal ${videoReady ? 'loaded' : ''}`}>
  {DEMO_STEPS.map((step, index) => (
    <video
      key={step.id}
      ref={(el) => { videoRefs.current[index] = el; }}
      className="demo-video"
      muted
      playsInline
      preload="auto"
      style={{
        opacity: index === currentStep ? 1 : 0,
        zIndex: index === currentStep ? 1 : 0,
        pointerEvents: index === currentStep ? 'auto' : 'none',
        transition: 'opacity 0.12s ease',}}
      
    />
  ))}
  <div className={`demo-ambient-glow ${isVideoPlaying ? 'playing' : ''}`} />

  {/* Play overlay — shown before user starts */}
  {!hasStarted && (
    <div className="demo-overlay" onClick={handleVideoToggle}>
      <div className="demo-overlay-glass" />
      <div className="demo-overlay-btn">
        <span
          className="material-symbols-outlined"
          style= {{fontSize: '32px', fontVariationSettings: "'FILL' 1, 'wght' 400" }}
        >
          play_arrow
        </span>
      </div>
      <span className="demo-overlay-label">Click to play</span>
    </div>
  )}

  {/* Pause overlay — shown when video is paused after first play */}
  {hasStarted && !isVideoPlaying && (
    <div className="demo-overlay demo-overlay-pause" onClick={handleVideoToggle}>
      <div className="demo-overlay-glass" />
      <div className="demo-overlay-btn">
        <span
          className="material-symbols-outlined"
          style= {{fontSize: '28px', fontVariationSettings: "'FILL' 1, 'wght' 400" }}
        >
          play_arrow
        </span>
      </div>
      <span className="demo-overlay-label">Resume</span>
    </div>
  )}

  {/* Click-to-pause zone — invisible, covers video while playing */}
  {hasStarted && isVideoPlaying && (
    <div
      className="absolute inset-0 z-5 cursor-pointer"
      onClick={handleVideoToggle}
    />
  )}

     {/* Replay overlay — shown when all steps have finished */}
{isCompleted && (
  <div className="demo-overlay demo-overlay-replay" onClick={handleReplay}>
    <div className="demo-overlay-bg" />
    <div className="demo-overlay-glass" />
    <div className="demo-overlay-ring" />
    <div className="demo-overlay-btn">
      <span
        className="material-symbols-outlined"
        style= {{fontSize: '32px', fontVariationSettings: "'FILL' 1, 'wght' 400" }}
      >
        replay
      </span>
    </div>
    <span className="demo-overlay-label">Click to Replay</span>
  </div>
)}

  {/* Sound indicator — bottom right, barely visible */}
{hasStarted && (
  <button
    className={`demo-sound-indicator ${isVideoPlaying ? 'active' : ''} ${isMuted ? 'muted' : ''}`}
    onClick={handleMuteToggle}
    title={isMuted ? 'Unmute' : 'Mute'}
  >
    <div className="demo-eq-bar" />
    <div className="demo-eq-bar" />
    <div className="demo-eq-bar" />
  </button>
)}
</div>

    {/* Step Timeline Bar */}
<div className="demo-timeline demo-timeline-reveal">
  <div className="demo-steps">
    {DEMO_STEPS.map((step, index) => {
      const isActive = index === currentStep;
      const isCompleted = index < currentStep;
      const stepProg = isActive ? stepProgress : (isCompleted ? 1 : 0);

      return (
        <React.Fragment key={step.id}>
          {index > 0 && (
            <div className={`demo-connector ${index <= currentStep ? 'demo-connector-done' : ''}`}>
              <div className="demo-connector-line">
                <div className="demo-connector-fill" />
              </div>
            </div>
          )}
          <button
            className={`demo-step ${
              isActive ? 'demo-step-active' : isCompleted ? 'demo-step-done' : 'demo-step-upcoming'
            }`}
            onClick={() => handleStepClick(index)}
          >
            <div className={`demo-step-dot ${isActive ? 'pulse-ring-demo' : ''}`}>
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: '16px',
                  fontVariationSettings: isActive
                    ? "'FILL' 1, 'wght' 400"
                    : "'FILL' 0, 'wght' 300",}}
                
              >
                {isCompleted ? 'check_circle' : step.icon}
              </span>
            </div>
            <span className="demo-step-label">{step.label}</span>
            {isActive && (
              <div className="demo-step-micro">
                <div
                  className="demo-step-micro-fill"
                  style={{ width: `${stepProg * 100}%` }}
                />
              </div>
            )}
          </button>
        </React.Fragment>
      );
    })}
  </div>
</div>
        </div> {/* end demo-video-section */}
    </div> {/* end max-w-5xl */}
  </div> {/* end demo-sticky-inner */}
</div> {/* end demo-sticky-wrapper */}
        </div>
      </header>

      <section className="pt-6 pb-24 px-4 md:px-8 overflow-hidden">
        <div className="max-w-7xl mx-auto text-center mb-12">
          <h2 className="font-headline font-light text-[#453a2a] tracking-tight text-balance" style={{ fontSize: 'clamp(2rem, 5vw, 3.75rem)' }}>Contributors</h2>
        </div>
        <div className="carousel-mask w-full overflow-hidden">
          <div className="carousel-track">
            {[...CONTRIBUTOR_LOGOS, ...CONTRIBUTOR_LOGOS].map((logo, index) => (
              <div key={`${logo.alt}-${index}`} className="flex-shrink-0">
                <ContributorLogoTile src={logo.src} alt={logo.alt} title={logo.title} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pt-12 pb-28 px-4 md:px-8" style={{ position: 'relative' }}>
        <div className="max-w-7xl mx-auto flex flex-col items-center gap-5">
          <p className="grant-label-reveal font-label text-[9px] uppercase tracking-[0.35em] font-semibold" style={{ color: '#b0a898' }}>Supported by</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '40px', flexWrap: 'wrap' }}>
            <a href="https://www.cartesia.ai/startups/" target="_blank" rel="noopener noreferrer" className="grant-logo-link grant-slide-left grant-logo-pulse-1" data-delay="120">
              <img src="/grants/Cartesia_Startups_Logo.png" alt="Cartesia for Startups" style={{ width: '192px', height: 'auto', display: 'block' }} />
            </a>
            <div style={{ width: '1px', height: '24px', background: 'rgba(69,58,42,0.12)' }} />
            <a href="https://elevenlabs.io/startup-grants" target="_blank" rel="noopener noreferrer" className="grant-logo-link grant-slide-left grant-logo-pulse-2" data-delay="200">
              <img src="/grants/elevenlabs-grants.webp" alt="ElevenLabs Grants" style={{ width: '200px', height: 'auto', display: 'block' }} />
            </a>
            <div style={{ width: '1px', height: '24px', background: 'rgba(69,58,42,0.12)' }} />
            <a href="https://cloud.google.com/startup" target="_blank" rel="noopener noreferrer" className="grant-logo-link grant-slide-right grant-logo-pulse-1" data-delay="120" style={{ marginTop: '4px' }}>
              <img src="/grants/google-for-startups-new.png" alt="Google for Startups" style={{ width: '175px', height: 'auto', display: 'block' }} />
            </a>
          </div>
        </div>
      </section>

      <section ref={sectionRef} id="features-section" style={{ height: '220vh' }}>
        <div id="features-pinned" style={{ position: 'sticky', top: '70px', height: 'calc(100vh - 70px)', overflow: 'hidden', background: '#fff8f0', zIndex: 10 }}>
          <div id="features-header-inner">
            <h2 className="font-headline font-light text-[#453a2a] tracking-tight mb-3 text-balance" style={{ fontSize: 'clamp(2rem, 6vw, 4.5rem)' }}>Our Features</h2>
            <p className="font-label text-[10px] uppercase tracking-[0.2em] text-[#5C4033]/40 font-semibold mb-6">Early Preview · Feature demos with sample data</p>
            <div className="flex justify-center gap-2" id="tab-buttons">
              {(['ai-models', 'dashboard', 'repository'] as TabId[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => handleTabSwitch(tab)}
                  className={`tab-btn px-8 py-3 font-label text-[10px] uppercase tracking-[0.2em] transition-all ${
                    activeTab === tab ? 'bg-[#3D5A35] text-white' : 'bg-[#f4ede3] text-[#434840]'
                  }`}
                  data-tab={tab}
                >
                  {tab === 'ai-models' ? 'AI Models' : tab === 'dashboard' ? 'Dashboard' : 'Repository'}
                </button>
              ))}
            </div>
          </div>

          <div className="card-stack-area" id="ai-models-area" style={{ display: activeTab === 'ai-models' ? '' : 'none' }}>
            <div className="feature-card" id="fc-ai-0" style={{ position: 'relative', zIndex: 1 }}>
              <div className="card-title-bar">
                <span className="font-label text-[10px] text-[#3D5A35]/60 font-semibold uppercase tracking-[0.3em]">{FEATURE_CARDS[0].eyebrow}</span>
                <h3 className="font-headline text-xl md:text-2xl text-[#3D5A35] leading-tight">{FEATURE_CARDS[0].title}</h3>
              </div>
              <div className="card-body">
                <div className="flex flex-col md:flex-row items-center gap-4">
                  <div className="w-full md:w-2/3">
                    <p className="font-body text-[#434840] text-sm md:text-base leading-relaxed max-w-xl">{FEATURE_CARDS[0].description}</p>
                  </div>
                  <div className="w-full md:w-1/3 flex justify-center items-center min-h-[120px]">
                    <PerspectiveIcon name={FEATURE_CARDS[0].icon} />
                  </div>
                </div>
              </div>
            </div>

            <div className={`feature-card is-stacked ${aiCard1Visible ? 'revealed' : ''}`} id="fc-ai-1" style={{ top: '84px', zIndex: 2 }}>
              <div className="card-title-bar">
                <span className="font-label text-[10px] text-[#3D5A35]/60 font-semibold uppercase tracking-[0.3em]">{FEATURE_CARDS[1].eyebrow}</span>
                <h3 className="font-headline text-xl md:text-2xl text-[#3D5A35] leading-tight">{FEATURE_CARDS[1].title}</h3>
              </div>
              <div className="card-body">
                <div className="flex flex-col md:flex-row items-center gap-4">
                  <div className="w-full md:w-2/3">
                    <p className="font-body text-[#434840] text-sm md:text-base leading-relaxed max-w-xl">{FEATURE_CARDS[1].description}</p>
                  </div>
                  <div className="w-full md:w-1/3 flex justify-center items-center min-h-[120px]">
                    <PerspectiveIcon name={FEATURE_CARDS[1].icon} />
                  </div>
                </div>
              </div>
            </div>

            <div className={`feature-card is-stacked ${aiCard2Visible ? 'revealed' : ''}`} id="fc-ai-2" style={{ top: '152px', zIndex: 3 }}>
              <div className="card-title-bar">
                <span className="font-label text-[10px] text-[#3D5A35]/60 font-semibold uppercase tracking-[0.3em]">{FEATURE_CARDS[2].eyebrow}</span>
                <h3 className="font-headline text-xl md:text-2xl text-[#3D5A35] leading-tight">{FEATURE_CARDS[2].title}</h3>
              </div>
              <div className="card-body">
                <div className="flex flex-col md:flex-row items-center gap-4">
                  <div className="w-full md:w-2/3">
                    <p className="font-body text-[#434840] text-sm md:text-base leading-relaxed max-w-xl">{FEATURE_CARDS[2].description}</p>
                  </div>
                  <div className="w-full md:w-1/3 flex justify-center items-center min-h-[120px]">
                    <PerspectiveIcon name={FEATURE_CARDS[2].icon} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            className="text-center"
            id="ai-demo-cta"
            style={{
              position: 'absolute',
              bottom: '24px',
              left: 0,
              right: 0,
              zIndex: 10,
              display: activeTab === 'ai-models' ? '' : 'none',
              opacity: aiDemoVisible ? 1 : 0,
              transform: aiDemoVisible ? 'translateY(0)' : 'translateY(8px)',
              transition: 'all 0.5s ease 0.4s',
            }}
          >
            <button
              onClick={() => setShowDemoModal(true)}
              className="inline-flex items-center gap-2 bg-transparent border border-[#3D5A35] text-[#3D5A35] px-8 py-3 text-[10px] uppercase tracking-[0.2em] hover:bg-[#3D5A35] hover:text-white transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px', fontVariationSettings: "'FILL' 1" }}>play_circle</span>
              View Demo
            </button>
          </div>

          <div className="dash-container" id="dashboard-area" style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
            <div className="dash-wireframe">
              <div className="dash-topbar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'rgba(61,90,53,0.3)', fontVariationSettings: "'FILL' 1" }}>
                    dashboard
                  </span>
                  <span className="dash-topbar-title">Your Performance Dashboard</span>
                </div>
                <div className="dash-filters">
                  <span className="dash-filter-pill">Type: All</span>
                  <span className="dash-filter-pill">Level: All</span>
                  <span className="dash-filter-pill">Time: All Time</span>
                </div>
              </div>

              <div className="dash-ext-callouts">
                {DASH_CALLOUTS.map((callout, index) => {
                  const visible = isDashboardZoneVisible(index);
                  const isLeft = callout.anchor === 'left';

                  return (
                    <div
                      key={callout.title}
                      className="dash-ext-callout"
                      style={{
                        position: 'absolute',
                        opacity: visible ? 1 : 0,
                        transform: visible ? 'translateX(0)' : isLeft ? 'translateX(10px)' : 'translateX(-10px)',
                        transition: `all 0.6s cubic-bezier(0.22,1,0.36,1) ${0.2 + index * 0.1}s`,
                        pointerEvents: 'none',
                        ...callout.positionStyle,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexDirection: isLeft ? 'row' : 'row' }}>
                        {isLeft && (
                          <div style={{ flex: 1 }}>
                            <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.15em', color: `${callout.color}80`, fontWeight: 600, display: 'block', marginBottom: '2px' }}>
                              {callout.number}
                            </span>
                            <span style={{ fontFamily: "'Newsreader', serif", fontSize: '0.9rem', color: '#453a2a', display: 'block', marginBottom: '3px' }}>
                              {callout.title}
                            </span>
                            <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: '0.68rem', color: '#434840', lineHeight: 1.4 }}>
                              {callout.description}
                            </span>
                          </div>
                        )}
                        <svg
                          width="40"
                          height="20"
                          style={{
                            flexShrink: 0,
                            marginTop: '8px',
                            transform: isLeft ? undefined : 'scaleX(-1)',
                          }}
                        >
                          <path d="M0,10 L30,10 L30,0" fill="none" stroke={callout.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="32" cy="2" r="2" fill={callout.color} />
                        </svg>
                        {!isLeft && (
                          <div style={{ flex: 1 }}>
                            <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.15em', color: `${callout.color}80`, fontWeight: 600, display: 'block', marginBottom: '2px' }}>
                              {callout.number}
                            </span>
                            <span style={{ fontFamily: "'Newsreader', serif", fontSize: '0.9rem', color: '#453a2a', display: 'block', marginBottom: '3px' }}>
                              {callout.title}
                            </span>
                            <span style={{ fontFamily: "'Work Sans', sans-serif", fontSize: '0.68rem', color: '#434840', lineHeight: 1.4 }}>
                              {callout.description}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="dash-main-grid">
                <div className={`dash-zone ${isDashboardZoneVisible(0) ? 'active' : ''}`} id="dash-zone-0">
                  <div className="dash-zone-callout">Your composite score</div>
                  <div className="skel-label">Overall Assessment</div>
                  <div className="skel-title">Case Score</div>
                  <div className="skel-score-row">
                    <span className="skel-score-num">&mdash;</span>
                    <div className="skel-gauge"><div className="skel-gauge-fill" style={{ width: isDashboardZoneVisible(0) ? '52%' : '0%' }} /></div>
                  </div>
                  <div className="skel-stats">
                    <div className="skel-stat-box"><span className="skel-stat-sm">Best Case</span><span className="skel-stat-lg">&mdash;</span></div>
                    <div className="skel-stat-box"><span className="skel-stat-sm">Needs Work</span><span className="skel-stat-lg">&mdash;</span></div>
                  </div>
                </div>

                <div className={`dash-zone ${isDashboardZoneVisible(1) ? 'active' : ''}`} id="dash-zone-1">
                  <div className="dash-zone-callout">Metric-wise breakdown</div>
                  <div className="skel-label">Parameter Analysis</div>
                  <div className="skel-title">Skill Profile</div>
                  {[
                    ['Structure', 44],
                    ['Understanding', 40],
                    ['Delivery', 54],
                    ['Creativity', 76],
                  ].map(([label, width]) => (
                    <div key={label} className="skel-bar-row">
                      <span className="skel-bar-lbl">{label}</span>
                      <div className="skel-bar-track">
                        <div className="skel-bar-fill" style={{ width: isDashboardZoneVisible(1) ? `${width}%` : '0%' }} />
                      </div>
                      <div className="skel-bar-dot" />
                    </div>
                  ))}
                </div>

                <div className={`dash-zone dash-zone-log ${isDashboardZoneVisible(2) ? 'active' : ''}`} id="dash-zone-2">
                  <div className="dash-zone-callout">Case history + LLM transcripts</div>
                  <div className="skel-label">Practice Log</div>
                  <div className="skel-title">All Cases</div>
                  <div className="skel-tbl-head">
                    <span className="skel-th">Case</span>
                    <span className="skel-th">Date</span>
                    <span className="skel-th">Score</span>
                    <span className="skel-th">Assets</span>
                  </div>
                  {[
                    ['80%', '70%', '50%'],
                    ['65%', '70%', '50%'],
                    ['90%', '70%', '50%'],
                    ['75%', '70%', '50%'],
                    ['70%', '70%', '50%'],
                  ].map((widths, index) => (
                    <div key={index} className="skel-tbl-row">
                      <div>
                        <div className="skel-line" style={{ width: widths[0] }} />
                        <div>
                          <span className="skel-tag" />
                          <span className="skel-tag" />
                        </div>
                      </div>
                      <div><div className="skel-line" style={{ width: widths[1] }} /></div>
                      <div><div className="skel-line" style={{ width: widths[2] }} /></div>
                      <div><span className="skel-asset" /><span className="skel-asset" /></div>
                    </div>
                  ))}
                </div>

                <div className={`dash-zone dash-zone-trend ${isDashboardZoneVisible(3) ? 'active' : ''}`} id="dash-zone-3">
                  <div className="dash-zone-callout">Customisable time analysis</div>
                  <div className="skel-label">Performance Trend</div>
                  <div className="skel-title">Score Over Time</div>
                  <div className="skel-chart-area">
                    <svg width="100%" height="100%" viewBox="0 0 400 70" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                      <path d="M0,55 Q50,48 100,42 T200,30 T300,22 T400,12" fill="none" stroke="rgba(61,90,53,0.2)" strokeWidth="2" strokeLinecap="round" />
                      <path d="M0,60 Q50,58 100,52 T200,45 T300,40 T400,28" fill="none" stroke="rgba(69,58,42,0.12)" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 3" />
                    </svg>
                  </div>
                  <div className="skel-chart-ctrls">
                    <span className="skel-pill skel-pill-on">2 Metrics</span>
                    <span className="skel-pill">Together</span>
                    <span className="skel-pill">All Cases</span>
                    <span className="skel-pill">Versus Mode</span>
                  </div>
                </div>
              </div>

              <div className={`dash-cta-wrap ${dashboardCtaVisible ? 'visible' : ''}`} id="dash-cta">
                <Link
                  href="/dashboard"
                  className="inline-block bg-[#3D5A35] text-white px-10 py-4 text-[10px] uppercase tracking-widest hover:bg-[#3D5A35]/90 transition-all shadow-lg"
                >
                  Open Demo Dashboard
                </Link>
              </div>
            </div>
          </div>

          <div className="repo-container" id="repository-area" style={{ display: activeTab === 'repository' ? 'block' : 'none' }}>
            <div className="pyramid-stack">
              {REPOSITORY_RENDER_ORDER.map((index) => {
                const layer = REPOSITORY_LAYERS[index as keyof typeof REPOSITORY_LAYERS];
                const visible = isRepositoryLayerVisible(index);
                const isRight = layer.calloutSide === 'right';

                return (
                  <div key={layer.title} className="pyramid-tier">
                    <div className={`repo-slab repo-slab-${index} ${visible ? 'landed' : ''}`} id={`repo-slab-${index}`}>
                      <span className="material-symbols-outlined slab-icon" style={{ fontSize: '24px', fontVariationSettings: "'FILL' 1" }}>
                        {layer.icon}
                      </span>
                      <span className="slab-label">{layer.title}</span>
                    </div>
                    <div className={`tier-callout ${isRight ? 'tier-callout-right' : 'tier-callout-left'} ${visible ? 'visible' : ''}`} id={`callout-${index}`}>
                      <div className="callout-connector" style={{ background: index === 0 ? '#453a2a' : index === 1 ? '#695c4d' : '#3D5A35' }} />
                      <div className="callout-body">
                        <span className="callout-num" style={{ color: index === 0 ? 'rgba(69,58,42,0.5)' : index === 1 ? 'rgba(105,92,77,0.5)' : 'rgba(61,90,53,0.5)' }}>
                          {layer.calloutNumber}
                        </span>
                        <div className="callout-title">{layer.calloutTitle}</div>
                        <div className="callout-desc">{layer.calloutDescription}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="pyramid-ground" />
            </div>
            <div className={`repo-cta-wrap ${repositoryCtaVisible ? 'visible' : ''}`} id="repo-cta">
              <Link
                href="/repository"
                className="inline-block bg-[#3D5A35] text-white px-10 py-4 text-[10px] uppercase tracking-widest hover:bg-[#3D5A35]/90 transition-all shadow-lg"
              >
                Explore the Repository
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="differentiator-section" className="pt-8 pb-24 px-4 md:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="font-headline font-light text-[#453a2a] tracking-tight mb-4 text-balance" style={{ fontSize: 'clamp(2rem, 6vw, 4.5rem)' }}>What Makes Us Different</h2>
            <p className="font-body text-lg text-[#434840] max-w-2xl mx-auto leading-relaxed">
              Our AI doesn&apos;t replace the interview. It transforms what comes out of it.
              <br />
              Voice LLMs, multi-dimensional analysis, and predictive readiness mapping, all fuelled by authentic human data no chatbot can generate.
            </p>
          </div>

          <div className="relative max-w-5xl mx-auto mb-6">
            <div className="hidden md:block absolute top-12 left-[80px] right-[80px] h-[2px]" style={{ zIndex: 0 }}>
              <div className="w-full h-full border-t-2 border-dashed border-[#c3c8bd]/60 relative overflow-hidden">
                <div className="pipe-flow-dot absolute top-[-3px] w-2 h-2 rounded-full bg-[#3D5A35]/70" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-6 relative z-10">
              <div className="pipe-stage flex flex-col items-center text-center" data-delay="0">
                <div className="w-24 h-24 rounded-full border-2 border-[#453a2a] bg-[#faf3e9] flex items-center justify-center mb-4 pipe-glow-brown">
                  <span className="material-symbols-outlined text-[#453a2a]" style={{ fontSize: '40px', fontVariationSettings: "'FILL' 1, 'wght' 400" }}>groups</span>
                </div>
                <span className="font-label text-[9px] uppercase tracking-[0.2em] text-[#453a2a]/60 font-semibold mb-1">Human</span>
                <span className="font-headline text-lg text-[#453a2a] italic mb-1">The Interview</span>
                <span className="font-body text-xs text-[#434840] leading-relaxed max-w-[200px]">
                  Real partner across the table. Their intuition, their presence, their unpredictability, intact.
                </span>
              </div>

              <div className="pipe-stage flex flex-col items-center text-center" data-delay="200">
                <div className="w-24 h-24 rounded-full border-2 border-[#695c4d] bg-[#faf3e9] flex items-center justify-center mb-4 pipe-glow-bridge pipe-pulse">
                  <span className="material-symbols-outlined text-[#695c4d]" style={{ fontSize: '40px', fontVariationSettings: "'FILL' 1, 'wght' 400" }}>graphic_eq</span>
                </div>
                <span className="font-label text-[9px] uppercase tracking-[0.2em] text-[#695c4d]/60 font-semibold mb-1">Voice LLM</span>
                <span className="font-headline text-lg text-[#453a2a] italic mb-1">The Capture</span>
                <span className="font-body text-xs text-[#434840] leading-relaxed max-w-[200px]">
                  Live transcription turns every session into a searchable, replayable record in your virtual repository.
                </span>
              </div>

              <div className="pipe-stage flex flex-col items-center text-center" data-delay="400">
                <div className="w-24 h-24 rounded-full border-2 border-[#3D5A35] bg-[#faf3e9] flex items-center justify-center mb-4 pipe-glow-green">
                  <span className="material-symbols-outlined text-[#3D5A35]" style={{ fontSize: '40px', fontVariationSettings: "'FILL' 1, 'wght' 400" }}>psychology</span>
                </div>
                <span className="font-label text-[9px] uppercase tracking-[0.2em] text-[#3D5A35]/60 font-semibold mb-1">AI Engine</span>
                <span className="font-headline text-lg text-[#453a2a] italic mb-1">The Analysis</span>
                <span className="font-body text-xs text-[#434840] leading-relaxed max-w-[200px]">
                  Structure, reasoning, communication: dissected across 10+ dimensions no human could track in real-time.
                </span>
              </div>

              <div className="pipe-stage flex flex-col items-center text-center" data-delay="600">
                <div className="w-24 h-24 rounded-full border-2 border-[#3D5A35] bg-[#faf3e9] flex items-center justify-center mb-4 pipe-glow-green">
                  <span className="material-symbols-outlined text-[#3D5A35]" style={{ fontSize: '40px', fontVariationSettings: "'FILL' 1, 'wght' 400" }}>route</span>
                </div>
                <span className="font-label text-[9px] uppercase tracking-[0.2em] text-[#3D5A35]/60 font-semibold mb-1">AI Engine</span>
                <span className="font-headline text-lg text-[#453a2a] italic mb-1">The Roadmap</span>
                <span className="font-body text-xs text-[#434840] leading-relaxed max-w-[200px]">
                  Readiness predicted, difficulty recalibrated, your optimal path to interview-day confidence, charted.
                </span>
              </div>
            </div>
          </div>

          <div className="text-center mb-16 pipeline-reveal" data-delay="800">
            <div className="loop-banner">
              <div className="inline-flex items-center gap-4">
                <span className="w-16 h-[2px] bg-[#3D5A35]/20" />
                <span className="material-symbols-outlined text-[#3D5A35]/60" style={{ fontSize: '22px', fontVariationSettings: "'FILL' 1" }}>autorenew</span>
                <span className="font-headline text-base md:text-lg text-[#453a2a] italic tracking-wide">Every session makes the next one smarter</span>
                <span className="material-symbols-outlined text-[#3D5A35]/60" style={{ fontSize: '22px', fontVariationSettings: "'FILL' 1" }}>autorenew</span>
                <span className="w-16 h-[2px] bg-[#3D5A35]/20" />
              </div>
              <div className="mt-2">
                <span className="font-label text-[9px] uppercase tracking-[0.25em] text-[#3D5A35]/40 font-semibold">Continuous Improvement Loop</span>
              </div>
            </div>
          </div>

          <div className="pipeline-reveal max-w-5xl mx-auto mb-8" data-delay="950">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '680px', margin: '0 auto 6px' }}>
              <span className="font-label text-[9px] uppercase tracking-[0.2em] text-[#453a2a]/50 font-semibold">Human-Only</span>
              <span className="font-label text-[9px] uppercase tracking-[0.2em] text-[#3D5A35] font-semibold">Hybrid | Best of Both</span>
              <span className="font-label text-[9px] uppercase tracking-[0.2em] text-[#434840]/40 font-semibold">Full AI</span>
            </div>
            <div
              style={{
                maxWidth: '680px',
                margin: '0 auto',
                height: '2px',
                borderRadius: '1px',
                background: 'linear-gradient(90deg, rgba(69,58,42,0.25) 0%, rgba(69,58,42,0.4) 20%, rgba(61,90,53,0.5) 45%, rgba(61,90,53,0.5) 55%, rgba(115,121,111,0.4) 80%, rgba(115,121,111,0.25) 100%)',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '-4px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '10px',
                  height: '10px',
                  background: '#3D5A35',
                  borderRadius: '50%',
                  border: '2px solid #fff8f0',
                  boxShadow: '0 0 0 1px rgba(61,90,53,0.2), 0 1px 4px rgba(61,90,53,0.15)',
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-16 pipeline-reveal items-stretch" data-delay="1000">
            <div className="spectrum-card spectrum-side bg-[#eee7dd] border border-[#c3c8bd]/20 flex flex-col">
              <div className="flex items-center gap-2 mb-5">
                <span className="material-symbols-outlined text-[#453a2a]/50" style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}>person</span>
                <span className="font-label text-[9px] uppercase tracking-[0.2em] text-[#453a2a]/50 font-semibold">Human-Only Prep</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-[#3D5A35]/40 flex-shrink-0" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                <span className="font-body text-xs text-[#434840]/80 leading-relaxed">{HUMAN_ONLY_POINTS[0]}</span>
              </div>
              <div style={{ height: '1px', background: 'rgba(61,90,53,0.08)', margin: '8px 0' }} />
              {HUMAN_ONLY_POINTS.slice(1).map((point) => (
                <div key={point} className="spectrum-row">
                  <span className="material-symbols-outlined text-[#453a2a]/30 flex-shrink-0" style={{ fontSize: '14px' }}>horizontal_rule</span>
                  <span className="font-body text-xs text-[#434840]/60 leading-relaxed">{point}</span>
                </div>
              ))}
            </div>

            <div className="spectrum-card spectrum-center bg-[#f4ede3] border-2 border-[#3D5A35]/20 flex flex-col">
              <div className="flex items-center gap-2 mb-5">
                <span className="material-symbols-outlined text-[#3D5A35]" style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}>verified</span>
                <span className="font-label text-[9px] uppercase tracking-[0.2em] text-[#3D5A35] font-semibold">Case CompendiumX</span>
              </div>
              {COMPENDIUM_X_POINTS.map((point) => (
                <div key={point} className="spectrum-row">
                  <span className="material-symbols-outlined text-[#3D5A35] flex-shrink-0" style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>check</span>
                  <span className="font-body text-xs text-[#1e1b15] leading-relaxed font-medium">{point}</span>
                </div>
              ))}
            </div>

            <div className="spectrum-card spectrum-side bg-[#eee7dd] border border-[#c3c8bd]/20 flex flex-col">
              <div className="flex items-center gap-2 mb-5">
                <span className="material-symbols-outlined text-[#434840]/40" style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
                <span className="font-label text-[9px] uppercase tracking-[0.2em] text-[#434840]/50 font-semibold">Full AI Interviews</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-[#3D5A35]/40 flex-shrink-0" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                <span className="font-body text-xs text-[#434840]/80 leading-relaxed">{FULL_AI_POINTS[0]}</span>
              </div>
              <div style={{ height: '1px', background: 'rgba(61,90,53,0.08)', margin: '8px 0' }} />
              {FULL_AI_POINTS.slice(1).map((point) => (
                <div key={point} className="spectrum-row">
                  <span className="material-symbols-outlined text-[#434840]/30 flex-shrink-0" style={{ fontSize: '14px' }}>horizontal_rule</span>
                  <span className="font-body text-xs text-[#434840]/60 leading-relaxed">{point}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Footer currentPage="home" />
      {showDemoModal && <AIDemoModal onClose={() => setShowDemoModal(false)} />}
    </div>
  );
};

export default HomePage;
