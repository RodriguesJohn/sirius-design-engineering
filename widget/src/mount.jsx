import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import tokens from "../styles/tokens.css?raw";
import chrome from "../styles/widget.css?raw";
import thinking from "./components/thinking-animation.css?raw";

const SCRIPT_DIR = (document.currentScript && document.currentScript.src)
  ? document.currentScript.src.replace(/[^/?#]+(?:[?#].*)?$/, "")
  : "../widget/";
const ARTICLES_URL = new URL("../helpdesk/articles.json", SCRIPT_DIR).href;

function injectCss(css) {
  const s = document.createElement("style");
  s.textContent = css;
  document.head.appendChild(s);
}

injectCss(`
@font-face {
  font-family: Aeonik;
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("${new URL("fonts/Aeonik-Regular.woff2", SCRIPT_DIR).href}") format("woff2");
}
@font-face {
  font-family: Satoshi;
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("${new URL("fonts/Satoshi-Regular.woff2", SCRIPT_DIR).href}") format("woff2");
}
`);
injectCss(tokens + "\n" + chrome + "\n" + thinking);

const host = document.createElement("div");
document.body.appendChild(host);
createRoot(host).render(<App articlesUrl={ARTICLES_URL} />);
