'use client';

import React from 'react';

const GlobalStyles = () => (

<style>{`

/* Consistent typography scale */
.eyebrow {
  font-family: 'Work Sans', system-ui, sans-serif;
  font-size: 10px;
  letter-spacing: 0.12em;
  font-weight: 600;
  text-transform: uppercase;
  color: #3D5A35;
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.glass-card h3 {
  font-family: 'Newsreader', Georgia, serif;
  font-size: 13px;
  font-weight: 500;
  color: #3B2F2F;
  letter-spacing: -0.01em;
}

.glass-card table th {
  font-family: 'Work Sans', system-ui, sans-serif;
  font-size: 10px;
  letter-spacing: 0.1em;
  font-weight: 600;
  text-transform: uppercase;
  color: rgba(92, 64, 51, 0.5);
}

.glass-card table td {
  font-family: 'Work Sans', system-ui, sans-serif;
  font-size: 12px;
  color: #3B2F2F;
}

/* Score numbers use serif */
.font-serif {
  font-family: 'Newsreader', Georgia, serif;
}

/* Recharts label consistency */
.recharts-text {
  font-family: 'Work Sans', system-ui, sans-serif !important;
  font-size: 10px !important;
  fill: rgba(92, 64, 51, 0.6) !important;
}

:root {
  --primary-dark: #3B2F2F;
  --primary-warm: #5C4033;
  --bg-base: #fff8f0;
  --bg-subtle: #f4ede3;
  --accent-pop: #3D5A35;
}

body {
  font-family: 'Work Sans', system-ui, -apple-system, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  color: #3B2F2F;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.font-sans { font-family: 'Work Sans', sans-serif; }
.font-serif { font-family: 'Newsreader', serif; }

.glass-card {
  background: rgba(255, 248, 240, 0.8);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(61, 90, 53, 0.10);
  border-radius: 1rem;
  box-shadow: 0 4px 12px rgba(59, 47, 47, 0.04);
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(92, 64, 51, 0.15);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(92, 64, 51, 0.3);
}

@keyframes rise {
  0% { opacity: 0; transform: translateY(24px); }
  100% { opacity: 1; transform: translateY(0); }
}

@keyframes scale-in {
  0% { opacity: 0; transform: scale(0.95) translateY(10px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
.animate-scale-in {
  animation: scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes hint-pulse {
  0%, 100% { background-color: transparent; }
  50% { background-color: rgba(61, 90, 53, 0.12); border-radius: 0.375rem; }
}

.radial-bg {
  background: radial-gradient(circle at top right, rgba(61,90,53,0.06), transparent 40%),
              radial-gradient(circle at bottom left, rgba(92,64,51,0.05), transparent 40%);
}

/* Range slider custom styling */
input[type=range] {
  -webkit-appearance: none;
  width: 100%;
  background: transparent;
}
input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  height: 16px;
  width: 16px;
  border-radius: 50%;
  background: var(--primary-dark);
  cursor: pointer;
  margin-top: -6px;
}
input[type=range]::-webkit-slider-runnable-track {
  width: 100%;
  height: 4px;
  cursor: pointer;
  background: rgba(92, 64, 51, 0.2);
  border-radius: 2px;
}
`}</style>

);

export default GlobalStyles;