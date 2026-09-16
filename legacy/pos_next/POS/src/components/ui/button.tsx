// (c) 2025 المنافذ الذكية للبرمجيات
import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
          variant === "default" && "bg-blue-600 text-white hover:bg-blue-700",
          variant === "destructive" && "bg-red-600 text-white hover:bg-red-700",
          variant === "outline" && "border border-gray-300 bg-white hover:bg-gray-50",
          variant === "secondary" && "bg-gray-100 text-gray-700 hover:bg-gray-200",
          variant === "ghost" && "hover:bg-gray-100",
          size === "sm" && "h-8 px-3 text-xs",
          size === "default" && "h-10 px-4",
          size === "lg" && "h-12 px-6 text-lg",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
export { Button };
