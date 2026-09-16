// (c) 2025 المنافذ الذكية للبرمجيات
import { useState, useCallback, useEffect, useMemo } from "react";
import { POSProduct, POSCustomer } from "./types";
import { usePOSCart } from "./hooks/usePOSCart";
import { usePOSSession } from "./hooks/usePOSSession";
import { usePOSNotifications } from "./hooks/usePOSNotifications";
import { usePOSProductSearch } from "./hooks/usePOSProductSearch";
import { usePOSCustomerLookup } from "./hooks/usePOSCustomerLookup";
import { usePOSAnalytics } from "./hooks/usePOSAnalytics";
import { usePOSRecommendations } from "./hooks/usePOSRecommendations";
import { usePOSUnifiedSearch } from "./hooks/usePOSUnifiedSearch";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { OfflineBanner } from "@/components/OfflineBanner";
import { Package, ShoppingCart, Barcode, Power } from "lucide-react";
import { POSAnalytics } from "./components/POSAnalytics";
import { ProductCatalog } from "./components/ProductCatalog";
import { Cart } from "./components/Cart";
import { CustomerLookup } from "./components/CustomerLookup";
import { DigitalReceipt } from "./components/DigitalReceipt";
import { UnifiedSearchBar } from "./components/UnifiedSearchBar";
import { BatchEntryModal } from "./components/BatchEntryModal";
import { SerialEntryModal } from "./components/SerialEntryModal";
import { VariantSelectorModal } from "./components/VariantSelectorModal";
import { QuickSaleButton } from "./components/QuickSaleButton";
import { RecommendationsPanel } from "./components/RecommendationsPanel";
import { formatCurrency, getBrandLabel } from "./utils/currency";
import { createHold } from "./utils/holdManager";
import { useOffline } from "@/lib/offline/OfflineContext";

type POSView = "sales" | "products" | "dashboard" | "analytics" | "receipt";

export function POSPage() {
  const [activeView, setActiveView] = useState<POSView>("sales");
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showBatchEntry, setShowBatchEntry] = useState(false);
  const [showSerialEntry, setShowSerialEntry] = useState(false);
  const [showVariantSelector, setShowVariantSelector] = useState(false);

  const {
    items, discount, setDiscount, taxRate, subtotal, total, itemCount,
    addItem, removeItem, updateQuantity, clearCart,
  } = usePOSCart();

  const { session, isActive: sessionActive, startSession, endSession } = usePOSSession();
  const { success, warning, info } = usePOSNotifications();
  const { isOnline: offlineOnline } = useOffline();

  const [products, setProducts] = useState<POSProduct[]>([]);
  const [customers, setCustomers] = useState<POSCustomer[]>([]);

  const { searchQuery, searchResults, filterByCategory, selectedCategory } = usePOSProductSearch(products);
  const { selectedCustomer, selectCustomer, filteredCustomers, lookup: lookupCustomer } = usePOSCustomerLookup(customers);
  const { analytics, getTodaySales, getTransactionCount } = usePOSAnalytics();
  const { recommendations } = usePOSRecommendations(items);
  const { results: unifiedResults } = usePOSUnifiedSearch(products, customers);

  useEffect(() => {
    const stored = localStorage.getItem("sp_pos_products");
    if (stored) setProducts(JSON.parse(stored));
    const storedCustomers = localStorage.getItem("sp_pos_customers");
    if (storedCustomers) setCustomers(JSON.parse(storedCustomers));
    startSession("cashier-001", localStorage.getItem("sp_tenant_id"));
  }, []);

  useEffect(() => {
    localStorage.setItem("sp_pos_products", JSON.stringify(products));
  }, [products]);
  useEffect(() => {
    localStorage.setItem("sp_pos_customers", JSON.stringify(customers));
  }, [customers]);

  const handleBarcodeScan = useCallback((barcode: string) => {
    const product = products.find((p) => p.barcode === barcode || p.code === barcode);
    if (product) {
      addItem(product);
      success(getBrandLabel("item") + " " + product.name, "تمت الإضافة");
    } else {
      warning(getBrandLabel("item"), `لا يوجد منتج بالباركود: ${barcode}`);
    }
    setShowBarcodeScanner(false);
  }, [products, addItem, success, warning]);

  const handleProductClick = useCallback((product: POSProduct) => {
    addItem(product);
    success(getBrandLabel("item") + " " + product.name, "تمت الإضافة");
  }, [addItem, success]);

  const handleHold = useCallback(() => {
    if (!session) return;
    const hold = createHold(items, "cashier-001", selectedCustomer?.id);
    info(getBrandLabel("hold"), `تم حفظ الجلسة: ${hold.id.slice(0, 8)}`);
  }, [items, session, selectedCustomer, info]);

  const handleCompleteSale = useCallback(() => {
    if (items.length === 0) {
      warning(getBrandLabel("invoice"), `لا توجد أصناف في السلة`);
      return;
    }
    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
    setActiveView("receipt");
    success(getBrandLabel("invoice"), `تم إنشاء الفاتورة: ${invoiceNumber}`);
  }, [items, subtotal, discount, taxRate, total, selectedCustomer, session, success]);

  const dashboardStats = useMemo(() => ({
    todaySales: getTodaySales(), todayTransactions: getTransactionCount(),
    todayProductsSold: items.reduce((s, i) => s + i.quantity, 0),
    activeCustomers: customers.length,
  }), [getTodaySales, getTransactionCount, items, customers]);

  return (
    <div className="pos-container" dir="rtl" lang="ar">
      <OfflineBanner isOnline={navigator.onLine && offlineOnline} pendingSync={0} />

      <header className="pos-header bg-[#1E40AF] text-white">
        <div className="flex items-center justify-between w-full px-4 py-2">
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8" />
            <div>
              <h1 className="text-lg font-bold font-arabic">المنافذ الذكية POS</h1>
              <p className="text-xs text-blue-200">Smart Ports POS v2.0</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{getBrandLabel("total")}: {formatCurrency(total)}</p>
              <p className="text-xs text-blue-200">{itemCount} {getBrandLabel("item")}</p>
            </div>
            {sessionActive && (
              <button onClick={endSession} className="flex items-center gap-1 px-3 py-1 bg-red-600 rounded text-sm hover:bg-red-700">
                <Power className="w-4 h-4" /> إنهاء الشيفت
              </button>
            )}
          </div>
        </div>
      </header>

      <nav className="flex bg-gray-100 border-b border-gray-200 px-2">
        {[
          { key: "sales" as POSView, label: getBrandLabel("invoice"), icon: ShoppingCart },
          { key: "products" as POSView, label: getBrandLabel("item"), icon: Package },
          { key: "dashboard" as POSView, label: getBrandLabel("report"), icon: Barcode },
          { key: "analytics" as POSView, label: "التحليلات", icon: Package },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveView(key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${activeView === key ? "bg-white text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700"}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-auto p-4">
        {activeView === "sales" && (
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-4">
              <UnifiedSearchBar query={searchQuery} onSearch={(q) => {}} onBarcodeClick={() => setShowBarcodeScanner(true)} results={unifiedResults} />
              <div className="flex gap-4">
                <div className="flex-1">
                  <ProductCatalog products={searchResults.products} onProductClick={handleProductClick} selectedCategory={selectedCategory} onCategoryChange={filterByCategory} />
                </div>
                <div className="w-96">
                  <Cart items={items} discount={discount} setDiscount={setDiscount} taxRate={taxRate} subtotal={subtotal} total={total} onUpdateQuantity={updateQuantity} onRemoveItem={removeItem} onHold={handleHold} onCompleteSale={handleCompleteSale} />
                </div>
              </div>
              <RecommendationsPanel recommendations={recommendations} onAddItem={addItem} />
            </div>
            <div className="space-y-4">
              <CustomerLookup customers={filteredCustomers} selectedCustomer={selectedCustomer} onSelectCustomer={selectCustomer} onSearch={lookupCustomer} />
              <QuickSaleButton onQuickSale={() => {}} />
            </div>
          </div>
        )}
        {activeView === "products" && (
          <ProductCatalog products={products} onProductClick={handleProductClick} selectedCategory={selectedCategory} onCategoryChange={filterByCategory} />
        )}
        {activeView === "dashboard" && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-800">{getBrandLabel("report")}</h2>
            <POSAnalytics stats={dashboardStats} />
          </div>
        )}
        {activeView === "analytics" && (
          <POSAnalytics stats={dashboardStats} />
        )}
        {activeView === "receipt" && (
          <DigitalReceipt items={items} subtotal={subtotal} discount={discount} total={total} taxRate={taxRate} customer={selectedCustomer} onPrint={() => {}} onNewSale={() => { clearCart(); setActiveView("sales"); }} />
        )}
      </main>

      {showBarcodeScanner && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
          <BarcodeScanner onScan={handleBarcodeScan} onClose={() => setShowBarcodeScanner(false)} />
        </div>
      )}
      {showBatchEntry && <BatchEntryModal onClose={() => setShowBatchEntry(false)} onSave={() => setShowBatchEntry(false)} />}
      {showSerialEntry && <SerialEntryModal onClose={() => setShowSerialEntry(false)} onSave={() => setShowSerialEntry(false)} />}
      {showVariantSelector && (
        <VariantSelectorModal product={products[0]} onClose={() => setShowVariantSelector(false)} onSelect={() => {}} />
      )}
    </div>
  );
}
