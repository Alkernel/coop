import React from 'react';

interface CoopLogoProps {
  size?: number;
  className?: string;
  glow?: boolean;
  animated?: boolean;
}

export const CoopLogo: React.FC<CoopLogoProps> = ({ 
  size = 40, 
  className = '', 
  glow = false,
  animated = false 
}) => {
  return (
    <div 
      className={`coop-logo-wrapper ${glow ? 'logo-glow' : ''} ${animated ? 'logo-pulsing' : ''} ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <defs>
          <linearGradient id="coopGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--logo-gradient-start, #ffffff)" />
            <stop offset="100%" stopColor="var(--logo-gradient-end, #a1a1aa)" />
          </linearGradient>
          <filter id="coopShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="rgba(255,255,255,0.2)" />
          </filter>
        </defs>

        {/* Outer Circular Track with Accent Gap */}
        <circle
          cx="50"
          cy="50"
          r="42"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray="210 55"
          transform="rotate(-40 50 50)"
        />

        {/* Central Bold Token Symbol */}
        <path
          d="M62 38C58.5 33.5 53 31 46.5 31C35.5 31 27 39.5 27 50C27 60.5 35.5 69 46.5 69C53 69 58.5 66.5 62 62"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinecap="round"
        />

        {/* Mining / Crypto Node Connectors */}
        <circle cx="50" cy="18" r="4.5" fill="currentColor" />
        <circle cx="50" cy="82" r="4.5" fill="currentColor" />
        <line x1="50" y1="18" x2="50" y2="30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <line x1="50" y1="70" x2="50" y2="82" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />

        {/* Center Core Dot */}
        <circle cx="50" cy="50" r="5" fill="currentColor" />
      </svg>
    </div>
  );
};
