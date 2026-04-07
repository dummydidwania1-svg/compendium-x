import React from 'react';

const TieLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
<path d="M12 2L9 7L11 12L9 22H15L13 12L15 7L12 2Z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
<path d="M10.5 7H13.5" stroke="var(--bg-base)" strokeWidth="1.5" strokeLinecap="round"/>
</svg>
);

export default TieLogo;