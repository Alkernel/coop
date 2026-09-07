import React from 'react';

export const XIcon: React.FC<{ size?: number; className?: string; color?: string }> = ({ 
  size = 18, 
  className = '', 
  color = 'currentColor' 
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 4l16 16m0-16L4 20" />
    </svg>
  );
};
