"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Uppdaterar server-komponentens data periodiskt (för live-matcher).
// Pausar när fliken är dold för att spara resurser.
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
