export const BALLS = [
  { key: 'poke',  label: 'Poké Ball',  modifier: 1.0, alwaysCatch: false },
  { key: 'great', label: 'Great Ball', modifier: 1.5, alwaysCatch: false },
  { key: 'ultra', label: 'Ultra Ball', modifier: 2.0, alwaysCatch: false },
  { key: 'master',label: 'Master Ball',modifier: 255.0, alwaysCatch: true },
];

export function calcCatchChance(captureRate, ball) {
  if (ball.alwaysCatch) return 1;
  const chance = (captureRate * ball.modifier) / 255;
  return Math.max(0, Math.min(1, chance));
}

export function applyPity(chance, pityMultiplier) {
  const capped = Math.min(0.99, chance * pityMultiplier);
  return Math.max(0, Math.min(0.99, capped));
}
