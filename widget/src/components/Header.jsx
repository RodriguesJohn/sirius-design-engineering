import BrandShader from "./BrandShader.jsx";

export default function Header({ onClose, live }) {
  return (
    <div id="rg-head">
      <BrandShader live={live} mode="banner" />
      <div id="rg-mark">
        <div id="rg-brand">Sirius</div>
      </div>
      <div id="rg-tools">
        <button type="button" id="rg-close" aria-label="Close chat" onClick={onClose}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
