/* Keep WebGL in lockstep with widget/styles/tokens.css primitives. */

export const BRAND = {
  beige: "#F1EEE9",
  white: "#FFFFFF",
  graphite: "#303030",
  grey: "#616161",
  ice: "#C1E9EC",
  wine: "#79182C",
  clay: "#B86B67",
};

export function hexRgb(hex) {
  const n = String(hex).replace("#", "");
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
}

export const BRAND_RGB = Object.fromEntries(
  Object.entries(BRAND).map(([name, hex]) => [name, hexRgb(hex)])
);
