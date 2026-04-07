'use client';

import Link from 'next/link';
import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { usePathname, useRouter } from 'next/navigation';
import MarketingAuthPanel from '@/components/auth/MarketingAuthPanel';
import { auth } from '@/lib/firebase/config';

interface NavbarProps {
  currentPage: 'home' | 'dashboard' | 'about' | 'repository' | 'practice' | 'privacy';
}

const Navbar = ({ currentPage }: NavbarProps) => {
  const [scrolled, setScrolled]             = useState(false);
  const [isSignedIn, setIsSignedIn]         = useState(false);
  const [showAuthModal, setShowAuthModal]   = useState(false);
  const router = useRouter();
  const pathname = usePathname();

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

  const redirectTarget = pathname && pathname.startsWith('/') ? pathname : '/welcome';

  const handleLogout = async () => {
    await signOut(auth);
    router.refresh();
  };

  return (
    <>
      <style>{`
        .nav-link { position: relative; color: #57534e; }
        .nav-link.active { color: #3D5A35; font-weight: 500; }
        .nav-link.active::after {
          content: '';
          position: absolute; bottom: -4px; left: 0; right: 0;
          height: 2px; background: #3D5A35; border-radius: 1px;
        }
        .material-symbols-outlined {
          font-family: 'Material Symbols Outlined';
          font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;
        }
      `}</style>

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
        <div className="flex justify-between items-center w-full px-12 h-full max-w-screen-2xl mx-auto">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-1 transition-opacity hover:opacity-85" aria-label="Go to home page">
            <img
              src="/logo.png"
              alt="Case Compendium X"
              width={56}
              height={56}
              className="w-14 h-14 object-contain"
            />
            <div style={{ fontFamily: "'Newsreader', serif" }} className="text-xl font-semibold tracking-tight">
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
            <Link
              href="/about"
              style={{ fontFamily: "'Work Sans', sans-serif" }}
              className={`nav-link text-xs uppercase tracking-[0.2em] hover:text-[#3D5A35] transition-colors duration-300 pb-1 ${currentPage === 'about' ? 'active' : ''}`}
            >
              ABOUT US
            </Link>
          </div>

          {/* Auth Area */}
          <div className="flex items-center gap-6">
            {isSignedIn ? (
              <>
                <button
                  onClick={handleLogout}
                  style={{ fontFamily: "'Work Sans', sans-serif" }}
                  className="border border-[#3D5A35] px-5 py-2 text-[#3D5A35] text-[10px] uppercase tracking-[0.2em] font-medium hover:bg-[#3D5A35] hover:text-white transition-all duration-300 cursor-pointer bg-transparent"
                >
                  LOG OUT
                </button>
                <span className="material-symbols-outlined text-[#3D5A35]" style={{ fontSize: '36px' }}>account_circle</span>
              </>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                style={{ fontFamily: "'Work Sans', sans-serif" }}
                className="border border-[#3D5A35] px-5 py-2 text-[#3D5A35] text-[10px] uppercase tracking-[0.2em] font-medium hover:bg-[#3D5A35] hover:text-white transition-all duration-300 cursor-pointer bg-transparent"
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
