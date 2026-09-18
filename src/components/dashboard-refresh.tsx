"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function DashboardRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [router]);
  return (
    <p className="text-sm text-muted-foreground">
      Automatische Aktualisierung alle 5 Sekunden · Berichtszeitzone UTC
    </p>
  );
}
