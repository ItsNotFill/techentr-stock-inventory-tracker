"use client";

import { useCallback, useEffect, useRef } from "react";

const MIN_HEIGHT = 320;
const FALLBACK_HEIGHT = 640;

/**
 * Shows an e-mail's HTML in a sandboxed frame that is as tall as the e-mail.
 * `allow-same-origin` only lets this page measure the frame; without
 * `allow-scripts` nothing inside it can run.
 */
export function EmailFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);

  const measure = useCallback(() => {
    const frame = ref.current;
    const root = frame?.contentDocument?.documentElement;
    if (!frame || !root) return;
    // scrollHeight never drops below the frame's own height: shrink it first.
    frame.style.height = `${MIN_HEIGHT}px`;
    frame.style.height = `${Math.max(MIN_HEIGHT, root.scrollHeight)}px`;
  }, []);

  useEffect(() => {
    window.addEventListener("resize", measure);
    // The frame may have loaded before this effect ran.
    measure();
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return (
    <iframe
      ref={ref}
      sandbox="allow-same-origin"
      srcDoc={html}
      title="E-mail preview"
      onLoad={measure}
      style={{ height: FALLBACK_HEIGHT }}
      className="w-full max-w-[640px] rounded-lg border border-border bg-card"
    />
  );
}
