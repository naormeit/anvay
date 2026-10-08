"use client";

import { useSyncExternalStore } from "react";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * Chrome and Edge fire `beforeinstallprompt` once, often before any component mounts, so it is captured here at load
 * and kept for the install button. Safari never fires it; iPhone users add Anvay from the Share menu instead.
 */
let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
}

export type InstallState = "installed" | "prompt" | "ios" | "unsupported";

function snapshot(): InstallState {
  if (installed || window.matchMedia("(display-mode: standalone)").matches) return "installed";
  if ((navigator as { standalone?: boolean }).standalone) return "installed";
  if (deferred) return "prompt";
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return "ios";
  return "unsupported";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether and how Anvay can be installed on this device. "unsupported" during server rendering. */
export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, snapshot, () => "unsupported");
}

/** Show the browser's install dialog (Chrome and Edge). */
export async function promptInstall() {
  if (!deferred) return;
  const event = deferred;
  deferred = null;
  await event.prompt();
  await event.userChoice.catch(() => undefined);
  notify();
}
