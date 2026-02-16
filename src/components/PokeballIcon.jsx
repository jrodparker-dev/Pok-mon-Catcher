import React from 'react'

// Simple original SVG icons (no copyrighted images)
export default function PokeballIcon({ variant = 'poke', size = 64 }) {
  const s = size;
  const stroke = 4;
  const cx = s/2, cy = s/2;
  const r = (s - stroke)/2;

  // palette per ball type
  const top = {
    poke: '#e53935',
    great: '#1976d2',
    ultra: '#212121',
    master: '#6a1b9a',
  }[variant] || '#e53935';

  const band = {
    poke: '#111',
    great: '#111',
    ultra: '#fdd835',
    master: '#111',
  }[variant] || '#111';

  const accent = {
    poke: '#fff',
    great: '#e53935',
    ultra: '#111',
    master: '#f48fb1',
  }[variant] || '#fff';

  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      role="img"
      aria-label={`${variant} ball`}
      style={{ display: 'block' }}
    >
      {/* outer */}
      <circle cx={cx} cy={cy} r={r} fill="#fff" stroke="#111" strokeWidth={stroke} />
      {/* top half */}
      <path d={`M ${stroke/2} ${cy} A ${r} ${r} 0 0 1 ${s-stroke/2} ${cy} L ${s-stroke/2} ${stroke/2} L ${stroke/2} ${stroke/2} Z`}
            fill={top} />
      {/* band */}
      <rect x={stroke/2} y={cy - (stroke*1.25)} width={s-stroke} height={stroke*2.5} fill={band} />
      {/* center button */}
      <circle cx={cx} cy={cy} r={r*0.22} fill="#fff" stroke="#111" strokeWidth={stroke} />
      <circle cx={cx} cy={cy} r={r*0.10} fill={accent} />
      {/* highlight */}
      <path d={`M ${cx - r*0.45} ${cy - r*0.55} C ${cx - r*0.2} ${cy - r*0.8}, ${cx + r*0.1} ${cy - r*0.75}, ${cx + r*0.25} ${cy - r*0.55}`}
            stroke="rgba(255,255,255,0.6)" strokeWidth={stroke} fill="none" strokeLinecap="round"/>
    </svg>
  );
}
