// (c) 2025 المنافذ الذكية للبرمجيات
import { cn } from "@/lib/utils";
import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";

const Select = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div className={cn("relative", className)} ref={ref} {...props} />
));
const SelectTrigger = forwardRef<HTMLButtonElement, React.HTMLAttributes<HTMLButtonElement>>(({ className, children, ...props }, ref) => (
  <button className={cn("flex h-10 w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm", className)} ref={ref} {...props}>
    {children}
    <ChevronDown className="w-4 h-4" />
  </button>
));
const SelectContent = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div className={cn("bg-white rounded-lg shadow-xl border", className)} ref={ref} {...props} />
));
const SelectItem = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, children, ...props }, ref) => (
  <div className={cn("px-3 py-2 text-sm cursor-pointer hover:bg-gray-100", className)} ref={ref} {...props}>{children}</div>
));
const SelectValue = forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(({ className, ...props }, ref) => (
  <span className={cn("text-sm text-gray-500", className)} ref={ref} {...props} />
));
export { Select, SelectTrigger, SelectContent, SelectItem, SelectValue };
