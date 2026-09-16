// (c) 2025 المنافذ الذكية للبرمجيات
import { CardHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

const Card = forwardRef<HTMLDivElement, CardHTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div className={cn("rounded-xl border bg-white shadow-sm", className)} ref={ref} {...props} />
));
const CardHeader = forwardRef<HTMLDivElement, CardHTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div className={cn("flex flex-col space-y-1.5 p-6", className)} ref={ref} {...props} />
));
const CardContent = forwardRef<HTMLDivElement, CardHTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div className={cn("p-6 pt-0", className)} ref={ref} {...props} />
));
const CardTitle = forwardRef<HTMLHeadingElement, CardHTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h3 className={cn("text-lg font-semibold leading-none tracking-tight", className)} ref={ref} {...props} />
));
export { Card, CardHeader, CardContent, CardTitle };
