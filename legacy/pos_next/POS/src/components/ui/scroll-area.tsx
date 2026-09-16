// (c) 2025 المنافذ الذكية للبرمجيات
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

const ScrollArea = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div className={cn("overflow-auto", className)} ref={ref} {...props} />
));
export { ScrollArea };
