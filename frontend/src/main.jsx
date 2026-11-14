import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { initTheme } from "./lib/theme";
import "./styles.css";

initTheme();

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

createRoot(container, {
  // Surface errors React catches/recovers from, so they hit your logger
  onCaughtError: (error, info) => console.error("[caught]", error, info.componentStack),
  onRecoverableError: (error) => console.warn("[recoverable]", error),
}).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);

// Fade out the loading shell defined in index.html
requestAnimationFrame(() => {
  const boot = document.getElementById("boot");
  if (!boot) return;
  boot.style.opacity = "0";
  boot.addEventListener("transitionend", () => boot.remove(), { once: true });
  setTimeout(() => boot.remove(), 600); // fallback if transitionend never fires
});

// Global safety nets
window.addEventListener("unhandledrejection", (e) => {
  console.error("[unhandled rejection]", e.reason);
});
