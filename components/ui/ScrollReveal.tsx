'use client';

import React, { useState, useEffect, useRef } from 'react';

const ScrollReveal = ({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.05, rootMargin: '0px 0px -30px 0px' }
    );

    const timer = setTimeout(() => observer.observe(el), delay * 0.5);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, [delay]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(16px)',
        transition: `opacity 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay * 0.3}ms, transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay * 0.3}ms`,
        willChange: 'opacity, transform',
      }}
    >
      {children}
    </div>
  );
};

export default ScrollReveal;