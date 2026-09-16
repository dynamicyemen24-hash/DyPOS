// (c) 2025 المنافذ الذكية للبرمجيات
import { cn } from "@/lib/utils";
import { forwardRef, useState } from "react";

const Checkbox = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input type="checkbox" className={cn("rounded border-gray-300 text-blue-600", className)} ref={ref} {...props} />
));
export { Checkbox };
