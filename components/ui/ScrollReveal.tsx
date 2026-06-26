'use client';

import React from 'react';

const ScrollReveal = ({ children, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) => (
  <div className={className}>{children}</div>
);

export default ScrollReveal;
