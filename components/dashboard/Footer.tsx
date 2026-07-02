import Link from 'next/link'

interface FooterProps {
  currentPage?: 'home' | 'dashboard' | 'about' | 'privacy' | 'repository' | 'practice';
}

const Footer = (_props: FooterProps) => (
  <footer style={{ background: '#453a2a' }} className="w-full py-10 px-4 sm:px-8 md:px-12 lg:py-16">
    <div className="max-w-screen-2xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-12 mb-10">
        <div>
          <Link href="/" style={{ fontFamily: "'Newsreader', serif" }} className="mb-2 inline-block text-2xl font-semibold tracking-tight transition-opacity hover:opacity-85">
            <span style={{ color: '#d5c4b1' }}>Case Compendium</span>
            <span style={{ color: '#aed0a1' }}>X</span>
          </Link>
          <p style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.5)', maxWidth: '280px', lineHeight: 1.6 }} className="text-xs">
            AI-powered case practice and performance analytics for consulting interviews.
          </p>
        </div>
        {/* Whitespace text nodes ({' '}) between links keep a scraped Google
            snippet from concatenating into "HomeThePlatformThe Team...". The
            flex gap controls the real spacing, so these spaces are visually inert. */}
        <div className="flex flex-wrap gap-x-12 gap-y-4">
          <Link href="/" style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }} className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all">
            Home
          </Link>{' '}
          <Link href="/about-ccx" style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }} className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all">
            The Platform
          </Link>{' '}
          <Link href="/our-story" style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }} className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all">
            The Team
          </Link>{' '}
          <Link href="/collaborators" style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }} className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all">
            Acknowledgements
          </Link>{' '}
          <a href="mailto:saksham@casecompendiumx.in?subject=Compendium%20X%20Enquiry" style={{ fontFamily: "'Work Sans', sans-serif", color: 'rgba(213,196,177,0.7)' }} className="text-[10px] tracking-[0.2em] uppercase hover:text-white transition-all">
            Contact Us
          </a>
        </div>
      </div>
      <div style={{ borderTop: '1px solid rgba(213,196,177,0.12)', paddingTop: '20px' }} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-8">
          <a href="https://www.linkedin.com/company/casecompendiumx" target="_blank" rel="noreferrer" style={{ color: 'rgba(213,196,177,0.7)' }} className="hover:text-white transition-all" title="LinkedIn">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
            </svg>
          </a>
          <a href="mailto:saksham@casecompendiumx.in" style={{ color: 'rgba(213,196,177,0.7)' }} className="hover:text-white transition-all" title="Email Us">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
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
);

export default Footer;
