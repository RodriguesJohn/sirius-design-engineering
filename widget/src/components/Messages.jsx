import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ThinkingAnimation } from "./ThinkingAnimation.jsx";

const fadeUp = {
  hidden: { opacity: 0, y: 4 },
  show: { opacity: 1, y: 0 },
};

const bubble = {
  hidden: { opacity: 0, y: 6, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1 },
};

export default function Messages({ items, typing, onAction }) {
  const scroller = useRef(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [items, typing, reduce]);

  return (
    <div id="rg-msgs" aria-live="polite" ref={scroller}>
      {items.map((item) => {
        if (item.kind === "sys") {
          return (
            <motion.div
              key={item.id}
              className="rg-sys"
              initial={reduce ? false : "hidden"}
              animate="show"
              variants={fadeUp}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              {item.text}
            </motion.div>
          );
        }

        const fromRight = item.role === "user";

        return (
          <div key={item.id} className={"rg-row " + item.role}>
            {item.role === "agent" && (
              <motion.div
                className="rg-label"
                initial={reduce ? false : "hidden"}
                animate="show"
                variants={fadeUp}
                transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
              >
                Human
              </motion.div>
            )}
            {item.role === "bot" && (
              <motion.div
                className="rg-label"
                initial={reduce ? false : "hidden"}
                animate="show"
                variants={fadeUp}
                transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
              >
                Sirius AI
              </motion.div>
            )}
            <motion.div
              className={"rg-b" + (item.image ? " rg-photo" : "") + (item.file && !item.image ? " rg-file" : "")}
              style={{ transformOrigin: fromRight ? "right bottom" : "left bottom" }}
              initial={reduce ? false : "hidden"}
              animate="show"
              variants={bubble}
              transition={{ type: "spring", duration: 0.6, bounce: 0, delay: 0.04 }}
            >
              {item.image && (
                <img src={item.image} alt={item.text ? "Attached image: " + item.text : "Attached image"} />
              )}
              {item.file && !item.image && (
                <div className="rg-file-row">
                  <span className="rg-file-mark" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M5 1.5h4.2L13 5.3V13.5H5a1.5 1.5 0 0 1-1.5-1.5V3A1.5 1.5 0 0 1 5 1.5z" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M9 1.6V5h3.3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="rg-file-copy">
                    <span className="rg-file-name">{item.file.name}</span>
                    <span className="rg-file-meta">{item.file.kind.toUpperCase()} · {item.file.size}</span>
                  </span>
                </div>
              )}
              {item.image && item.text && <div className="rg-photo-cap">{item.text}</div>}
              {!item.image && !item.file && item.text}
              {item.source && <div className="rg-src">From “{item.source}”</div>}
            </motion.div>
            {item.actions && (
              <motion.div
                className="rg-actions"
                initial={reduce ? false : "hidden"}
                animate="show"
                variants={fadeUp}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
              >
                {item.actions.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={"rg-chip" + (a.primary ? " primary" : "")}
                    onClick={() => onAction(item, a)}
                  >
                    {a.label}
                  </button>
                ))}
              </motion.div>
            )}
          </div>
        );
      })}
      {typing && (
        <div className="rg-row bot" id="rg-typing">
          <div className="rg-label">Sirius AI</div>
          <div className="rg-b rg-thinking">
            <ThinkingAnimation label="Thinking" size="sm" />
          </div>
        </div>
      )}
    </div>
  );
}
