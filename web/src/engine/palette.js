// Flat, high-contrast colours used to paint the clusters (hex strings).
export const PALETTE = [
  "#FFD23F", // yellow
  "#FF5C39", // orange-red
  "#FF9EC4", // pink
  "#5BD08A", // green
  "#111111", // black
  "#4FA3E0", // sky
  "#F4EFE3", // cream
  "#B5651D", // brown
  "#2A9D8F", // teal
  "#E63946", // red
];

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
