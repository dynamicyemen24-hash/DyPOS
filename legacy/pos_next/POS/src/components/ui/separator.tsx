// (c) 2025 المنافذ الذكية للبرمجيات
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

const Separator = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div className={cn("shrink-0 bg-border", className)} ref={ref} {...props} />
));
export { Separator };
