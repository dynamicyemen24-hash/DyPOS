// (c) 2025 المنافذ الذكية للبرمجيات
import { DialogHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

const Dialog = forwardRef<HTMLDivElement, DialogHTMLAttributes<HTMLDivElement>>(({ className, children, ...props }, ref) => (
  <div className={cn("fixed inset-0 z-50 flex items-center justify-center", className)} ref={ref} {...props}>{children}</div>
));
const DialogContent = forwardRef<HTMLDivElement, DialogHTMLAttributes<HTMLDivElement>>(({ className, children, ...props }, ref) => (
  <div className={cn("fixed inset-4 z-50 max-w-lg w-full mx-auto bg-white rounded-xl shadow-2xl", className)} ref={ref} {...props}>{children}</div>
));
const DialogHeader = forwardRef<HTMLDivElement, DialogHTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div className={cn("flex flex-col space-y-1.5 p-6", className)} ref={ref} {...props} />
));
const DialogTitle = forwardRef<HTMLHeadingElement, DialogHTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h2 className={cn("text-lg font-semibold leading-none", className)} ref={ref} {...props} />
));
const DialogFooter = forwardRef<HTMLDivElement, DialogHTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div className={cn("flex justify-end gap-2 p-6", className)} ref={ref} {...props} />
));
export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter };
