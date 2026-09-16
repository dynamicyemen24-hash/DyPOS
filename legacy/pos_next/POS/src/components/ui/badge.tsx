// (c) 2025 المنافذ الذكية للبرمجيات
import { BadgeHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

const Badge = forwardRef<HTMLSpanElement, BadgeHTMLAttributes<HTMLSpanElement>>(({ className, variant = "default", ...props }, ref) => (
  <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", className)} ref={ref} {...props} />
));
Badge.displayName = "Badge";
export { Badge };
