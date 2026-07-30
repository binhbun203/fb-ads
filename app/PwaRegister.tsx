"use client";

import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaRegister() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    setInstalled(standalone);
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone);

    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const markInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  if (installed || (!prompt && !isIos)) return null;

  const install = async () => {
    if (prompt) {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setPrompt(null);
    } else {
      setShowIosHelp(true);
    }
  };

  return <>
    <button className="install-app" onClick={install} aria-label="Cài AdPilot lên điện thoại">
      <span>A</span><div><b>Cài ứng dụng AdPilot</b><small>Mở nhanh từ màn hình chính</small></div><em>↓</em>
    </button>
    {showIosHelp && <div className="install-help" onClick={() => setShowIosHelp(false)}>
      <section onClick={(event) => event.stopPropagation()}>
        <button aria-label="Đóng" onClick={() => setShowIosHelp(false)}>×</button>
        <div className="install-logo">A</div>
        <h2>Cài AdPilot trên iPhone</h2>
        <ol>
          <li>Nhấn nút <b>Chia sẻ</b> ở thanh công cụ Safari.</li>
          <li>Chọn <b>Thêm vào Màn hình chính</b>.</li>
          <li>Nhấn <b>Thêm</b> để hoàn tất.</li>
        </ol>
      </section>
    </div>}
  </>;
}
