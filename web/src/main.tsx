import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./router/App";
import "./styles.css";

function setupViewportFixes() {
  // iOS Safari: 100vh / address bar muammosi
  const setVh = () => {
    document.documentElement.style.setProperty("--vh", `${window.innerHeight * 0.01}px`);
  };
  setVh();
  window.addEventListener("resize", setVh, { passive: true });
  window.addEventListener("orientationchange", setVh, { passive: true });

  const ua = navigator.userAgent || "";

  // iPad/iPhone aniqlash
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);

  // Safari aniqlash (macOS Safari ham kiradi)
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);

  if (isIOS) document.documentElement.classList.add("ios");

  return { isIOS, isSafari };
}

const env = setupViewportFixes();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// PWA: Service Worker register (Firebase Hosting HTTPS)
if ("serviceWorker" in navigator) {
  // Safari'da SW cache ba'zan stale bundle berib, app ochilishini sekinlashtiradi.
  // Safari uchun SW'ni o'chiramiz. Cache tozalash faqat 1 marta bajariladi.
  window.addEventListener("load", async () => {
    try {
      if (env.isSafari || env.isIOS) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));

        const cleanupKey = "ali_sw_cleanup_v2";
        const alreadyCleaned = localStorage.getItem(cleanupKey) === "1";
        if (!alreadyCleaned && "caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
          localStorage.setItem(cleanupKey, "1");
        }
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      // Har safar yangilanishni tekshirish
      try {
        await reg.update();
      } catch {}
    } catch (e) {
      // SW xatosi app ishlashiga halaqit qilmasin
      console.warn("SW register failed", e);
    }
  });

  // Yangi SW aktiv bo'lsa, sahifani yangilab olamiz (stale bundle muammosi kamayadi)
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}
