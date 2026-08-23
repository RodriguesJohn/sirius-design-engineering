import BrandShader from "./BrandShader.jsx";

export default function Bubble({ open, waiting, onToggle }) {
  return (
    <button
      id="rg-bubble"
      type="button"
      aria-expanded={open}
      aria-controls="rg-panel"
      aria-label={open ? "Close Sirius" : "Open Sirius"}
      data-waiting={waiting ? "true" : undefined}
      onClick={onToggle}
    >
      <BrandShader live mode="orb" />
      <span id="rg-dot" aria-hidden="true" />
    </button>
  );
}
