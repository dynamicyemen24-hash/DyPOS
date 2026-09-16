// (c) 2025 المنافذ الذكية للبرمجيات
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

const Tabs = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div className={cn("flex gap-1", className)} ref={ref} {...props} />
));
const TabsList = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div className={cn("flex gap-1 bg-gray-100 p-1 rounded-lg", className)} ref={ref} {...props} />
));
const TabsTrigger = forwardRef<HTMLButtonElement, React.HTMLAttributes<HTMLButtonElement>>(({ className, ...props }, ref) => (
  <button className={cn("px-3 py-1 text-sm rounded-md transition-colors", className)} ref={ref} {...props} />
));
const TabsContent = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div className={cn("", className)} ref={ref} {...props} />
));
export { Tabs, TabsList, TabsTrigger, TabsContent };
