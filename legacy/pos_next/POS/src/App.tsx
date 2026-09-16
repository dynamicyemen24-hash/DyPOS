// (c) 2025 المنافذ الذكية للبرمجيات
import { useState } from "react";
import { POSPage } from "@/modules/pos/POSPage";
import { OfflineProvider } from "@/lib/offline/OfflineContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <OfflineProvider>
          <POSPage />
        </OfflineProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
