import React from 'react';

export default function RarityBadge({ badge, size = 22 }) {
  if (!badge) return null;

  const style = {
    width: size,
    height: size,
    color: badge.color,
    display: 'block',
  };

  switch (badge.shape) {
    case 'circle':
      return (
        <svg viewBox="0 0 24 24" style={style} aria-label="Common">
          <circle cx="12" cy="12" r="8" fill="currentColor" />
        </svg>
      );

    case 'triangle':
      return (
        <svg viewBox="0 0 24 24" style={style} aria-label="Uncommon">
          <path d="M12 4 L20 19 H4 Z" fill="currentColor" />
        </svg>
      );

    case 'square':
      return (
        <svg viewBox="0 0 24 24" style={style} aria-label="Rare">
          <rect x="6" y="6" width="12" height="12" fill="currentColor" rx="1.5" />
        </svg>
      );

    case 'star':
      return (
        <svg viewBox="0 0 24 24" style={style} aria-label="Legendary">
          <path
            d="M12 3.5l2.6 5.9 6.4.6-4.8 4.1 1.5 6.2L12 17.9 6.3 20.3l1.5-6.2L3 10l6.4-.6L12 3.5z"
            fill="currentColor"
          />
        </svg>
      );

    case 'delta':
      return (
        <svg viewBox="0 0 24 24" style={style} aria-label="Delta Species">
          <path d="M12 4 L20 20 H4 Z" fill="none" stroke="currentColor" strokeWidth="3" />
        </svg>
      );

    default:
      return null;
  }
}
