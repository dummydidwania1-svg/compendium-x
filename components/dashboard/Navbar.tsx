'use client';

import Link from 'next/link';
import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { usePathname, useRouter } from 'next/navigation';
import MarketingAuthPanel from '@/components/auth/MarketingAuthPanel';
import ProfileOverlay from '@/components/profile/ProfileOverlay';
import { auth } from '@/lib/firebase/config';
import { useIsPreview } from './DashboardContext';

interface NavbarProps {
  currentPage: 'home' | 'dashboard' | 'about' | 'about-ccx' | 'repository' | 'practice' | 'privacy' | 'collaborators';
}

const Navbar = ({ currentPage }: NavbarProps) => {
  const [scrolled, setScrolled]             = useState(false);
  const [isSignedIn, setIsSignedIn]         = useState(false);
  const [showAuthModal, setShowAuthModal]   = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const redirectTarget = pathname && pathname.startsWith('/') ? pathname : '/dashboard';

  const handleLogout = async () => {
    await signOut(auth);
    router.refresh();
  };

  return (
    <>
      <style>{`
        @keyframes _nav_mobile_in {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

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
          background: scrolled ? 'rgba(255,248,240,0.6)' : 'rgba(255,248,240,0.9)',
          backdropFilter: scrolled ? 'blur(28px) saturate(1.5)' : 'blur(12px)',
          WebkitBackdropFilter: scrolled ? 'blur(28px) saturate(1.5)' : 'blur(12px)',
          boxShadow: scrolled ? '0 1px 16px rgba(0,0,0,0.06)' : undefined,
          transition: 'background 0.3s, box-shadow 0.3s',
        }}
        className="fixed top-0 w-full z-[100] border-b border-[#3D5A35]/10"
      >
        {/* Main bar — always 70px tall */}
        <div
          style={{ height: '70px' }}
          className="relative flex justify-between items-center w-full px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 max-w-[1440px] mx-auto gap-3"
        >

          {/* Logo — mobile only; desktop tie icon lives inside the centered nav group below */}
          <Link href="/" className="md:hidden transition-opacity hover:opacity-85 shrink-0" aria-label="Go to home page">
            <img
              src="/logo.png"
              alt="Case Compendium X"
              width={56}
              height={56}
              className="w-10 h-10 object-contain shrink-0"
            />
          </Link>

          {/* Desktop centered nav group — ABOUT US, REPOSITORY, tie icon, DASHBOARD, PRACTICE all in one row, anchored to the true center as a single unit so spacing mirrors symmetrically around the tie */}
          <div className="hidden md:flex items-center space-x-10 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="nav-dropdown">
              <span
                style={{ fontFamily: "'Work Sans', sans-serif" }}
                className={`nav-link nav-dropdown-trigger text-xs uppercase tracking-[0.2em] hover:text-[#3D5A35] transition-colors duration-300 pb-1 ${
                  currentPage === 'about' || currentPage === 'about-ccx' || currentPage === 'collaborators' ? 'active' : ''
                }`}
                tabIndex={0}
              >
                ABOUT US
                <span className="material-symbols-outlined chevron">expand_more</span>
              </span>
              <div className="nav-dropdown-menu" role="menu">
                <Link href="/about-ccx" style={{ fontFamily: "'Work Sans', sans-serif" }} className="nav-dropdown-item" role="menuitem">
                  <span style={{ fontFamily: "'Work Sans', sans-serif" }} className="nav-dropdown-item-label text-xs uppercase tracking-[0.2em] hover:text-[#3D5A35] transition-colors duration-300">
                    The Platform
                  </span>
                </Link>
                <Link href="/our-story" style={{ fontFamily: "'Work Sans', sans-serif" }} className="nav-dropdown-item" role="menuitem">
                  <span style={{ fontFamily: "'Work Sans', sans-serif" }} className="nav-dropdown-item-label text-xs uppercase tracking-[0.2em] hover:text-[#3D5A35] transition-colors duration-300">
                    The Team
                  </span>
                </Link>
                <Link href="/collaborators" style={{ fontFamily: "'Work Sans', sans-serif" }} className="nav-dropdown-item" role="menuitem">
                  <span style={{ fontFamily: "'Work Sans', sans-serif" }} className="nav-dropdown-item-label text-xs uppercase tracking-[0.2em] hover:text-[#3D5A35] transition-colors duration-300">
                    Acknowledgements
                  </span>
                </Link>
              </div>
            </div>

            <Link
              href="/repository"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
              className={`nav-link text-xs uppercase tracking-[0.2em] hover:text-[#3D5A35] transition-colors duration-300 pb-1 ${currentPage === 'repository' ? 'active' : ''}`}
            >
              REPOSITORY
            </Link>

            <Link href="/" className="transition-opacity hover:opacity-85 shrink-0" aria-label="Go to home page">
              <img
                src="/logo.png"
                alt="Case Compendium X"
                width={56}
                height={56}
                className="w-12 h-12 object-contain shrink-0"
              />
            </Link>

            <Link
              href="/dashboard"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
              className={`nav-link text-xs uppercase tracking-[0.2em] hover:text-[#3D5A35] transition-colors duration-300 pb-1 ${currentPage === 'dashboard' ? 'active' : ''}`}
            >
              DASHBOARD
            </Link>
            <Link
              href="/practice"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
              className={`nav-link text-xs uppercase tracking-[0.2em] hover:text-[#3D5A35] transition-colors duration-300 pb-1 ${currentPage === 'practice' ? 'active' : ''}`}
            >
              PRACTICE
            </Link>
          </div>

          {/* Desktop auth — sits at far right of the bar */}
          <div className="hidden md:flex items-center shrink-0 md:ml-auto">
            {isSignedIn ? (
              <button
                onClick={() => setShowProfileModal(true)}
                style={{ fontFamily: "'Work Sans', sans-serif" }}
                className="flex items-center gap-1.5 border border-[#3D5A35] px-3 py-1.5 sm:px-4 sm:py-2 text-[#3D5A35] text-[10px] uppercase tracking-[0.2em] font-medium hover:bg-[#3D5A35] hover:text-white transition-all duration-300 whitespace-nowrap cursor-pointer bg-transparent"
              >
                <span className="material-symbols-outlined text-[16px] leading-none" style={{ fontSize: '16px' }}>account_circle</span>
                My Account
              </button>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                style={{ fontFamily: "'Work Sans', sans-serif" }}
                className={`border border-[#3D5A35] px-3 py-1.5 sm:px-4 sm:py-2 text-[#3D5A35] text-[10px] uppercase tracking-[0.2em] font-medium hover:bg-[#3D5A35] hover:text-white transition-all duration-300 cursor-pointer bg-transparent whitespace-nowrap${isPreview ? ' _nav_signin_btn' : ''}`}
              >
                SIGN IN
              </button>
            )}
          </div>

          {/* Mobile: auth button + hamburger */}
          <div className="flex md:hidden items-center gap-2 sm:gap-3 shrink-0">
            {isSignedIn ? (
              <button
                onClick={() => setShowProfileModal(true)}
                style={{ fontFamily: "'Work Sans', sans-serif" }}
                className="flex items-center gap-1.5 border border-[#3D5A35] px-3 py-1.5 text-[#3D5A35] text-[10px] uppercase tracking-[0.2em] font-medium hover:bg-[#3D5A35] hover:text-white transition-all duration-300 whitespace-nowrap cursor-pointer bg-transparent"
              >
                <span className="material-symbols-outlined text-[16px] leading-none" style={{ fontSize: '16px' }}>account_circle</span>
                My Account
              </button>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                style={{ fontFamily: "'Work Sans', sans-serif" }}
                className={`border border-[#3D5A35] px-3 py-1.5 text-[#3D5A35] text-[10px] uppercase tracking-[0.2em] font-medium hover:bg-[#3D5A35] hover:text-white transition-all duration-300 cursor-pointer bg-transparent whitespace-nowrap${isPreview ? ' _nav_signin_btn' : ''}`}
              >
                SIGN IN
              </button>
            )}

            <button
              onClick={() => setMobileMenuOpen((o) => !o)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              className="flex flex-col justify-center items-center w-9 h-9 gap-[5px] shrink-0 rounded transition-colors hover:bg-[#3D5A35]/08"
            >
              <span
                className="block w-5 h-[1.5px] bg-[#453a2a] transition-transform duration-200 origin-center"
                style={{ transform: mobileMenuOpen ? 'translateY(6.5px) rotate(45deg)' : undefined }}
              />
              <span
                className="block w-5 h-[1.5px] bg-[#453a2a] transition-opacity duration-200"
                style={{ opacity: mobileMenuOpen ? 0 : 1 }}
              />
              <span
                className="block w-5 h-[1.5px] bg-[#453a2a] transition-transform duration-200 origin-center"
                style={{ transform: mobileMenuOpen ? 'translateY(-6.5px) rotate(-45deg)' : undefined }}
              />
            </button>
          </div>
        </div>

        {/* Mobile menu drawer */}
        {mobileMenuOpen && (
          <div
            className="md:hidden border-t border-[#3D5A35]/10 px-4 py-4 flex flex-col gap-1"
            style={{
              background: 'rgba(255,248,240,0.97)',
              backdropFilter: 'blur(28px)',
              animation: '_nav_mobile_in 0.2s cubic-bezier(0.22,1,0.36,1) forwards',
            }}
          >
            {[
              { href: '/', label: 'HOME', page: 'home' },
              { href: '/repository', label: 'REPOSITORY', page: 'repository' },
              { href: '/practice', label: 'PRACTICE', page: 'practice' },
              { href: '/dashboard', label: 'DASHBOARD', page: 'dashboard' },
              { href: '/about-ccx', label: 'THE PLATFORM', page: 'about-ccx' },
              { href: '/our-story', label: 'THE TEAM', page: 'about' },
              { href: '/collaborators', label: 'ACKNOWLEDGEMENTS', page: 'collaborators' },
            ].map(({ href, label, page }) => (
              <Link
                key={href}
                href={href}
                style={{ fontFamily: "'Work Sans', sans-serif" }}
                className={`block px-3 py-3 text-[11px] uppercase tracking-[0.2em] transition-colors duration-200 rounded-lg ${
                  currentPage === page
                    ? 'text-[#3D5A35] font-medium bg-[#3D5A35]/8'
                    : 'text-[#57534e] hover:text-[#3D5A35] hover:bg-[#3D5A35]/5'
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                {label}
              </Link>
            ))}

            {isSignedIn ? (
              <div className="mt-2 border-t border-[#3D5A35]/10 pt-2 space-y-0.5">
                <button
                  onClick={() => { setMobileMenuOpen(false); setShowProfileModal(true) }}
                  style={{ fontFamily: "'Work Sans', sans-serif" }}
                  className="block w-full text-left px-3 py-3 text-[11px] uppercase tracking-[0.2em] text-[#3D5A35] font-medium rounded-lg hover:bg-[#3D5A35]/8 transition-colors duration-200"
                >
                  My Account
                </button>
                <button
                  onClick={() => { setMobileMenuOpen(false); handleLogout() }}
                  style={{ fontFamily: "'Work Sans', sans-serif" }}
                  className="block w-full text-left px-3 py-3 text-[11px] uppercase tracking-[0.2em] text-[#92400e] rounded-lg hover:bg-[#92400e]/8 transition-colors duration-200"
                >
                  Sign Out
                </button>
              </div>
            ) : null}
          </div>
        )}
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

      {showProfileModal ? <ProfileOverlay onClose={() => setShowProfileModal(false)} /> : null}
    </>
  );
};

export default Navbar;
