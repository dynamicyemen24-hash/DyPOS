// (c) 2025 المنافذ الذكية للبرمجيات
import { Package } from "lucide-react";
import { COMPANY } from "@/lib/offline/branding";
import { useTheme } from "@/hooks/useTheme";

export function BrandLogo() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div
      className="flex items-center gap-3"
      dir="rtl"
      role="img"
      aria-label={`${COMPANY.nameEn} - ${COMPANY.name} - ${isDark ? "الوضع الداكن" : "الوضع الفاتح"}`}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg"
        style={{
          backgroundColor: isDark ? "#1E40AF" : COMPANY.color,
          boxShadow: isDark ? "0 0 20px rgba(30, 64, 175, 0.4)" : `0 4px 12px ${COMPANY.color}40`,
        }}
        aria-hidden="true"
      >
        <Package className="w-6 h-6" />
      </div>
      <div>
        <h1
          className="font-bold text-lg leading-tight"
          style={{ fontFamily: "var(--font-arabic)", color: "var(--color-text)" }}
          dir="rtl"
          lang="ar"
        >
          {COMPANY.name}
        </h1>
        <p
          className="text-xs opacity-70"
          style={{ fontFamily: "var(--font-english)", color: "var(--color-text-secondary)" }}
          dir="ltr"
          lang="en"
        >
          Smart Ports POS v1.16.0
        </p>
      </div>
    </div>
  );
}
