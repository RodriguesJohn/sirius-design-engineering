export default function Bubble({ open, waiting, onToggle }) {
  return (
    <button
      id="rg-bubble"
      type="button"
      aria-expanded={open}
      aria-controls="rg-panel"
      aria-label={open ? "Close Sirius AI" : "Open Sirius AI"}
      data-waiting={waiting ? "true" : undefined}
      onClick={onToggle}
    >
      <svg className="rg-chat" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          className="rg-chat-shape"
          d="M12 5h8a8 8 0 0 1 8 8v14H12A8 8 0 0 1 4 19V13A8 8 0 0 1 12 5Z"
        />
        <circle className="rg-chat-dot" cx="11.5" cy="15.5" r="1.4" />
        <circle className="rg-chat-dot" cx="16" cy="15.5" r="1.4" />
        <circle className="rg-chat-dot" cx="20.5" cy="15.5" r="1.4" />
      </svg>
      <span id="rg-dot" aria-hidden="true" />
    </button>
  );
}
