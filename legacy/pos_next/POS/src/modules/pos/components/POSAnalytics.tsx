// (c) 2025 المنافذ الذكية للبرمجيات
import { POSAnalyticsData } from "../types";
import { DollarSign, ShoppingCart, Package, Users, TrendingUp } from "lucide-react";

interface POSAnalyticsProps {
  stats: POSAnalyticsData | null;
}

export function POSAnalytics({ stats }: POSAnalyticsProps) {
  const defaultStats: POSAnalyticsData = {
    todaySales: 0, todayTransactions: 0, todayProductsSold: 0, activeCustomers: 0,
    revenueTrend: [], topProducts: [], paymentMethods: [], hourlySales: [],
  };
  const data = stats || defaultStats;

  const cards = [
    { title: "مبيعات اليوم", value: `${data.todaySales} ر.س`, icon: DollarSign, color: "text-green-600", change: "+12.5%" },
    { title: "المعاملات", value: `${data.todayTransactions}`, icon: ShoppingCart, color: "text-blue-600", change: "+8.2%" },
    { title: "المنتجات المباعة", value: `${data.todayProductsSold}`, icon: Package, color: "text-purple-600", change: "+15.3%" },
    { title: "العملاء النشطون", value: `${data.activeCustomers}`, icon: Users, color: "text-orange-600", change: "+3.1%" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        {cards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.title} className="bg-white rounded-xl p-4 shadow-sm border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{stat.title}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                  <p className={`text-sm mt-1 ${stat.color}`}>
                    <TrendingUp className="inline h-3 w-3 mr-1" />
                    {stat.change}
                  </p>
                </div>
                <Icon className={`h-8 w-8 ${stat.color}`} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="bg-white rounded-xl p-4 shadow-sm border">
        <h3 className="font-bold text-gray-800 mb-3">المنتجات الأكثر مبيعاً</h3>
        <div className="space-y-2">
          {(data.topProducts.length > 0 ? data.topProducts : [{ name: "لم تظهر بيانات بعد", quantity: 0, revenue: 0 }]).map((product, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="font-medium text-sm">{product.name}</span>
              <span className="text-sm text-gray-500">{product.quantity} وحدة</span>
              <span className="text-sm font-bold text-green-600">{product.revenue} ر.س</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
