'use client';

import Link from 'next/link';
import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { usePathname, useRouter } from 'next/navigation';
import MarketingAuthPanel from '@/components/auth/MarketingAuthPanel';
import { auth } from '@/lib/firebase/config';
import { useIsPreview } from './DashboardContext';

interface NavbarProps {
  currentPage: 'home' | 'dashboard' | 'about' | 'about-ccx' | 'repository' | 'practice' | 'privacy';
}

const Navbar = ({ currentPage }: NavbarProps) => {
  const [scrolled, setScrolled]             = useState(false);
  const [isSignedIn, setIsSignedIn]         = useState(false);
  const [showAuthModal, setShowAuthModal]   = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const isPreview = useIsPreview();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsSignedIn(Boolean(user));
    });

    return () => unsubscribe();
  }, []);

  const redirectTarget = pathname && pathname.startsWith('/') ? pathname : '/dashboard';

  const handleLogout = async () => {
    await signOut(auth);
    router.refresh();
  };

  return (
    <>
      {isPreview && (
        <style>{`
          @keyframes _nav_signin_glow {
            0%   { box-shadow: 0 0 0 0 rgba(61,90,53,0); }
            25%  { box-shadow: 0 0 0 4px rgba(61,90,53,0.22); }
            60%  { box-shadow: 0 0 0 7px rgba(61,90,53,0.10); }
            100% { box-shadow: 0 0 0 0 rgba(61,90,53,0); }
          }
          @keyframes _nav_signin_ping {
            0%   { transform: scale(1); opacity: 0.5; }
            70%  { transform: scale(1.9); opacity: 0; }
            100% { transform: scale(1.9); opacity: 0; }
          }
          ._nav_signin_btn {
            animation: _nav_signin_glow 2.4s cubic-bezier(0.4,0,0.6,1) 0.6s 3 forwards;
            position: relative;
          }
          ._nav_signin_btn::before {
            content: '';
            position: absolute;
            inset: 0;
            border-radius: inherit;
            animation: _nav_signin_ping 1.2s ease-out 0.6s 5 forwards;
            border: 1px solid rgba(61,90,53,0.45);
            pointer-events: none;
          }
        `}</style>
      )}

      {/* ── Navbar ── */}
      <nav
        style={{
          height: '70px',
          background: scrolled ? 'rgba(255,248,240,0.6)' : 'rgba(255,248,240,0.9)',
          backdropFilter: scrolled ? 'blur(28px) saturate(1.5)' : 'blur(12px)',
          WebkitBackdropFilter: scrolled ? 'blur(28px) saturate(1.5)' : 'blur(12px)',
          boxShadow: scrolled ? '0 1px 16px rgba(0,0,0,0.06)' : undefined,
          transition: 'background 0.3s, box-shadow 0.3s',
        }}
        className="fixed top-0 w-full z-[100] border-b border-[#3D5A35]/10"
      >
        <div className="flex justify-between items-center w-full px-4 sm:px-6 lg:px-12 h-full max-w-screen-2xl mx-auto gap-3">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-1 transition-opacity hover:opacity-85" aria-label="Go to home page">
            <img
              src="/logo.png"
              alt="Case Compendium X"
              width={56}
              height={56}
              className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 object-contain shrink-0"
            />
            <div style={{ fontFamily: "'Newsreader', serif" }} className="text-base sm:text-lg md:text-xl font-semibold tracking-tight whitespace-nowrap">
              <span className="text-[#453a2a]">Case Compendium</span>
              <span className="text-[#3D5A35]">X</span>
            </div>
          </Link>

          {/* Nav Links */}
          <div className="hidden md:flex items-center space-x-10">
            <Link
              href="/"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
              className={`nav-link text-xs uppercase tracking-[0.2em] hover:text-[#3D5A35] transition-colors duration-300 pb-1 ${currentPage === 'home' ? 'active' : ''}`}
            >
              HOME
            </Link>
            <Link
              href="/dashboard"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
              className={`nav-link text-xs uppercase tracking-[0.2em] hover:text-[#3D5A35] transition-colors duration-300 pb-1 ${currentPage === 'dashboard' ? 'active' : ''}`}
            >
              DASHBOARD
            </Link>
<div className="nav-dropdown">
  <span
    style= {{fontFamily: "'Work Sans', sans-serif" }}
    className={`nav-link nav-dropdown-trigger text-xs uppercase tracking-[0.2em] hover:text-[#3D5A35] transition-colors duration-300 pb-1 ${
      currentPage === 'about' || currentPage === 'about-ccx' ? 'active' : ''
    }`}
    tabIndex={0}
  >
    ABOUT US
    <span className="material-symbols-outlined chevron">expand_more</span>
  </span>

  <div className="nav-dropdown-menu" role="menu">
    <Link
      href="/about-ccx"
      style= {{fontFamily: "'Work Sans', sans-serif" }}
      className="nav-dropdown-item"
      role="menuitem"
    >
      <span
        style= {{fontFamily: "'Work Sans', sans-serif" }}
        className="nav-dropdown-item-label text-xs uppercase tracking-[0.2em] hover:text-[#3D5A35] transition-colors duration-300"
      >
        The Platform
      </span>
    </Link>
    <Link
      href="/our-story"
      style= {{fontFamily: "'Work Sans', sans-serif" }}
      className="nav-dropdown-item"
      role="menuitem"
    >
      <span
        style= {{fontFamily: "'Work Sans', sans-serif" }}
        className="nav-dropdown-item-label text-xs uppercase tracking-[0.2em] hover:text-[#3D5A35] transition-colors duration-300"
      >
        The Team
      </span>
    </Link>
  </div>
</div>
          </div>

          {/* Auth Area */}
          <div className="flex items-center gap-2 sm:gap-4 md:gap-6 shrink-0">
            {isSignedIn ? (
              <>
                <button
                  onClick={handleLogout}
                  style={{ fontFamily: "'Work Sans', sans-serif" }}
                  className="border border-[#3D5A35] px-3 py-1.5 sm:px-4 sm:py-2 md:px-5 text-[#3D5A35] text-[10px] uppercase tracking-[0.2em] font-medium hover:bg-[#3D5A35] hover:text-white transition-all duration-300 cursor-pointer bg-transparent whitespace-nowrap"
                >
                  LOG OUT
                </button>
                <span className="material-symbols-outlined text-[#3D5A35] hidden sm:inline-block sm:text-[32px] md:text-[36px]">account_circle</span>
              </>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                style={{ fontFamily: "'Work Sans', sans-serif" }}
                className={`border border-[#3D5A35] px-3 py-1.5 sm:px-4 sm:py-2 md:px-5 text-[#3D5A35] text-[10px] uppercase tracking-[0.2em] font-medium hover:bg-[#3D5A35] hover:text-white transition-all duration-300 cursor-pointer bg-transparent whitespace-nowrap${isPreview ? ' _nav_signin_btn' : ''}`}
              >
                SIGN IN
              </button>
            )}
          </div>

        </div>
      </nav>

      {showAuthModal ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowAuthModal(false);
            }
          }}
        >
          <MarketingAuthPanel
            redirectTarget={redirectTarget}
            currentPath={pathname ?? undefined}
            onClose={() => setShowAuthModal(false)}
            onSuccess={() => setShowAuthModal(false)}
          />
        </div>
      ) : null}
    </>
  );
};

export default Navbar;
