export default function Header({ onClose }) {
  return (
    <div id="rg-head">
      <div id="rg-mark">
        <div id="rg-brand">Sirius AI</div>
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
