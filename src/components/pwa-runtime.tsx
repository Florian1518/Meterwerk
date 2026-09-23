"use client";
import { useEffect, useState } from "react";
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
export function PwaRuntime() {
  const [offline, setOffline] = useState(false);
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        Boolean(
          (navigator as Navigator & { standalone?: boolean }).standalone,
        )),
  );
  const [iosInstall, setIosInstall] = useState(
    () =>
      typeof navigator !== "undefined" &&
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !(
        window.matchMedia("(display-mode: standalone)").matches ||
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
      ),
  );
  const [installing, setInstalling] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    const onOnline = () => {
      update();
      if (document.visibilityState === "visible") window.location.reload();
    };
    update();
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", update);
    window.addEventListener("beforeinstallprompt", onInstall);
    window.addEventListener("appinstalled", onInstalled);
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", update);
      window.removeEventListener("beforeinstallprompt", onInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  async function install() {
    if (!installEvent) return;
    setInstalling(true);
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
    } finally {
      setInstalling(false);
      setInstallEvent(null);
    }
  }
  return (
    <>
      {offline && (
        <div className="offline-banner" role="status">
          Offline: Es werden keine geschützten Live-Daten angezeigt.
          Schreibaktionen sind deaktiviert.
        </div>
      )}
      {installEvent && !installed && (
        <div className="install-banner" role="status">
          <span>Meterwerk auf diesem Gerät installieren?</span>
          <button className="button" onClick={install} disabled={installing}>
            {installing ? "Wird vorbereitet …" : "Installieren"}
          </button>
          <button
            className="button-secondary"
            onClick={() => setInstallEvent(null)}
          >
            Später
          </button>
        </div>
      )}
      {iosInstall && !offline && (
        <div className="install-banner" role="status">
          <span>
            Meterwerk installieren: Teilen und „Zum Home-Bildschirm“ wählen.
          </span>
          <button
            className="button-secondary"
            onClick={() => setIosInstall(false)}
          >
            Später
          </button>
        </div>
      )}
    </>
  );
}
