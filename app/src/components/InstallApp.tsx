"use client";

import { useState } from "react";
import { promptInstall, useInstallState } from "@/lib/install";
import { Button } from "./ui";

/** "Install Anvay" for Android and desktop Chrome, Share-menu steps for iPhone. Hidden once installed. */
export function InstallApp({ className = "" }: { className?: string }) {
  const state = useInstallState();
  const [showSteps, setShowSteps] = useState(false);
  if (state === "installed" || state === "unsupported") return null;

  return (
    <div className={`tint-warm flex flex-col gap-3 rounded-2xl border p-4 shadow-soft ${className}`}>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="h-11 w-11 rounded-xl shadow-soft" />
        <div className="flex flex-col">
          <p className="font-medium">Install the Anvay app</p>
          <p className="text-xs text-muted">Opens from your home screen, full screen, in one tap.</p>
        </div>
      </div>
      {state === "prompt" ? (
        <Button onClick={promptInstall}>Install Anvay</Button>
      ) : showSteps ? (
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted">
          <li>
            Tap the <span className="font-medium text-foreground">Share</span> button in Safari.
          </li>
          <li>
            Choose <span className="font-medium text-foreground">Add to Home Screen</span>, then{" "}
            <span className="font-medium text-foreground">Add</span>.
          </li>
        </ol>
      ) : (
        <Button variant="secondary" onClick={() => setShowSteps(true)}>
          How to install on iPhone
        </Button>
      )}
    </div>
  );
}
