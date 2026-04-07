'use client';

/**
 * Analytics.tsx
 * Drop this file into your /components folder.
 *
 * Includes:
 *  - Google Analytics 4  → G-L0NNP1V8VB
 *  - Microsoft Clarity   → w6oi3gt0yl
 *  - SPA route-change tracking (fires on every Next.js page navigation)
 *  - Google for Startups referral detector
 *  - Scroll depth tracker (25 / 50 / 75 / 100 %)
 *  - Time-on-site milestones (30s / 60s / 2min / 5min)
 */

import Script from 'next/script';
import { useEffect, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// ── Environment variables ────────────────────────────────────────────────────
// Reads from .env.local (local dev) or Vercel env vars (production).
// Hardcoded values are fallbacks so tracking works even without env vars set.
const GA_ID      = process.env.NEXT_PUBLIC_GA4_ID     ?? 'G-L0NNP1V8VB';
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID ?? 'w6oi3gt0yl';

// ── TypeScript: extend Window ────────────────────────────────────────────────
declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
    gtag:      (...args: unknown[]) => void;
    clarity:   (...args: unknown[]) => void;
  }
}

// ── Helper: page-view on SPA navigation ─────────────────────────────────────
function trackPageView(url: string) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('config', GA_ID, { page_path: url });
  }
}

// ── Helper: detect Google / Google for Startups referral ────────────────────
function trackGoogleReferral() {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;

  const ref  = document.referrer ?? '';
  const page = window.location.href;

  // Any google.com / google.co.in visit
  if (/google\.(com|co\.|in)/.test(ref)) {
    window.gtag('event', 'google_referral', {
      event_category: 'Referrals',
      event_label:    'Google – ' + (ref.split('/')[2] ?? ref),
      referrer_url:   ref,
      landing_page:   page,
    });
  }

  // Specifically google.com/startups or startup.google.*
  if (ref.includes('google.com/startups') || ref.includes('startup.google')) {
    window.gtag('event', 'google_for_startups_visit', {
      event_category: 'Google For Startups',
      event_label:    'GFS Reviewer',
      referrer_url:   ref,
      landing_page:   page,
    });
  }

  // UTM-tagged links (e.g. ?utm_source=google-startups)
  const params = new URLSearchParams(window.location.search);
  const utmSrc = (params.get('utm_source') ?? '').toLowerCase();
  if (utmSrc.includes('google')) {
    window.gtag('event', 'utm_google_traffic', {
      event_category: 'Referrals',
      utm_source:     params.get('utm_source'),
      utm_medium:     params.get('utm_medium'),
      utm_campaign:   params.get('utm_campaign'),
      landing_page:   page,
    });
  }
}

// ── Helper: scroll depth (25 / 50 / 75 / 100 %) ─────────────────────────────
function initScrollDepth(): () => void {
  const milestones = [25, 50, 75, 100];
  const fired: Record<number, boolean> = {};

  const handler = () => {
    const scrolled = window.scrollY + window.innerHeight;
    const total    = document.documentElement.scrollHeight;
    const pct      = Math.round((scrolled / total) * 100);

    milestones.forEach(m => {
      if (!fired[m] && pct >= m) {
        fired[m] = true;
        window.gtag?.('event', 'scroll_depth', {
          event_category: 'Engagement',
          event_label:    m + '% scrolled',
          scroll_depth:   m,
        });
      }
    });
  };

  window.addEventListener('scroll', handler, { passive: true });
  return () => window.removeEventListener('scroll', handler);
}

// ── Helper: time-on-site milestones ──────────────────────────────────────────
function initTimeOnSite(): () => void {
  const timers = [30, 60, 120, 300].map(s =>
    window.setTimeout(() => {
      window.gtag?.('event', 'time_on_site', {
        event_category: 'Engagement',
        event_label:    s + 's on site',
        seconds:        s,
      });
    }, s * 1000)
  );
  return () => timers.forEach(t => window.clearTimeout(t));
}

// ── Inner component (needs Suspense wrapper for useSearchParams) ─────────────
function AnalyticsInner() {
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  // Track every SPA route change as a new page-view
  useEffect(() => {
    const url = pathname + (searchParams.toString() ? '?' + searchParams.toString() : '');
    trackPageView(url);
  }, [pathname, searchParams]);

  // Run once on first mount
  useEffect(() => {
    // Small delay so gtag is definitely initialised
    const timer = window.setTimeout(() => {
      trackGoogleReferral();
    }, 500);

    const cleanupScroll = initScrollDepth();
    const cleanupTimers = initTimeOnSite();

    // Tag Clarity sessions that arrived from Google
    if (CLARITY_ID && typeof window.clarity === 'function') {
      if (document.referrer && /google\./.test(document.referrer)) {
        window.clarity('set', 'traffic_source', 'google_referral');
      }
    }

    return () => {
      window.clearTimeout(timer);
      cleanupScroll();
      cleanupTimers();
    };
  }, []);

  return null; // This component renders no UI
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function Analytics() {
  if (!GA_ID) return null; // Safety guard — won't break build if env var missing

  return (
    <>
      {/* ── Google Analytics 4 ── */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){ dataLayer.push(arguments); }
          gtag('js', new Date());
          gtag('config', '${GA_ID}', {
            enhanced_measurement:             true,
            cookie_flags:                     'SameSite=None;Secure',
            allow_google_signals:             true,
            allow_ad_personalization_signals: false,
            send_page_view:                   true
          });
        `}
      </Script>

      {/* ── Microsoft Clarity (heatmaps + recordings) ── */}
      {CLARITY_ID && (
        <Script id="clarity-init" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r); t.async=1;
              t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${CLARITY_ID}");
          `}
        </Script>
      )}

      {/* ── Behavioural tracking (page views, referrals, scroll, time) ── */}
      <Suspense fallback={null}>
        <AnalyticsInner />
      </Suspense>
    </>
  );
}
