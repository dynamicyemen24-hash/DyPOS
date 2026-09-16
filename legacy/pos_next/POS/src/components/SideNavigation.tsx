// (c) 2025 المنافذ الذكية للبرمجيات
import { ShoppingCart, Package, BarChart3, Settings } from "lucide-react";

interface SideNavigationProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

const menuItems = [
  { key: "sales", label: "البيع", icon: ShoppingCart },
  { key: "products", label: "المنتجات", icon: Package },
  { key: "dashboard", label: "لوحة التحكم", icon: BarChart3 },
  { key: "settings", label: "الإعدادات", icon: Settings },
];

export function SideNavigation({ activeSection, onSectionChange }: SideNavigationProps) {
  return (
    <nav className="w-56 bg-white border-l border-gray-200 p-4 space-y-2">
      {menuItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            onClick={() => onSectionChange(item.key)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              activeSection === item.key ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Icon className="w-5 h-5" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
