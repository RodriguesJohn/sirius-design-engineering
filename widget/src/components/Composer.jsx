import { useRef } from "react";

const ACCEPT = "image/*,.pdf,.doc,.docx,.txt,.csv,.rtf,application/pdf";

export default function Composer({ draft, setDraft, onSend, onAttach, onPrompt, prompts, inputRef }) {
  const fileRef = useRef(null);

  function pickFile(file) {
    if (!file) return;
    onAttach(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div id="rg-foot">
      {prompts && prompts.length > 0 && (
        <div id="rg-prompts" role="group" aria-label="Suggested questions">
          {prompts.map((p) => (
            <button
              key={p.id}
              type="button"
              className="rg-prompt"
              onClick={() => onPrompt(p.label)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      <form
        id="rg-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
        onPaste={(e) => {
          const files = [...(e.clipboardData && e.clipboardData.files ? e.clipboardData.files : [])];
          const file = files[0];
          if (!file) return;
          e.preventDefault();
          pickFile(file);
        }}
      >
        <div id="rg-field">
          <button
            type="button"
            id="rg-attach"
            aria-label="Attach a file"
            onClick={() => fileRef.current && fileRef.current.click()}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="M15.15 8.35 8.7 14.8a3.85 3.85 0 0 1-5.45-5.45l6.6-6.6a2.55 2.55 0 0 1 3.6 3.6L6.9 12.9a1.25 1.25 0 1 1-1.77-1.77l5.55-5.55"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <input
            id="rg-in"
            ref={inputRef}
            type="text"
            placeholder="Ask a question"
            autoComplete="off"
            enterKeyHint="send"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <input
            id="rg-file"
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => pickFile(e.target.files && e.target.files[0])}
          />
          <button id="rg-send" type="submit">Send</button>
        </div>
      </form>
    </div>
  );
}
