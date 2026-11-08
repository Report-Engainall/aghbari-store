import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowLeftRight, BarChart3, Bell, Bot, BrainCircuit, Box, Calculator, Check, ChevronLeft, ClipboardList, Headphones, PackageCheck,
  CircleDollarSign, Database, Download, FileSpreadsheet, FileText, LayoutDashboard, LogOut, Menu, Package, Printer,
  Pencil, Plus, RefreshCw, ScrollText, Search, Settings, ShoppingCart, SlidersHorizontal,
  Smartphone, Store, Tag, Trash2, TrendingUp, Users, Zap,
} from 'lucide-react';
import {
  createCustomer, createProduct, createPricingRule, deletePricingRule, fetchAiAlerts,
  fetchActiveInventoryWarehouses, fetchInventoryReorderPoint, fetchCategories, fetchCustomers, fetchDashboardStats, fetchOrders, fetchPricingRules,
  fetchStoreProductActivityReport,
  fetchProducts, setInventoryReorderPoint, togglePricingRule, transferInventory,
  updateCustomerStatus, updateCustomerTier, updatePricingRule, updateProduct, uploadProductImage, removeProductImage,
  ProductImageCleanupError, approvePricingRule, previewCustomerTierPrice,
  uploadProductGalleryImage, removeProductGalleryImage,
} from '@/lib/api';
import type { CustomerTierPricePreview } from '@/lib/api';
import { archiveAdminCatalogCategory, archiveAdminCatalogProduct, createAdminCatalogCategory, renameAdminCatalogCategory, restoreAdminCatalogCategory } from '@/lib/admin-catalog-commands';
import { useFetch } from '@/lib/useFetch';
import { ADMIN_NAV_GROUPS } from '@/lib/admin-access-matrix';
import { searchAdminWorkspaceRecords, type AdminWorkspaceSearchItem } from '@/lib/admin-workspace-search';
import { fetchCustomerDirectoryPage, type CustomerDirectoryRow } from '@/lib/customer-directory';
import { formatCurrency, formatDateShort, formatNumber } from '@/lib/format';
import { CUSTOMER_STATUS_LABELS, ORDER_STATUS_LABELS, type Category, type CreatePricingRuleInput, type Customer, type PricingRule, type ProductWithInventory } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { useNavigate } from '@tanstack/react-router';
import { Login } from '@/components/Login';
import { DashboardLoadError } from '@/components/DashboardLoadError';

import {
  AiCenter, Field, Loading, ErrorBox, Empty, Button,
  TableWrap, Modal, Notifications, OrderDetail, SettingsPage, Suppliers,
} from '@/components/AdminPages';
import { OperationsCenter } from '@/components/OperationsCenter';
import { buildBusinessSignals, buildBusinessStatusBreakdown } from '@/lib/business-intelligence';
import { dashboardAverageOrderDisplay, dashboardSalesDisplay } from '@/lib/dashboard-metrics';
import { getInventoryAvailabilityStatus } from '@/lib/inventory-metrics';
import { PricingGrid } from '@/components/PricingGrid';
import { ProductUnitConversionsEditor } from '@/components/ProductUnitConversionsEditor';
import { AdminAuditLog } from '@/components/AdminAuditLog';
import { AdminCustomer360 } from '@/components/AdminCustomer360';
import { CustomerServiceDesk } from '@/components/CustomerServiceDesk';
import { CustomerActivationInvitationDialog } from '@/components/CustomerActivationInvitationDialog';
import type { CustomerActivationCandidate } from '@/components/CustomerActivationInvitationDialog';
import { CustomerManagerRoleAssignment } from '@/components/CustomerManagerRoleAssignment';
import { DeviceManagement } from '@/components/DeviceManagement';
import { TaskCenter } from '@/components/TaskCenter';
import { InventoryStockCountPage } from '@/components/InventoryStockCountPage';
import { InventoryTransferHistoryPage } from '@/components/InventoryTransferHistoryPage';
import { PurchaseOrdersPage } from '@/components/PurchaseOrdersPage';
import { UnifiedImportEngine } from '@/components/UnifiedImportEngine';
import { OnyxSnapshotCenter } from '@/components/OnyxSnapshotCenter';
import { UnifiedOnyxAnalysisPanel } from '@/components/UnifiedOnyxAnalysisPanel';
import { ExecutiveStoreAnalytics } from '@/components/ExecutiveStoreAnalytics';
import { PromotionManager } from '@/components/PromotionManager';
import { toWebp, validateProductImageFile } from '@/lib/product-image';
import { validateCustomerInput } from '@/lib/customer-input';
import { StaffQuotesPage, StaffFinancePage } from '@/components/CustomerWorkflows';
import { GeneralLedgerWorkspace } from '@/components/GeneralLedgerWorkspace';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';
import { DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { IntelligenceWorkspace } from '@/components/intelligence/IntelligenceWorkspace';
import { ProductActivityPrintSheet } from '@/components/ProductActivityPrintSheet';
import { projectProductActivityPrintDocument } from '@/lib/product-activity-print';
import { downloadProductActivityWorkbookXlsx } from '@/lib/product-activity-xlsx';
import { PRODUCT_ACTIVITY_STATUS_LABELS, type StoreProductActivityReport } from '@/lib/product-activity-report';

type View = 'dashboard' | 'products' | 'customers' | 'orders' | 'pricing' | 'offers' | 'reports' | 'data' | 'operations' | 'notifications' | 'ai' | 'suppliers' | 'devices' | 'settings' | 'quotes' | 'finance' | 'tasks' | 'audit' | 'stock-count' | 'inventory-transfers' | 'purchase-orders' | 'intelligence' | 'service-desk';
type IconType = typeof LayoutDashboard;

const nav: { id: View; label: string; icon: IconType }[] = [
  { id: 'dashboard', label: 'لوحة المعلومات', icon: LayoutDashboard },
  { id: 'products', label: 'إدارة المنتجات', icon: Box },
  { id: 'customers', label: 'العملاء', icon: Users },
  { id: 'service-desk', label: 'خدمة العملاء', icon: Headphones },
  { id: 'orders', label: 'الطلبات', icon: ShoppingCart },
  { id: 'pricing', label: 'التسعير والمخزون', icon: SlidersHorizontal },
  { id: 'stock-count', label: 'الجرد الفعلي', icon: PackageCheck },
  { id: 'inventory-transfers', label: 'سجل تحويلات المخزون', icon: PackageCheck },
  { id: 'offers', label: 'العروض', icon: Tag },
  { id: 'suppliers', label: 'الموردون', icon: Package },
  { id: 'purchase-orders', label: 'أوامر الشراء والاستلام', icon: PackageCheck },
  { id: 'devices', label: 'الأجهزة والجلسات', icon: Smartphone },
  { id: 'reports', label: 'التقارير الذكية', icon: BarChart3 },
  { id: 'intelligence', label: 'ذكاء الأعمال والتحصيلات', icon: BrainCircuit },
  { id: 'ai', label: 'مركز الذكاء', icon: Bot },
  { id: 'notifications', label: 'التنبيهات', icon: Bell },
  { id: 'data', label: 'مركز البيانات', icon: Database },
  { id: 'operations', label: 'العمليات الذكية', icon: Zap },
  { id: 'settings', label: 'الإعدادات', icon: Settings },
  { id: 'quotes', label: 'عروض الأسعار', icon: FileText },
  { id: 'finance', label: 'الفواتير والتحصيل', icon: CircleDollarSign },
  { id: 'tasks', label: 'المهام التشغيلية والطباعة', icon: ClipboardList },
  { id: 'audit', label: 'سجل التدقيق', icon: ScrollText },
];

const adminPaths: Record<View, string> = {
  dashboard: '/admin', products: '/admin/products', customers: '/admin/customers', orders: '/admin/orders',
  pricing: '/admin/pricing', offers: '/admin/offers', reports: '/admin/reports', data: '/admin/data',
  operations: '/admin/operations', notifications: '/admin/notifications', ai: '/admin/ai',
  suppliers: '/admin/suppliers', devices: '/admin/devices', settings: '/admin/settings',
  quotes: '/admin/quotes', finance: '/admin/finance', tasks: '/admin/tasks', audit: '/admin/audit',
  'stock-count': '/admin/stock-count',
  'inventory-transfers': '/admin/inventory-transfers',
  'purchase-orders': '/admin/purchase-orders', intelligence: '/admin/intelligence', 'service-desk': '/admin/service-desk',
};



type AdminRecordContext = {
  kind: string;
  id: string;
  title: string;
  subtitle: string;
  route: string;
  query: string;
  savedAt: number;
  returnToView?: View | null;
  returnToOrderDetailId?: string | null;
};

const ADMIN_RECORD_CONTEXT_KEY = "aghbari.admin.record-context.v1";
function readAdminRecordContext(): AdminRecordContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ADMIN_RECORD_CONTEXT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<AdminRecordContext>;
    if (typeof value.kind !== "string" || typeof value.id !== "string" ||
        typeof value.title !== "string" || typeof value.subtitle !== "string" ||
        typeof value.route !== "string" || typeof value.query !== "string" ||
        typeof value.savedAt !== "number" || Date.now() - value.savedAt > 4 * 60 * 60 * 1000) {
      window.sessionStorage.removeItem(ADMIN_RECORD_CONTEXT_KEY);
      return null;
    }
    const returnToView = nav.some((item) => item.id === value.returnToView) ? value.returnToView as View : null;
    return {
      ...value,
      returnToView,
      returnToOrderDetailId: typeof value.returnToOrderDetailId === "string" ? value.returnToOrderDetailId : null,
    } as AdminRecordContext;
  } catch {
    return null;
  }
}

type AdminSessionUser = NonNullable<ReturnType<typeof useAuth>["user"]>;

type AdminWorkspaceContentProps = {
  view: View;
  user: AdminSessionUser;
  orderDetailId: string | null;
  navigationBlocked: boolean;
  onNavigate: (view: View) => void;
  onNotice: (message: string) => void;
  onOrderDetailChange: (orderId: string | null) => void;
  onNavigationBlockedChange: (blocked: boolean) => void;
  recordContext: AdminRecordContext | null;
  onRecordContextChange: (context: Omit<AdminRecordContext, "savedAt"> | null) => void;
};

function AdminWorkspaceContent({
  view,
  user,
  orderDetailId,
  navigationBlocked,
  onNavigate,
  onNotice,
  onOrderDetailChange,
  onNavigationBlockedChange,
  recordContext,
  onRecordContextChange,
}: AdminWorkspaceContentProps) {
  const [notificationTaskId, setNotificationTaskId] = useState<string | null>(null);
  const keepSourceContext = (kind: string, id: string, title: string, subtitle: string, destination: View) => {
    onRecordContextChange({
      kind, id, title, subtitle, route: adminPaths[destination], query: id,
      returnToView: view, returnToOrderDetailId: orderDetailId,
    });
    onNavigate(destination);
  };

  switch (view) {
    case "dashboard":
      return <Dashboard onNavigate={onNavigate} />;
    case "products":
      return <Products onNotice={onNotice} initialSearch={recordContext?.kind === "product" ? recordContext.query : undefined} />;
    case "customers":
      return <Customers onNotice={onNotice} initialSearch={recordContext?.kind === "customer" ? recordContext.query : undefined} />;
    case "service-desk":
      return <CustomerServiceDesk onNotice={onNotice} onOpenTask={(taskId) => {
        setNotificationTaskId(taskId);
        onNavigate('tasks');
      }} />;
    case "orders":
      if (!orderDetailId) return <Orders onViewDetail={onOrderDetailChange} />;
      return (
        <OrderDetail
          orderId={orderDetailId}
          onBack={() => {
            if (navigationBlocked) {
              onNotice("اعتمد كميات وأسعار الطلب أو ألغِ المسودة قبل الرجوع.");
              return;
            }
            onOrderDetailChange(null);
          }}
          onNotice={onNotice}
          onBlockedChange={onNavigationBlockedChange}
        />
      );
    case "pricing":
      return <Pricing onNotice={onNotice} />;
    case "offers":
      return <Offers onNotice={onNotice} />;
    case "suppliers":
      return <Suppliers onNotice={onNotice} initialSearch={recordContext?.kind === "supplier" ? recordContext.title : undefined} />;
    case "purchase-orders":
      return <PurchaseOrdersPage initialPurchaseOrderId={recordContext?.kind === "purchase_order" ? recordContext.id : undefined} />;
    case "devices":
      return <DeviceManagement onNotice={onNotice} />;
    case "reports":
      return <Reports />;
    case "intelligence":
      return <IntelligenceWorkspace
        onOpenSupplierInvoice={(invoiceId) => {
          keepSourceContext("supplier_invoice", invoiceId, "فاتورة مورد", "مرجع فاتورة مصدره مركز ذكاء الأعمال", "finance");
          onNotice("تم فتح مساحة المالية مع الاحتفاظ بمرجع فاتورة المورد: " + invoiceId);
        }}
        onOpenPurchaseOrder={(purchaseOrderId) => {
          keepSourceContext("purchase_order", purchaseOrderId, "أمر شراء", "مرجع أمر شراء من مركز ذكاء الأعمال", "purchase-orders");
          onNotice("تم فتح مساحة أوامر الشراء مع الاحتفاظ بالمرجع: " + purchaseOrderId);
        }}
        onOpenRecord={(kind, subjectRef) => {
          const destination = kind === "QUOTE_UNCONVERTED"
            ? "quotes"
            : kind === "CUSTOMER_ACTIVITY_DECLINE" || kind === "REPEAT_PURCHASE"
              ? "customers"
              : "products";
          const destinationLabel = destination === "quotes" ? "عروض الأسعار"
            : destination === "customers" ? "العملاء" : "المنتجات";
          keepSourceContext(
            destination === "customers" ? "customer_reference" : destination === "quotes" ? "quote_reference" : "product_reference",
            subjectRef, destinationLabel, "مرجع مصدر مرتبط بتحليل ذكاء الأعمال", destination,
          );
          onNotice("تم فتح شاشة " + destinationLabel + " مع حفظ مرجع السجل: " + subjectRef);
        }}
        onOpenShiftItem={(sourceKey, sourceRef) => {
          if (sourceKey === "ORDERS") {
            if (navigationBlocked) {
              onNotice("احفظ مراجعة الطلب الحالية قبل فتح طلب آخر.");
              return;
            }
            onRecordContextChange({
              kind: "order", id: sourceRef, title: "طلب من سجل الوردية",
              subtitle: "مرجع تشغيل محفوظ من مركز الوردية", route: adminPaths.orders, query: sourceRef,
              returnToView: view, returnToOrderDetailId: orderDetailId,
            });
            onOrderDetailChange(sourceRef);
            onNavigate("orders");
            onNotice("تم فتح الطلب المرتبط بالوردية: " + sourceRef);
            return;
          }
          if (sourceKey === "TASKS") {
            setNotificationTaskId(sourceRef);
            keepSourceContext("task", sourceRef, "مهمة تشغيلية", "مرجع مهمة من قائمة الوردية", "tasks");
            onNotice("تم فتح المهام التشغيلية مع تحديد مرجع المهمة: " + sourceRef);
            return;
          }
          const destination: View =
            sourceKey === "INVOICES" || sourceKey === "PAYMENTS" || sourceKey === "CASH"
              ? "finance"
              : sourceKey === "RECEIPTS"
                ? "purchase-orders"
                : sourceKey === "MOVEMENTS"
                  ? "inventory-transfers"
                  : sourceKey === "INVENTORY"
                    ? "stock-count"
                    : sourceKey === "DELIVERIES"
                      ? "orders"
                      : "operations";
          const labels: Partial<Record<View, string>> = {
            finance: "الفواتير والتحصيل",
            "purchase-orders": "أوامر الشراء والاستلام",
            "inventory-transfers": "سجل تحويلات المخزون",
            "stock-count": "الجرد الفعلي",
            orders: "الطلبات والتوصيل",
            tasks: "المهام التشغيلية",
            operations: "العمليات والتنبيهات",
          };
          const contextKind = destination === "finance" ? "financial_source"
            : destination === "purchase-orders" ? "receipt_reference"
              : destination === "inventory-transfers" ? "inventory_movement"
                : destination === "stock-count" ? "inventory_count"
                  : destination === "orders" ? "delivery_reference" : "operation_reference";
          keepSourceContext(
            contextKind, sourceRef, labels[destination] ?? "مرجع تشغيلي",
            "مرجع مصدر محفوظ من سجل الوردية: " + sourceKey, destination,
          );
          onNotice("تم فتح شاشة " + (labels[destination] ?? "العمليات") + " مع الاحتفاظ بمرجع الوردية: " + sourceRef);
        }}
      />;
    case "ai":
      return <AiCenter onNotice={onNotice} />;
    case "notifications":
      return <Notifications
        onNotice={onNotice}
        onOpenTask={(taskId) => {
          setNotificationTaskId(taskId);
          onNavigate('tasks');
        }}
      />;
    case "data":
      return <DataCenter onNotice={onNotice} initialImportJobId={recordContext?.kind === "import" ? recordContext.id : undefined} />;
    case "operations":
      return <OperationsCenter onNotice={onNotice} />;
    case "settings":
      return (
        <>
          <SettingsPage onNotice={onNotice} />
          {user.roles.includes("admin") && (
            <CustomerManagerRoleAssignment currentProfileId={user.profileId} onNotice={onNotice} />
          )}
        </>
      );
    case "quotes":
      return <StaffQuotesPage />;
    case "finance":
      return (
        <>
          <StaffFinancePage initialInvoiceId={recordContext?.kind === "invoice" ? recordContext.id : undefined} />
          {user.roles.some((role) => role === "admin" || role === "manager" || role === "accountant")
            ? <GeneralLedgerWorkspace />
            : null}
        </>
      );
    case "tasks":
      return (
        <TaskCenter
          onNotice={onNotice}
          initialTaskId={recordContext?.kind === "task" ? recordContext.id : notificationTaskId}
          onInitialTaskApplied={() => setNotificationTaskId(null)}
        />
      );
    case "audit":
      return <AdminAuditLog initialSearch={recordContext?.kind === "audit" ? recordContext.id : undefined} />;
    case "stock-count":
      return <InventoryStockCountPage />;
    case "inventory-transfers":
      return <InventoryTransferHistoryPage />;
    default:
      return null;
  }
}

function CustomerManagerAccessPanel({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="panel" role="status" style={{ padding: 24 }}>
      <h1>مساحة مسؤول العملاء</h1>
      <p>هذا الدور مخصص لدليل العملاء واعتماد الحسابات وتغيير شرائح الأسعار وحالات الحساب. لا يتيح الوصول إلى البيانات المالية أو وحدات المخزون والطلبات.</p>
      <button className="btn primary" onClick={onOpen}>فتح إدارة العملاء</button>
    </section>
  );
}

function FinanceAccessPanel({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="panel" role="status" style={{ padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>بوابة المحاسبة</h1>
      <p>هذا الحساب مخصص للفواتير والتحصيل فقط، ولا يملك صلاحيات إدارة الطلبات أو المنتجات أو النظام.</p>
      <button className="btn primary" onClick={onOpen}>فتح الفواتير والتحصيل</button>
    </section>
  );
}

function AdminWorkspaceAccess({
  isCustomerManagerOnly,
  isFinanceOnly,
  view,
  user,
  orderDetailId,
  navigationBlocked,
  onNavigate,
  onNotice,
  onOrderDetailChange,
  onNavigationBlockedChange,
  recordContext,
  onRecordContextChange,
  onOpenCustomers,
  onOpenFinance,
}: AdminWorkspaceContentProps & {
  isCustomerManagerOnly: boolean;
  isFinanceOnly: boolean;
  onOpenCustomers: () => void;
  onOpenFinance: () => void;
}) {
  if (isCustomerManagerOnly && view !== "customers") {
    return <CustomerManagerAccessPanel onOpen={onOpenCustomers} />;
  }
  if (isFinanceOnly && view !== "finance" && view !== "tasks") {
    return <FinanceAccessPanel onOpen={onOpenFinance} />;
  }
  return (
    <AdminWorkspaceContent
      view={view}
      user={user}
      orderDetailId={orderDetailId}
      navigationBlocked={navigationBlocked}
      onNavigate={onNavigate}
      onNotice={onNotice}
      onOrderDetailChange={onOrderDetailChange}
      onNavigationBlockedChange={onNavigationBlockedChange}
      recordContext={recordContext}
      onRecordContextChange={onRecordContextChange}
    />
  );
}

function AdminSidebarNavigation({ groups, view, firstMobileNavItemRef, navigationBlocked, onNavigate }: {
  groups: { id: string; label: string; items: (typeof nav)[number][] }[];
  view: View;
  firstMobileNavItemRef: React.Ref<HTMLButtonElement>;
  navigationBlocked: boolean;
  onNavigate: (id: View) => void;
}) {
  let firstButton = true;
  return (
    <nav aria-label="التنقل الإداري">
      {groups.map((group) => (
        <div key={group.id} className="admin-nav-group" style={{ display: "contents" }}>
          <div className="admin-nav-group-title" style={{ padding: "14px 18px 5px", color: "var(--muted-foreground, #64748b)", fontSize: 11, fontWeight: 700 }}>
            {group.label}
          </div>
          {group.items.map(({ id, label, icon: Icon }) => {
            const isFirst = firstButton;
            firstButton = false;
            return (
              <button type="button" ref={isFirst ? firstMobileNavItemRef : undefined} key={id}
                className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined}
                aria-disabled={navigationBlocked || undefined} onClick={() => onNavigate(id)}>
                <Icon size={18} /><span>{label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function AppContent({ initialView = 'dashboard' }: { initialView?: View }) {
  const { user, ready, signOut } = useAuth();
  const canOperateAdmin = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager' || role === 'staff'));
  const canManageFinance = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager' || role === 'accountant'));
  const isFinanceOnly = canManageFinance && !canOperateAdmin;
  const isCustomerManagerOnly = Boolean(user?.roles.includes('customer_manager') &&
    !user.roles.some((role) => role === 'admin' || role === 'manager' || role === 'staff' || role === 'accountant'));
  const canManageAudit = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager'));
  const canManageIntelligence = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager'));
  const visibleNav = nav.filter(({ id }) => isCustomerManagerOnly
    ? id === 'customers'
    : (isFinanceOnly ? id === 'finance' || id === 'tasks' : id !== 'finance' || canManageFinance) &&
      (id !== 'intelligence' || canManageIntelligence) &&
      (id !== 'audit' || canManageAudit) &&
      (id !== 'purchase-orders' || user?.roles.some((role) => role === 'admin' || role === 'manager'))
  );
  const visibleNavGroups = ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.views
      .map((id) => nav.find((item) => item.id === id))
      .filter((item): item is (typeof nav)[number] => Boolean(item && visibleNav.some((visible) => visible.id === item.id))),
  })).filter((group) => group.items.length > 0);
  const navigate = useNavigate();
  const [view, setView] = useState<View>(initialView);
  const [mobileNav, setMobileNav] = useState(false);
  const firstMobileNavItemRef = useRef<HTMLButtonElement | null>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandSearch, setCommandSearch] = useState(() => readAdminRecordContext()?.query ?? "");
  const [workspaceSearchResults, setWorkspaceSearchResults] = useState<AdminWorkspaceSearchItem[]>([]);
  const [workspaceSearchLoading, setWorkspaceSearchLoading] = useState(false);
  const [workspaceSearchError, setWorkspaceSearchError] = useState("");
  const workspaceSearchRequest = useRef(0);
  const [recordContext, setRecordContext] = useState<AdminRecordContext | null>(() => readAdminRecordContext());
  const [notice, setNotice] = useState<string | null>(null);
  const [orderDetailId, setOrderDetailId] = useState<string | null>(() => { const context = readAdminRecordContext(); return context?.kind === "order" ? context.id : null; });
  const [navigationBlocked, setNavigationBlocked] = useState(false);
  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(null), 2800); };
  useEffect(() => {
    try {
      if (recordContext) window.sessionStorage.setItem(ADMIN_RECORD_CONTEXT_KEY, JSON.stringify(recordContext));
      else window.sessionStorage.removeItem(ADMIN_RECORD_CONTEXT_KEY);
    } catch { /* Session storage is optional; source screens remain independently authorized. */ }
  }, [recordContext]);

  useEffect(() => {
    const requestId = ++workspaceSearchRequest.current;
    const query = commandSearch.normalize("NFKC").trim();
    if (!commandOpen || query.length < 2) {
      setWorkspaceSearchResults([]);
      setWorkspaceSearchError("");
      setWorkspaceSearchLoading(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setWorkspaceSearchLoading(true);
      setWorkspaceSearchError("");
      void searchAdminWorkspaceRecords(query, 30)
        .then((items) => {
          if (requestId === workspaceSearchRequest.current) setWorkspaceSearchResults(items);
        })
        .catch((cause) => {
          if (requestId === workspaceSearchRequest.current) {
            setWorkspaceSearchResults([]);
            setWorkspaceSearchError(cause instanceof Error ? cause.message : "تعذر البحث في السجلات.");
          }
        })
        .finally(() => {
          if (requestId === workspaceSearchRequest.current) setWorkspaceSearchLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      workspaceSearchRequest.current += 1;
    };
  }, [commandOpen, commandSearch]);
  const closeMobileNav = () => {
    const wasOpen = mobileNav;
    setMobileNav(false);
    if (wasOpen) mobileMenuButtonRef.current?.focus({ preventScroll: true });
    return wasOpen;
  };
  const navigateAdmin = (id: View, restoreMobileFocus: boolean) => {
    const navigation = navigate({ to: adminPaths[id] as never });
    if (!restoreMobileFocus) return;

    // Admin pages are separate file routes and may remount AdminApp. Restore
    // focus against the current route's trigger only after navigation commits.
    void Promise.resolve(navigation).then(() => {
      const restoreCurrentTrigger = () => {
        const trigger = document.querySelector<HTMLButtonElement>(
          '.mobile-menu[aria-controls="admin-sidebar"]',
        );
        if (!trigger || trigger.disabled) return;
        const triggerStyle = window.getComputedStyle(trigger);
        if (triggerStyle.display === 'none' || triggerStyle.visibility === 'hidden') return;
        trigger.focus({ preventScroll: true });
      };

      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(restoreCurrentTrigger);
      } else {
        window.setTimeout(restoreCurrentTrigger, 0);
      }
    });
  };
  const setMode = (_m: 'storefront') => {
    if (navigationBlocked) { showNotice('اعتمد كميات وأسعار الطلب أو ألغِ المسودة قبل مغادرة مراجعة الطلب.'); return; }
    closeMobileNav();
    void navigate({ to: '/' });
  };

  useEffect(() => {
    if (!mobileNav) return;

    let cancelled = false;
    let scheduledFrame: number | null = null;
    let attempts = 0;

    const requestFrame = (callback: FrameRequestCallback) => {
      if (typeof window.requestAnimationFrame === 'function') {
        return window.requestAnimationFrame(callback);
      }
      return window.setTimeout(() => callback(window.performance.now()), 16);
    };

    const cancelFrame = (frameId: number) => {
      if (typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(frameId);
      } else {
        window.clearTimeout(frameId);
      }
    };

    const focusWhenDrawerIsReady = () => {
      scheduledFrame = null;
      if (cancelled) return;

      const firstItem = firstMobileNavItemRef.current;
      const sidebar = firstItem?.closest<HTMLElement>('#admin-sidebar');
      if (!firstItem || !sidebar || !sidebar.isConnected || firstItem.disabled) return;

      const sidebarStyle = window.getComputedStyle(sidebar);
      const isVisible = sidebarStyle.display !== 'none' &&
        sidebarStyle.visibility !== 'hidden' &&
        Number(sidebarStyle.opacity || '1') > 0;
      // Wait only for the drawer's own clip-path transition. Descendant controls
      // have independent hover transitions; waiting on subtree animations can
      // leave focus stranded whenever a nav item is hovered as the drawer opens.
      const hasActiveMotion = typeof sidebar.getAnimations === 'function' &&
        sidebar.getAnimations().some(
          (animation) => animation.playState === 'running',
        );

      if (isVisible && !hasActiveMotion) {
        firstItem.focus({ preventScroll: true });
        if (document.activeElement === firstItem) return;
      }

      // A drawer transition can temporarily reject focus. Recheck after the
      // browser has applied visibility/layout changes; stop after two seconds.
      if (attempts < 120) {
        attempts += 1;
        scheduledFrame = requestFrame(focusWhenDrawerIsReady);
      }
    };

    scheduledFrame = requestFrame(focusWhenDrawerIsReady);

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setMobileNav(false);
      mobileMenuButtonRef.current?.focus();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      cancelled = true;
      if (scheduledFrame !== null) cancelFrame(scheduledFrame);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileNav]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const runAdminCommand = (id: View) => {
    setCommandOpen(false);
    if (isCustomerManagerOnly && id !== 'customers') { showNotice('صلاحية مسؤول العملاء مقتصرة على إدارة العملاء.'); return; }
    if (isFinanceOnly && id !== 'finance' && id !== 'tasks') {
      showNotice('حساب المحاسب مخصص للفواتير والتحصيل فقط.');
      return;
    }
    if (id === 'finance' && !canManageFinance) {
      showNotice('لا تملك صلاحية الوصول إلى الفواتير والتحصيل.');
      return;
    }
    if (navigationBlocked) {
      showNotice('اعتمد كميات وأسعار الطلب أو ألغِ المسودة قبل الانتقال إلى قسم آخر.');
      return;
    }
    setView(id);
    setOrderDetailId(null);
    const restoreMobileFocus = closeMobileNav();
    navigateAdmin(id, restoreMobileFocus);
  };

  const openWorkspaceSearchResult = (item: AdminWorkspaceSearchItem) => {
    const destination: View =
      item.kind === "product" ? "products" :
      item.kind === "customer" ? "customers" :
      item.kind === "order" ? "orders" :
      item.kind === "supplier" ? "suppliers" :
      item.kind === "purchase_order" ? "purchase-orders" :
      item.kind === "task" ? "tasks" :
      item.kind === "import" ? "data" :
      item.kind === "invoice" ? "finance" :
      item.kind === "decision" ? "intelligence" : "audit";
    if (!visibleNav.some((entry) => entry.id === destination)) {
      showNotice("لا يملك هذا الحساب صلاحية فتح مصدر السجل.");
      return;
    }
    if (navigationBlocked) {
      showNotice("اعتمد كميات وأسعار الطلب أو ألغِ المسودة قبل مغادرة مراجعة الطلب.");
      return;
    }
    setRecordContext({
      kind: item.kind, id: item.id, title: item.title, subtitle: item.subtitle,
      route: item.route, query: item.title || item.id,
      savedAt: Date.now(), returnToView: null, returnToOrderDetailId: null,
    });
    setCommandOpen(false);
    setView(destination);
    setOrderDetailId(item.kind === "order" ? item.id : null);
    closeMobileNav();
    navigateAdmin(destination, false);
  };

  const searchKindLabel: Record<AdminWorkspaceSearchItem["kind"], string> = {
    product: "منتج", customer: "عميل", order: "طلب", supplier: "مورد",
    invoice: "فاتورة", decision: "قرار", audit: "أثر تدقيق",
    purchase_order: "أمر شراء", task: "مهمة", import: "دفعة استيراد",
  };

  if (!ready) return <div className="login-screen" dir="rtl"><div style={{ margin: 'auto' }}><Loading /></div></div>;
  if (!user) return <Login />;
  if (!user.isStaff) return (
    <div className="login-screen" dir="rtl"><div className="login-right" style={{ margin: 'auto' }}><div className="login-form">
      <h1>لا تملك صلاحية الإدارة</h1>
      <p>حسابك ({user.email}) حساب عميل. لوحة التحكم متاحة لفريق الأغبري فقط.</p>
      <button className="login-submit" onClick={() => setMode('storefront')}>الذهاب إلى المتجر</button>
      <button className="login-submit" style={{ marginTop: 10, opacity: .8 }} onClick={() => void signOut()}>تسجيل الخروج</button>
    </div></div></div>
  );



  return (
    <div className="app-shell" dir="rtl">
      <aside id="admin-sidebar" aria-label="القائمة الإدارية" className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="brand" onClick={() => setMode('storefront')} style={{ cursor: 'pointer' }}><div className="brand-icon"><Activity size={22} /></div><div><strong>الأغبري</strong><span>منصة التوزيع الذكية</span></div></div>
        <div className="user-card"><div className="avatar">{user.name.charAt(0)}</div><div><strong>{user.name}</strong><span>{isCustomerManagerOnly ? 'مسؤول العملاء' : isFinanceOnly ? 'المحاسبة' : user.roles.includes('admin') ? 'مدير النظام' : user.roles.includes('manager') ? 'مدير' : 'فريق الأغبري'}</span></div><span className="online-dot" /></div>
        <AdminSidebarNavigation
              groups={visibleNavGroups}
              view={view}
              firstMobileNavItemRef={firstMobileNavItemRef}
              navigationBlocked={navigationBlocked}
              onNavigate={runAdminCommand}
            />
        <div className="sidebar-bottom"><button onClick={() => setMode('storefront')}><Store size={18} /> عرض المتجر</button><button onClick={() => { if (navigationBlocked) { showNotice('لا يمكن تسجيل الخروج قبل اعتماد تغييرات الطلب أو إلغائها.'); return; } void signOut(); }}><LogOut size={18} /> خروج</button><div className="secure"><span /> النظام متصل وآمن</div></div>
      </aside>
      <main className="main">
        <header className="topbar"><button type="button" ref={mobileMenuButtonRef} className="mobile-menu" aria-label={mobileNav ? "إغلاق القائمة الإدارية" : "فتح القائمة الإدارية"} aria-expanded={mobileNav} aria-controls="admin-sidebar" onClick={() => { if (mobileNav) closeMobileNav(); else setMobileNav(true); }}><Menu size={20} /></button><div className="topbar-title"><span className="live" /> {isFinanceOnly ? 'المحاسبة — الأغبري' : 'مركز تشغيل الأغبري'} <small>{isFinanceOnly ? 'الفواتير والتحصيل وكشف الحساب' : 'الطلبات والمخزون والأسعار والعملاء'}</small></div><div className="top-actions"><button type="button" className="search-button" aria-haspopup="dialog" aria-label="بحث سريع (Ctrl K)" onClick={() => setCommandOpen(true)}><Search size={16} /> بحث سريع <kbd>Ctrl K</kbd></button><button className="notification" aria-label="فتح التنبيهات" onClick={() => runAdminCommand('notifications')}><Bell size={18} /></button></div></header>
        <div className="page-wrap">
          {recordContext && (
            <section dir="rtl" aria-label="سياق السجل المفتوح" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-slate-800">
              <div className="min-w-0">
                <strong>السجل المرتبط: {recordContext.title}</strong>
                <p className="mt-1 break-words text-xs text-slate-600">{recordContext.subtitle || recordContext.id} · المرجع: {recordContext.id}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn outline" onClick={() => {
                  const returnView = recordContext.returnToView;
                  if (returnView && visibleNav.some((item) => item.id === returnView)) {
                    setView(returnView);
                    setOrderDetailId(recordContext.returnToOrderDetailId ?? null);
                    setCommandOpen(false);
                    closeMobileNav();
                    navigateAdmin(returnView, false);
                    return;
                  }
                  setCommandSearch(recordContext.query || recordContext.title);
                  setCommandOpen(true);
                }}>
                  {recordContext.returnToView && visibleNav.some((item) => item.id === recordContext.returnToView)
                    ? "العودة إلى " + (nav.find((item) => item.id === recordContext.returnToView)?.label ?? "السياق السابق")
                    : "العودة إلى البحث"}
                </button>
                <button type="button" className="btn outline" onClick={() => setRecordContext(null)}>إنهاء سياق السجل</button>
              </div>
            </section>
          )}
          <AdminWorkspaceAccess
            recordContext={recordContext}
            isCustomerManagerOnly={isCustomerManagerOnly}
            isFinanceOnly={isFinanceOnly}
            view={view}
            user={user}
            orderDetailId={orderDetailId}
            navigationBlocked={navigationBlocked}
            onNavigate={setView}
            onNotice={showNotice}
            onOrderDetailChange={setOrderDetailId}
            onNavigationBlockedChange={setNavigationBlocked}
            onRecordContextChange={(context) => setRecordContext(context ? { ...context, savedAt: Date.now() } : null)}
            onOpenCustomers={() => runAdminCommand("customers")}
            onOpenFinance={() => runAdminCommand("finance")}
          />
        </div>
      </main>
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <DialogTitle className="sr-only">التنقل السريع في لوحة الأغبري</DialogTitle>
        <DialogDescription className="sr-only">ابحث عن قسم ثم اضغط Enter لفتحه. يمكنك فتح البحث باستخدام Ctrl K.</DialogDescription>
        <CommandInput value={commandSearch} onValueChange={setCommandSearch} placeholder="ابحث عن قسم أو صنف أو عميل أو طلب أو فاتورة..." />
        <CommandList dir="rtl">
          <CommandEmpty>لا توجد نتائج مطابقة.</CommandEmpty>
          {commandSearch.trim().length >= 2 && (
            <CommandGroup heading="نتائج البحث في سجلات المؤسسة">
              {workspaceSearchLoading && <div className="px-3 py-2 text-sm text-muted-foreground" role="status">جار البحث في المصادر المسموحة...</div>}
              {workspaceSearchError && <div className="px-3 py-2 text-sm text-red-700" role="alert">{workspaceSearchError}</div>}
              {!workspaceSearchLoading && !workspaceSearchError && workspaceSearchResults.length === 0 &&
                <div className="px-3 py-2 text-sm text-muted-foreground" role="status">لا توجد سجلات مطابقة ضمن صلاحيات هذا الحساب.</div>}
              {workspaceSearchResults.map((item) => (
                <CommandItem key={item.kind + ":" + item.id}
                  value={`${item.kind} ${item.title} ${item.subtitle} ${item.id}`} keywords={[commandSearch]}
                  onSelect={() => openWorkspaceSearchResult(item)}>
                  <Search size={16} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate">{item.title}</strong>
                    <small className="block truncate text-muted-foreground">{searchKindLabel[item.kind]} · {item.subtitle}</small>
                  </span>
                  <span className="text-xs text-muted-foreground" dir="ltr">{item.id.slice(0, 8)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {visibleNavGroups.map((group) => (
            <CommandGroup key={group.id} heading={group.label}>
              {group.items.map(({ id, label, icon: Icon }) => (
                <CommandItem key={id} value={`${label} ${id} ${adminPaths[id]}`} onSelect={() => runAdminCommand(id)}>
                  <Icon size={17} aria-hidden="true" />
                  <span>{label}</span>
                  <span className="ml-auto text-xs text-muted-foreground" dir="ltr">{adminPaths[id]}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandGroup heading="مسارات إضافية">
            <CommandItem value="المتجر واجهة العميل storefront home catalog" onSelect={() => { setCommandOpen(false); setMode('storefront'); }}>
              <Store size={17} aria-hidden="true" />
              <span>فتح واجهة المتجر</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      {notice && <div className="toast"><Check size={17} /> {notice}</div>}
    </div>
  );
}

export function AdminApp({ initialView = 'dashboard' }: { initialView?: View }) {
  return <AppContent initialView={initialView} />;
}

export function Dashboard({ onNavigate }: { onNavigate: (v: View) => void }) {
  const { data: stats, loading, error, refetch } = useFetch(fetchDashboardStats);
  const { data: alerts, loading: alertsLoading, error: alertsError, refetch: refetchAlerts } = useFetch(fetchAiAlerts);
  const { data: products, loading: productsLoading, error: productsError, refetch: refetchProducts } = useFetch(fetchProducts);
  if (loading) return <><Heading eyebrow="مركز التشغيل" title="لوحة المعلومات" description="صورة مباشرة لأداء الأعمال اليومي" icon={LayoutDashboard} /><Loading /></>;
  if (error) return <>
    <Heading eyebrow="مركز التشغيل" title="لوحة المعلومات" description="صورة مباشرة لأداء الأعمال اليومي" icon={LayoutDashboard} />
    <DashboardLoadError
      message={error}
      onRetry={() => { void refetch(); void refetchAlerts(); void refetchProducts(); }}
    />
  </>;
  const lowStock = products?.filter((product) => {
    const quantity = product.inventory?.quantity_available;
    const reorderPoint = product.inventory?.reorder_point ?? product.min_stock_level;
    return getInventoryAvailabilityStatus(quantity, reorderPoint) === 'low';
  }).slice(0, 4) ?? [];
  const salesValue = stats ? dashboardSalesDisplay(stats, formatCurrency) : 'غير متاح';
  const processingValue = stats ? formatNumber(stats.processingCount) : 'غير متاح';
  const lowStockValue = !stats || stats.lowStockCount === null ? 'غير متاح' : formatNumber(stats.lowStockCount);
  const cards = [
    ['المبيعات المسجلة', salesValue, 'إجمالي الطلبات', CircleDollarSign, 'teal'],
    ['الطلبات', stats ? formatNumber(stats.orderCount) : 'غير متاح', 'كل الطلبات المسجلة', ShoppingCart, 'blue'],
    ['العملاء', stats ? formatNumber(stats.customerCount) : 'غير متاح', 'حسابات العملاء', Users, 'cyan'],
    ['المنتجات النشطة', stats ? formatNumber(stats.productCount) : 'غير متاح', 'في الكتالوج', Box, 'green'],
    ['قيد المعالجة', processingValue, 'تحتاج متابعة', Activity, 'orange'],
    ['مخزون منخفض', lowStockValue, 'يحتاج إعادة طلب', AlertTriangle, 'red'],
  ] as const;
  return <>
    <div className="hero"><div><span className="hero-kicker">نظرة تنفيذية مباشرة</span><h1>قرارات أفضل، بتشغيل أذكى</h1><p>تتابع الأغبري الطلبات والمخزون والعملاء في مكان واحد، مع مؤشرات واضحة تساعدك على التحرك بسرعة.</p></div><Button onClick={() => { void refetch(); void refetchAlerts(); void refetchProducts(); }} variant="secondary"><RefreshCw size={16} /> تحديث البيانات</Button></div>
    <div className="stats-grid">{cards.map(([label, value, note, Icon, color]) => <article className={`stat-card ${color}`} key={label}><div className="stat-top"><Icon size={22} /><span>{note}</span></div><small>{label}</small><strong>{value}</strong></article>)}</div>
    <div className="dashboard-grid"><section className="panel"><div className="panel-head"><div><h2>تنبيهات التشغيل</h2><p>أهم ما يحتاج انتباهك الآن</p></div><Button variant="outline" onClick={() => onNavigate('ai')}>مركز الذكاء <ChevronLeft size={15} /></Button></div>{alertsLoading ? <Loading /> : alertsError ? <ErrorBox message={alertsError} /> : !alerts ? <Empty text="تعذر التحقق من التنبيهات؛ حدّث البيانات." /> : alerts.filter((a) => !a.is_resolved).length ? alerts?.filter((a) => !a.is_resolved).slice(0, 4).map((alert) => <div className="alert-row" key={alert.id}><span className={`severity ${alert.severity}`}><AlertTriangle size={16} /></span><div><strong>{alert.title}</strong><p>{alert.body}</p></div><ChevronLeft size={16} /></div>) : <Empty text="لا توجد تنبيهات نشطة" />}</section><section className="panel"><div className="panel-head"><div><h2>الأصناف التي تحتاج متابعة</h2><p>حسب حد إعادة الطلب</p></div><Button variant="outline" onClick={() => onNavigate('products')}>إدارة المنتجات</Button></div>{productsLoading ? <Loading /> : productsError ? <ErrorBox message={productsError} /> : !products ? <Empty text="بيانات المخزون غير متاحة؛ لم يتم اعتبارها صفرًا." /> : lowStock.length ? lowStock.map((product) => <div className="stock-row" key={product.id}><div className="product-avatar"><Package size={17} /></div><div><strong>{product.name}</strong><span>{product.item_code}</span></div><b className={product.inventory?.quantity_available === 0 ? 'critical' : ''}>{formatNumber(product.inventory?.quantity_available as number)} {product.unit}</b></div>) : stats?.lowStockCount === null ? <Empty text="لم يتم تحديد مستودع؛ تعذر الجزم بأن المخزون ضمن الحدود الآمنة." /> : <Empty text="لا توجد أصناف منخفضة المخزون ضمن بيانات المستودع الحالية." />}</section></div>
    <section className="quick-panel"><div><Sparkline /><strong>تشغيل مترابط من لوحة واحدة</strong><p>افتح أي وحدة لإدارة التفاصيل وتحديث البيانات مباشرة.</p></div><div className="quick-links">{nav.slice(1, 7).map(({ id, label, icon: Icon }) => <button key={id} onClick={() => onNavigate(id)}><Icon size={17} />{label}</button>)}</div></section>
  </>;
}
function Sparkline() { return <svg className="sparkline" viewBox="0 0 160 52" aria-hidden="true"><path d="M2 42 C25 43 25 28 43 31 S65 42 79 27 S104 25 114 17 S139 24 158 6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>; }

function Heading({ eyebrow, title, description, icon: Icon }: { eyebrow: string; title: string; description: string; icon: IconType }) {
  return <div className="heading"><div className="heading-icon"><Icon size={25} /></div><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div></div>;
}

function Products({ onNotice, initialSearch }: { onNotice: (m: string) => void; initialSearch?: string }) {
  const { user } = useAuth();
  const canManageProductLifecycle = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager'));
  const canManageReorderPoint = canManageProductLifecycle;
  const [lifecycleBusyId, setLifecycleBusyId] = useState<string | null>(null);
  const { data, loading, error, refetch } = useFetch(fetchProducts);
  const { data: warehouses, loading: warehousesLoading, error: warehousesError } = useFetch(fetchActiveInventoryWarehouses);
  const [query, setQuery] = useState(initialSearch ?? '');
  useEffect(() => { if (initialSearch?.trim()) setQuery(initialSearch); }, [initialSearch]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<ProductWithInventory | null>(null);
  const [transferProduct, setTransferProduct] = useState<ProductWithInventory | null>(null);
  const [transferSource, setTransferSource] = useState('');
  const [transferDestination, setTransferDestination] = useState('');
  const [transferQuantity, setTransferQuantity] = useState('1');
  const [transferReason, setTransferReason] = useState('نقل مخزون بين المستودعات');
  const [transferKey, setTransferKey] = useState('');
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [thresholdProduct, setThresholdProduct] = useState<ProductWithInventory | null>(null);
  const [thresholdWarehouse, setThresholdWarehouse] = useState('');
  const [thresholdValue, setThresholdValue] = useState('');
  const [thresholdReason, setThresholdReason] = useState('مراجعة حد إعادة الطلب');
  const [thresholdCurrent, setThresholdCurrent] = useState<{ reorder_point: number | null; quantity_available: number } | null>(null);
  const [thresholdLoading, setThresholdLoading] = useState(false);
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [thresholdError, setThresholdError] = useState('');
  const thresholdRequestSequence = useRef(0);
  const rows = (data ?? []).filter((p) =>
    [p.name, p.item_code, p.sku ?? '', p.barcode ?? ''].join(' ').toLocaleLowerCase('ar').includes(query.trim().toLocaleLowerCase('ar')),
  );
  async function archive(product: ProductWithInventory) {
    if (!canManageProductLifecycle || lifecycleBusyId) return;
    if (!window.confirm('أرشفة ' + product.name + '؟ لن يظهر المنتج في المتجر، ويمكن إعادة تفعيله لاحقًا.')) return;
    setLifecycleBusyId(product.id);
    try {
      const result = await archiveAdminCatalogProduct(product.id);
      if (result.id !== product.id || result.status !== 'inactive' || result.archived !== true) {
        throw new Error('لم يؤكد الخادم أرشفة المنتج؛ لم يتم إعلان النجاح.');
      }
      await refetch();
      onNotice('تمت أرشفة المنتج وإخفاؤه من المتجر.');
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'تعذر أرشفة المنتج.');
    } finally {
      setLifecycleBusyId(null);
    }
  }
  async function restore(product: ProductWithInventory) {
    if (!canManageProductLifecycle || lifecycleBusyId) return;
    if (!window.confirm('إعادة تفعيل ' + product.name + '؟ سيعود المنتج إلى الكتالوج وفق قواعد المتجر.')) return;
    setLifecycleBusyId(product.id);
    try {
      const saved = await updateProduct(product.id, { status: 'active' });
      if (saved.id !== product.id) {
        throw new Error('لم يؤكد الخادم إعادة تفعيل المنتج؛ حدّث القائمة قبل إعادة المحاولة.');
      }
      await refetch();
      onNotice('تمت إعادة تفعيل المنتج.');
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'تعذر إعادة تفعيل المنتج.');
    } finally {
      setLifecycleBusyId(null);
    }
  }
  function openTransfer(product: ProductWithInventory) {
    setTransferProduct(product);
    setTransferSource(product.inventory?.warehouse_id ?? warehouses?.[0]?.id ?? '');
    setTransferDestination('');
    setTransferQuantity('1');
    setTransferReason('نقل مخزون بين المستودعات');
    setTransferKey(crypto.randomUUID());
    setTransferError('');
  }
  async function submitTransfer() {
    if (!transferProduct) return;
    setTransferSaving(true);
    setTransferError('');
    try {
      const result = await transferInventory({ productId: transferProduct.id, sourceWarehouseId: transferSource, destinationWarehouseId: transferDestination, quantity: Number(transferQuantity), reason: transferReason, idempotencyKey: transferKey });
      setTransferProduct(null);
      setTransferKey('');
      refetch();
      onNotice(result.idempotent_replay ? 'النقل السابق مؤكد؛ لم تُكرر الحركة.' : 'تم نقل المخزون وحفظ حركتي المستودعين.');
    } catch (e) { setTransferError(e instanceof Error ? e.message : 'تعذر نقل المخزون.'); }
    finally { setTransferSaving(false); }
  }
  async function loadThresholdSnapshot(productId: string, warehouseId: string) {
    const requestId = ++thresholdRequestSequence.current;
    setThresholdLoading(true);
    setThresholdCurrent(null);
    setThresholdValue('');
    setThresholdError('');
    try {
      const current = await fetchInventoryReorderPoint(productId, warehouseId);
      if (requestId !== thresholdRequestSequence.current) return;
      setThresholdCurrent(current);
      if (current) setThresholdValue(current.reorder_point === null ? '' : String(current.reorder_point));
      else setThresholdError('لا يوجد رصيد مخزون مثبت لهذا الصنف في المستودع. لن ننشئ كمية صفرية افتراضية؛ سجّل رصيدًا موثوقًا أولًا.');
    } catch (e) {
      if (requestId === thresholdRequestSequence.current) setThresholdError(e instanceof Error ? e.message : 'تعذر قراءة حد إعادة الطلب الحالي.');
    } finally {
      if (requestId === thresholdRequestSequence.current) setThresholdLoading(false);
    }
  }
  function openThreshold(product: ProductWithInventory) {
    if (!canManageReorderPoint) return;
    setThresholdProduct(product);
    const warehouseId = product.inventory?.warehouse_id ?? warehouses?.[0]?.id ?? '';
    setThresholdWarehouse(warehouseId);
    setThresholdReason('مراجعة حد إعادة الطلب');
    setThresholdCurrent(null);
    setThresholdValue('');
    setThresholdError('');
    if (warehouseId) void loadThresholdSnapshot(product.id, warehouseId);
    else setThresholdError('لا يوجد مستودع نشط محدد لهذه المؤسسة.');
  }
  function closeThreshold() {
    thresholdRequestSequence.current += 1;
    if (!thresholdSaving) setThresholdProduct(null);
  }
  async function submitThreshold() {
    if (!thresholdProduct || !thresholdWarehouse) return;
    const threshold = Number(thresholdValue);
    if (!Number.isSafeInteger(threshold) || threshold < 0 || threshold > 1000000000) { setThresholdError('أدخل حدًا صحيحًا بين صفر ومليار.'); return; }
    if (!thresholdReason.trim() || thresholdReason.trim().length > 1000) { setThresholdError('سبب التعديل مطلوب ولا يتجاوز 1000 حرف.'); return; }
    if (!thresholdCurrent) { setThresholdError('لا يمكن تعديل الحد دون رصيد مخزون مثبت في المستودع المحدد.'); return; }
    setThresholdSaving(true);
    setThresholdError('');
    try {
      const result = await setInventoryReorderPoint({ productId: thresholdProduct.id, warehouseId: thresholdWarehouse, reorderPoint: threshold, reason: thresholdReason });
      setThresholdProduct(null);
      await refetch();
      onNotice(result.unchanged ? 'حد إعادة الطلب مضبوط بالفعل على القيمة نفسها.' : 'تم تحديث حد إعادة الطلب وسجل التعديل؛ أعيد تقييم مهمة الشراء تلقائيًا.');
    } catch (e) { setThresholdError(e instanceof Error ? e.message : 'تعذر حفظ حد إعادة الطلب.'); }
    finally { setThresholdSaving(false); }
  }

  function renderTransferModal() {
    if (!transferProduct) return null;
    return (
      <Modal title={'نقل مخزون — ' + transferProduct.name} onClose={() => { if (!transferSaving) setTransferProduct(null); }}>
      <p style={{ marginTop: 0, color: 'var(--muted-foreground, #64748b)' }}>يُنفَّذ النقل بمعاملة واحدة، ولا تُنقل الكميات المحجوزة للطلبات. إعادة المحاولة بنفس المفتاح لا تكرر الحركة.</p>
      {warehousesLoading ? <Loading /> : warehousesError ? <ErrorBox message={warehousesError} /> : (warehouses ?? []).length < 2 ? <ErrorBox message="يلزم وجود مستودعين نشطين على الأقل داخل المؤسسة لإجراء النقل." /> : <>
        <Field label="مستودع المصدر"><select value={transferSource} onChange={(e) => setTransferSource(e.target.value)}><option value="">اختر المستودع المصدر</option>{(warehouses ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}{w.code ? ' — ' + w.code : ''}</option>)}</select></Field>
        <Field label="المستودع المستلم"><select value={transferDestination} onChange={(e) => setTransferDestination(e.target.value)}><option value="">اختر المستودع المستلم</option>{(warehouses ?? []).filter((w) => w.id !== transferSource).map((w) => <option key={w.id} value={w.id}>{w.name}{w.code ? ' — ' + w.code : ''}</option>)}</select></Field>
        <div className="form-grid"><Field label="الكمية المراد نقلها (يُتحقق الخادم من المتاح بعد الحجوزات)"><input type="number" min="0.001" max="999999999999.999" step="0.001" value={transferQuantity} onChange={(e) => setTransferQuantity(e.target.value)} /></Field><Field label="سبب النقل"><input maxLength={1000} value={transferReason} onChange={(e) => setTransferReason(e.target.value)} /></Field></div>
        {transferError && <div className="form-error" role="alert">{transferError}</div>}
        <div className="modal-actions"><Button variant="outline" onClick={() => setTransferProduct(null)} disabled={transferSaving}>إلغاء</Button><Button onClick={submitTransfer} disabled={transferSaving || !transferSource || !transferDestination || transferSource === transferDestination || !transferQuantity || !transferReason.trim()}>{transferSaving ? 'جارٍ تسجيل حركة النقل...' : 'تنفيذ النقل'}</Button></div>
      </>}
    </Modal>
    );
  }

  function renderThresholdSnapshot() {
    if (thresholdLoading) return <Loading />;
    if (!thresholdCurrent) return null;
    return (
      <p style={{ margin: 0, color: 'var(--muted-foreground, #64748b)' }}>
        المتاح المسجل: {formatNumber(thresholdCurrent.quantity_available)} — الحد الحالي: {thresholdCurrent.reorder_point === null ? 'غير مضبوط' : formatNumber(thresholdCurrent.reorder_point)}
      </p>
    );
  }

  function renderThresholdFormContent() {
    if (warehousesLoading) return <Loading />;
    if (warehousesError) return <ErrorBox message={warehousesError} />;
    if ((warehouses ?? []).length === 0) return <ErrorBox message="لا يوجد مستودع نشط داخل المؤسسة." />;

    return (
      <>
        <Field label="المستودع">
          <select value={thresholdWarehouse} onChange={(e) => {
            const id = e.target.value;
            setThresholdWarehouse(id);
            if (id) void loadThresholdSnapshot(thresholdProduct!.id, id);
          }}>
            {(warehouses ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}{w.code ? ' — ' + w.code : ''}</option>)}
          </select>
        </Field>
        {renderThresholdSnapshot()}
        <Field label="حد إعادة الطلب بوحدات الصنف">
          <input type="number" min="0" max="1000000000" step="1" value={thresholdValue} onChange={(e) => setThresholdValue(e.target.value)} placeholder="أدخل عددًا صحيحًا" />
        </Field>
        <Field label="سبب تغيير الحد">
          <input maxLength={1000} value={thresholdReason} onChange={(e) => setThresholdReason(e.target.value)} />
        </Field>
        {thresholdError && <div className="form-error" role="alert">{thresholdError}</div>}
        <div className="modal-actions">
          <Button variant="outline" onClick={closeThreshold} disabled={thresholdSaving}>إلغاء</Button>
          <Button onClick={submitThreshold} disabled={thresholdSaving || thresholdLoading || !thresholdCurrent || thresholdValue.trim() === '' || !Number.isSafeInteger(Number(thresholdValue)) || Number(thresholdValue) < 0 || Number(thresholdValue) > 1000000000 || !thresholdReason.trim()}>
            {thresholdSaving ? 'جارٍ حفظ الحد...' : 'حفظ حد إعادة الطلب'}
          </Button>
        </div>
      </>
    );
  }

  function renderThresholdModal() {
    if (!thresholdProduct) return null;
    return (
      <Modal title={'حد إعادة الطلب — ' + thresholdProduct.name} onClose={closeThreshold}>
        <p style={{ marginTop: 0, color: 'var(--muted-foreground, #64748b)' }}>
          يُحفظ الحد حسب الصنف والمستودع. تغيير الحد يحدّث مهمة إعادة الطلب تلقائيًا ويسجل السبب والمستخدم؛ لا يُنشأ رصيد مفقود افتراضيًا.
        </p>
        {renderThresholdFormContent()}
      </Modal>
    );
  }

  return <>
    <Heading eyebrow="الأصناف والمخزون" title="إدارة المنتجات" description="تحكم كامل في الكتالوج والأسعار وحدود المخزون" icon={Box} />
    <div className="toolbar"><span className="toolbar-note">{data?.length ?? 0} منتج في الكتالوج</span><div className="toolbar-actions"><Button variant="secondary" onClick={refetch}><RefreshCw size={16} /> تحديث</Button><Button onClick={() => { setEditing(null); setModal(true); }}><Plus size={17} /> إضافة منتج</Button></div></div>
    <section className="panel table-panel"><div className="table-head"><h2>كتالوج المنتجات</h2><label className="search-field"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو الرمز أو SKU أو الباركود..." /></label></div>
      {loading ? <Loading /> : error ? <ErrorBox message={error} /> : <TableWrap><table>
        <thead><tr><th>المنتج</th><th>الرمز</th><th>التصنيف</th><th>حالة المنتج</th><th>السعر</th><th>المتاح</th><th>حالة المخزون</th><th>إجراء المخزون</th><th /></tr></thead>
        <tbody>{rows.map((p) => {
          const qty = p.inventory?.quantity_available;
          const reorderPoint = p.inventory?.reorder_point ?? p.min_stock_level;
          const stockStatus = getInventoryAvailabilityStatus(qty, reorderPoint);
          const low = stockStatus === 'low';
          return <tr key={p.id}>
            <td><strong>{p.name}</strong><small>{p.description ?? 'بدون وصف'}</small><small>{p.is_featured ? 'منتج مميز في واجهة المتجر' : 'عرض عادي'} · ترتيب الظهور: {formatNumber(p.sort_order ?? 0)}</small></td><td><code>{p.item_code}</code>{p.sku && <small>SKU: {p.sku}</small>}{p.barcode && <small>باركود: {p.barcode}</small>}</td><td>{p.category?.name ?? 'غير مصنف'}</td><td><span className={'badge ' + (p.status === 'inactive' ? 'warning' : p.status === 'active' ? 'success' : 'info')}>{p.status === 'inactive' ? 'مؤرشف' : p.status === 'active' ? 'نشط' : 'غير محدد'}</span></td><td>{typeof p.base_price === 'number' && Number.isFinite(p.base_price) ? formatCurrency(p.base_price) : 'غير متاح'}</td><td>{typeof qty === 'number' && Number.isFinite(qty) ? formatNumber(qty) + ' ' + p.unit : 'غير متاح'}</td>
            <td><span className={'badge ' + (stockStatus === 'unknown' ? 'info' : low ? 'warning' : 'success')}>{stockStatus === 'unknown' ? 'غير متاح' : low ? 'منخفض' : 'متوفر'}</span></td>
            <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Button variant="outline" onClick={() => openTransfer(p)}><ArrowLeftRight size={15} /> نقل مخزون</Button>{canManageReorderPoint && <Button variant="outline" onClick={() => openThreshold(p)}>حد إعادة الطلب</Button>}</div></td>
            <td><div className="row-actions">
              <button aria-label={'تعديل ' + p.name} title="تعديل المنتج" onClick={() => { setEditing(p); setModal(true); }}><Pencil size={15} /></button>
              {canManageProductLifecycle && p.status === 'active' && <button aria-label={'أرشفة ' + p.name} title="أرشفة المنتج" disabled={lifecycleBusyId === p.id} onClick={() => void archive(p)}><Trash2 size={15} /></button>}
              {canManageProductLifecycle && p.status === 'inactive' && <button aria-label={'إعادة تفعيل ' + p.name} title="إعادة تفعيل المنتج" disabled={lifecycleBusyId === p.id} onClick={() => void restore(p)}><Check size={15} /></button>}
            </div></td>
          </tr>;
        })}</tbody>
      </table>{!rows.length && <Empty text="لا توجد منتجات مطابقة" />}</TableWrap>}
    </section>
    {modal && <ProductModal product={editing} canManageLifecycle={canManageProductLifecycle} onClose={() => setModal(false)} onSaved={(message) => { setModal(false); refetch(); onNotice(message ?? (editing ? 'تم تحديث المنتج' : 'تمت إضافة المنتج')); }} />}
    {renderTransferModal()}
    {renderThresholdModal()}
  </>;
}
export function ProductModal({
  product,
  onClose,
  onSaved,
  canManageLifecycle = false,
}: {
  product: ProductWithInventory | null;
  onClose: () => void;
  onSaved: (message?: string) => void;
  canManageLifecycle?: boolean;
}) {
  const {
    data: categories,
    loading: categoriesLoading,
    error: categoriesError,
    refetch: refetchCategories,
  } = useFetch(fetchCategories);
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [productStatus, setProductStatus] = useState<'active' | 'inactive'>(product?.status === 'inactive' ? 'inactive' : 'active');
  const [nameEn, setNameEn] = useState(product?.name_en ?? '');
  const [code, setCode] = useState(product?.item_code ?? '');
  const [unit, setUnit] = useState(product?.unit ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [barcode, setBarcode] = useState(product?.barcode ?? '');
  const [isFeatured, setIsFeatured] = useState(product?.is_featured ?? false);
  const [sortOrder, setSortOrder] = useState(String(product?.sort_order ?? 0));
  const [price, setPrice] = useState(String(product?.base_price ?? ''));
  const [priceWholesaleOfWholesale, setPriceWholesaleOfWholesale] = useState('');
  const [priceWholesale, setPriceWholesale] = useState('');
  const [priceRetail, setPriceRetail] = useState('');
  const [minOrderQuantity, setMinOrderQuantity] = useState(String(product?.min_order_quantity ?? 1));
  const [orderQuantityMultiple, setOrderQuantityMultiple] = useState(String(product?.order_quantity_multiple ?? 1));
  const [category, setCategory] = useState(product?.category_id ?? '');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImageRequested, setRemoveImageRequested] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(product?.image_url ?? null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryRemoveUrls, setGalleryRemoveUrls] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // React state alone does not block two click events dispatched before a rerender.
  const saveInFlight = useRef(false);

  useEffect(() => {
    if (!imageFile) { setImagePreview(removeImageRequested ? null : product?.image_url ?? null); return; }
    const preview = URL.createObjectURL(imageFile);
    setImagePreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [imageFile, product?.image_url, removeImageRequested]);

  function chooseImage(file: File | null) {
    setError('');
    if (!file) { setImageFile(null); return; }
    const issue = validateProductImageFile(file);
    if (issue) { setImageFile(null); setRemoveImageRequested(false); setError(issue); return; }
    setRemoveImageRequested(false);
    setImageFile(file);
  }

  function clearImageSelection() {
    setError('');
    if (imageFile) {
      setImageFile(null);
      setRemoveImageRequested(false);
      return;
    }
    setRemoveImageRequested(Boolean(product?.image_url));
    setImagePreview(null);
  }

  function chooseGalleryFiles(files: File[]) {
    setError('');
    const savedCount = (product?.image_gallery_urls ?? []).length - galleryRemoveUrls.length;
    if (savedCount + galleryFiles.length + files.length > 8) {
      setError('يسمح معرض المنتج بثماني صور إضافية كحد أقصى؛ أزل صورة قبل إضافة المزيد.');
      return;
    }
    for (const file of files) {
      const issue = validateProductImageFile(file);
      if (issue) { setError(issue); return; }
    }
    setGalleryFiles((current) => [...current, ...files]);
  }

  async function persistProductGalleryChanges(savedId: string): Promise<boolean> {
    if (galleryRemoveUrls.length === 0 && galleryFiles.length === 0) return true;
    let removed = 0;
    let uploaded = 0;
    try {
      for (const url of galleryRemoveUrls) {
        await removeProductGalleryImage(savedId, url);
        removed += 1;
      }
      for (const file of galleryFiles) {
        await uploadProductGalleryImage(savedId, await toWebp(file));
        uploaded += 1;
      }
      return true;
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'تعذر تحديث معرض الصور.';
      onSaved('حُفظت بيانات المنتج؛ اكتمل ' + removed + ' إزالة و' + uploaded + ' رفع من معرض الصور قبل التعذر. حدّث المنتج لمراجعة الحالة الحالية. ' + detail);
      return false;
    }
  }

  async function persistProductImageChanges(savedId: string): Promise<boolean> {
    if (imageFile) {
      try {
        const webp = await toWebp(imageFile);
        await uploadProductImage(savedId, webp, product?.image_url);
        return true;
      } catch (imageCause) {
        if (imageCause instanceof ProductImageCleanupError && imageCause.imageLinked) {
          onSaved('تم ربط الصورة الجديدة، لكن تعذر تنظيف الصورة السابقة من التخزين.');
          return false;
        }
        const detail = imageCause instanceof Error ? imageCause.message : 'خطأ غير معروف أثناء رفع الصورة.';
        onSaved('تم حفظ بيانات المنتج، لكن لم تُربط الصورة: ' + detail);
        return false;
      }
    }

    if (!product || !removeImageRequested) return true;
    try {
      await removeProductImage(savedId, product.image_url ?? null);
      return true;
    } catch (imageCause) {
      if (imageCause instanceof ProductImageCleanupError && !imageCause.imageLinked) {
        onSaved('أُزيلت الصورة من سجل المنتج، لكن تعذر تنظيف ملفها من التخزين.');
      } else {
        onSaved('تم حفظ بيانات المنتج، لكن تعذر تأكيد إزالة الصورة. حدّث القائمة قبل تكرار العملية.');
      }
      return false;
    }
  }

  async function save() {
    if (saveInFlight.current || saving) return;
    if (!name.trim() || !code.trim() || !unit.trim() || price.trim() === '' || description.length > 2000) {
      setError('أكمل الحقول المطلوبة، بما فيها الوحدة الأساسية، وتأكد أن الوصف لا يتجاوز 2000 حرف.');
      return;
    }
    if (unit.trim().length > 40) { setError('الوحدة الأساسية لا تتجاوز 40 حرفًا.'); return; }
    function parsePriceValue(raw: string, label: string): number {
      if (raw.trim() === '') throw new Error(label + ' مطلوب.');
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 999999999999
        || Math.abs(Math.round(value * 100) - value * 100) > 1e-7) {
        throw new Error(label + ' يجب أن يكون مبلغًا صحيحًا حتى خانتين عشريتين.');
      }
      return value;
    }
    let priceValue: number;
    let vipPriceValue: number | null = null;
    let wholesalePriceValue: number | null = null;
    let retailPriceValue: number | null = null;
    try {
      priceValue = parsePriceValue(price, 'السعر الأساسي');
      if (!product) {
        vipPriceValue = parsePriceValue(priceWholesaleOfWholesale, 'سعر جملة الجملة');
        wholesalePriceValue = parsePriceValue(priceWholesale, 'سعر الجملة');
        retailPriceValue = parsePriceValue(priceRetail, 'سعر التجزئة');
      }
    } catch (priceCause) {
      setError(priceCause instanceof Error ? priceCause.message : 'تحقق من أسعار المنتج.');
      return;
    }
    const minimumValue = Number(minOrderQuantity);
    const multipleValue = Number(orderQuantityMultiple);
    const sortOrderValue = Number(sortOrder);
    if (!Number.isSafeInteger(minimumValue) || minimumValue < 1 || minimumValue > 10000) { setError('الحد الأدنى للطلب يجب أن يكون عددًا صحيحًا بين 1 و10000.'); return; }
    if (!Number.isSafeInteger(multipleValue) || multipleValue < 1 || multipleValue > 10000) { setError('مضاعف الكمية يجب أن يكون عددًا صحيحًا بين 1 و10000.'); return; }
    if (sortOrder.trim() === '' || !Number.isSafeInteger(sortOrderValue) || sortOrderValue < 0 || sortOrderValue > 1000000000) { setError('ترتيب الظهور يجب أن يكون عددًا صحيحًا بين صفر ومليار.'); return; }
    saveInFlight.current = true;
    setSaving(true); setError('');
    let productSaved = false;
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        name_en: nameEn.trim() || null,
        item_code: code.trim(),
        sku: sku.trim() || null,
        barcode: barcode.trim() || null,
        base_price: priceValue,
        min_order_quantity: minimumValue,
        order_quantity_multiple: multipleValue,
        category_id: category || null,
        is_featured: isFeatured,
        sort_order: sortOrderValue,
        unit: unit.trim(),
        status: productStatus,
      };
      let savedProductId: string;
      if (product) {
        const saved = await updateProduct(product.id, payload);
        savedProductId = saved.id;
      } else {
        if (vipPriceValue === null || wholesalePriceValue === null || retailPriceValue === null) {
          throw new Error('أدخل أسعار الشرائح الثلاث قبل إنشاء المنتج.');
        }
        const created = await createProduct({
          ...payload,
          price_wholesale_of_wholesale: vipPriceValue,
          price_wholesale: wholesalePriceValue,
          price_retail: retailPriceValue,
        });
        savedProductId = created.id;
      }
      productSaved = true;
      if (!(await persistProductImageChanges(savedProductId))) return;
      if (!(await persistProductGalleryChanges(savedProductId))) return;
      onSaved();
    } catch (cause) {
      if (productSaved) onSaved('تم حفظ بيانات المنتج؛ تعذر تأكيد اكتمال العملية. أعد تحديث القائمة قبل التكرار.');
      else setError(cause instanceof Error ? cause.message : 'تعذر حفظ المنتج.');
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal
      title={product ? 'تعديل المنتج' : 'إضافة منتج'}
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <Field label="اسم المنتج">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} disabled={saving} />
      </Field>
      <Field label="اسم المنتج بالإنجليزية (اختياري)">
        <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} maxLength={240} disabled={saving} dir="auto" />
      </Field>
      <Field label="وصف المنتج (اختياري)">
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={3} disabled={saving} placeholder="أدخل وصفًا دقيقًا للمنتج وخصائصه." />
      </Field>
      <div className="form-grid">
        <Field label="رمز المنتج">
          <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={80} disabled={saving} />
        </Field>
        <Field label="الوحدة الأساسية (مثل حبة، عبوة، كرتون)">
          <input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={40} disabled={saving} placeholder="أدخل وحدة القياس الأساسية" />
        </Field>
      </div>
      <div className="form-grid">
        <Field label="السعر الأساسي">
          <input
            type="number"
            min="0"
            max="999999999999"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={saving}
          />
        </Field>
      </div>
      {!product && (
        <>
          <p className="text-muted" style={{ margin: '4px 0 8px', fontSize: 12, lineHeight: 1.7 }}>
            يلزم تحديد أسعار الشرائح عند إنشاء المنتج. لا تُستنسخ أسعار التجزئة إلى الجملة تلقائيًا.
          </p>
          <div className="form-grid">
            <Field label="سعر جملة الجملة">
              <input type="number" min="0" max="999999999999" step="0.01" value={priceWholesaleOfWholesale}
                onChange={(event) => setPriceWholesaleOfWholesale(event.target.value)} disabled={saving} />
            </Field>
            <Field label="سعر الجملة">
              <input type="number" min="0" max="999999999999" step="0.01" value={priceWholesale}
                onChange={(event) => setPriceWholesale(event.target.value)} disabled={saving} />
            </Field>
            <Field label="سعر التجزئة">
              <input type="number" min="0" max="999999999999" step="0.01" value={priceRetail}
                onChange={(event) => setPriceRetail(event.target.value)} disabled={saving} />
            </Field>
          </div>
        </>
      )}
      <div className="form-grid">
        <Field label="SKU (اختياري)">
          <input value={sku} onChange={(e) => setSku(e.target.value)} maxLength={80} disabled={saving} dir="auto" />
        </Field>
        <Field label="الباركود (اختياري)">
          <input value={barcode} onChange={(e) => setBarcode(e.target.value)} maxLength={100} disabled={saving} dir="auto" />
        </Field>
      </div>
      <div className="form-grid">
        <Field label="ظهور المنتج في المتجر">
          <select aria-label="ظهور المنتج في المتجر" value={isFeatured ? 'featured' : 'standard'}
            onChange={(event) => setIsFeatured(event.target.value === 'featured')} disabled={saving}>
            <option value="standard">عرض عادي</option>
            <option value="featured">منتج مميز — يظهر أولًا</option>
          </select>
        </Field>
        <Field label="ترتيب الظهور (الأقل أولًا)">
          <input aria-label="ترتيب الظهور" type="number" min="0" max="1000000000" step="1" inputMode="numeric"
            value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} disabled={saving} />
        </Field>
      </div>
      <p style={{ margin: '-4px 0 12px', color: '#667b80', fontSize: 12, lineHeight: 1.7 }}>
        تظهر المنتجات المميزة قبل المنتجات العادية؛ والرقم الأصغر يسبق الأكبر داخل المجموعة نفسها.
      </p>
      {canManageLifecycle && (
        <Field label="حالة المنتج">
          <select
            aria-label="حالة المنتج"
            value={productStatus}
            onChange={(event) => setProductStatus(event.target.value as 'active' | 'inactive')}
            disabled={saving}
          >
            <option value="active">نشط — يظهر في المتجر وفق الأهلية</option>
            <option value="inactive">مؤرشف — مخفي من المتجر</option>
          </select>
        </Field>
      )}
      {categoriesError && (
        <div className="form-error" role="alert">
          <span>تعذر تحميل التصنيفات: {categoriesError}</span>
          <Button
            variant="outline"
            onClick={() => void refetchCategories()}
            disabled={saving || categoriesLoading}
          >
            إعادة المحاولة
          </Button>
        </div>
      )}
      <div className="form-grid">
        <Field label="الحد الأدنى للطلب (عدد الوحدات)">
          <input type="number" min="1" max="10000" step="1" inputMode="numeric" value={minOrderQuantity}
            onChange={(e) => setMinOrderQuantity(e.target.value)} disabled={saving} />
        </Field>
        <Field label="مضاعف الكمية (حجم العبوة)">
          <input type="number" min="1" max="10000" step="1" inputMode="numeric" value={orderQuantityMultiple}
            onChange={(e) => setOrderQuantityMultiple(e.target.value)} disabled={saving} />
        </Field>
      </div>
      <p style={{ margin: '-4px 0 12px', color: '#667b80', fontSize: 12, lineHeight: 1.7 }}>
        يُسمح بالكمية من الحد الأدنى ثم بالزيادة بمقدار المضاعف. مثال: الحد 3 والمضاعف 2 يسمح بـ 3 و5 و7. يرفض الخادم أي طلب مخالف.
      </p>
      <Field label="التصنيف">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={saving || categoriesLoading || Boolean(categoriesError)}
        >
          <option value="">
            {categoriesLoading ? 'جار تحميل التصنيفات…' : categoriesError ? 'تعذر تحميل التصنيفات' : 'غير مصنف'}
          </option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      {product && canManageLifecycle && <ProductUnitConversionsEditor productId={product.id} />}
      <Field label="صورة المنتج (JPG / PNG / WebP، بحد أقصى 8 ميغابايت)">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            chooseImage(e.currentTarget.files?.[0] ?? null);
            e.currentTarget.value = '';
          }}
          disabled={saving}
        />
      </Field>
      {imagePreview && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: 8,
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 12,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' }}>
            <img
              src={imagePreview}
              alt={'معاينة صورة ' + name}
              style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 8 }}
            />
            <Button variant="outline" onClick={clearImageSelection} disabled={saving}>
              {imageFile ? 'إلغاء الصورة الجديدة' : 'إزالة الصورة الحالية'}
            </Button>
          </div>
        </div>
      )}
      {imageFile && (
        <p className="text-muted">
          ستُضغط الصورة إلى WebP بحد أقصى 1600×1600 وتُرفع إلى مساحة صور الكتالوج للمؤسسة.
        </p>
      )}
      <section aria-label="معرض صور المنتج" style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        <strong>معرض الصور الإضافية ({((product?.image_gallery_urls ?? []).length - galleryRemoveUrls.length + galleryFiles.length).toLocaleString('ar-YE')} / 8)</strong>
        <p className="text-muted" style={{ margin: 0 }}>أضف حتى ثماني صور تفصيلية بجانب الصورة الرئيسية. تُحفظ في مساحة المؤسسة وتُربط بأمر خادمي مدقق.</p>
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="إضافة صور إضافية للمنتج"
          onChange={(event) => { chooseGalleryFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ''; }}
          disabled={saving || (product?.image_gallery_urls ?? []).length - galleryRemoveUrls.length + galleryFiles.length >= 8} />
        {(product?.image_gallery_urls ?? []).filter((url) => !galleryRemoveUrls.includes(url)).length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 8 }}>
            {(product?.image_gallery_urls ?? []).filter((url) => !galleryRemoveUrls.includes(url)).map((url) => (
              <div key={url} style={{ display: 'grid', gap: 4, border: '1px solid var(--border, #e2e8f0)', borderRadius: 8, padding: 6 }}>
                <img src={url} alt={'صورة إضافية للمنتج ' + name} style={{ width: '100%', height: 84, objectFit: 'contain' }} />
                <button type="button" className="btn ghost" disabled={saving} onClick={() => setGalleryRemoveUrls((current) => [...current, url])}>إزالة</button>
              </div>
            ))}
          </div>
        )}
        {galleryFiles.length > 0 && <div style={{ display: 'grid', gap: 5 }}>
          {galleryFiles.map((file, index) => (
            <div key={file.name + '-' + file.size + '-' + file.lastModified} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <span>{file.name}</span>
              <button type="button" className="btn ghost" disabled={saving} onClick={() => setGalleryFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}>إلغاء الاختيار</button>
            </div>
          ))}
        </div>}
      </section>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions">
        <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
        <Button onClick={() => void save()} disabled={saving || categoriesLoading || Boolean(categoriesError)}>
          {saving ? 'جار الحفظ والرفع...' : 'حفظ المنتج'}
        </Button>
      </div>
    </Modal>
  );
}

export function Customers({ onNotice, initialSearch }: { onNotice: (m: string) => void; initialSearch?: string }) {
  const { user } = useAuth();
  const canReadCustomer360 = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager'));
  const canManageCustomerActivation = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager' || role === 'staff' || role === 'customer_manager'));
  const canManageCustomerRecords = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager' || role === 'customer_manager'));
  const canManageCustomerLifecycle = canManageCustomerRecords;
  const isCustomerManagerOnly = Boolean(user?.roles.includes('customer_manager') &&
    !user.roles.some((role) => role === 'admin' || role === 'manager' || role === 'staff' || role === 'accountant'));
  const [directory, setDirectory] = useState<Awaited<ReturnType<typeof fetchCustomerDirectoryPage>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(initialSearch ?? '');
  const [appliedSearch, setAppliedSearch] = useState(initialSearch ?? '');
  const [page, setPage] = useState(1);
  useEffect(() => {
    if (!initialSearch?.trim()) return;
    setQuery(initialSearch);
    setAppliedSearch(initialSearch);
    setPage(1);
  }, [initialSearch]);
  const [reloadKey, setReloadKey] = useState(0);
  const [modal, setModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDirectoryRow | null>(null);
  const [activationCustomer, setActivationCustomer] = useState<CustomerActivationCandidate | null>(null);
  const [tierCustomer, setTierCustomer] = useState<CustomerDirectoryRow | null>(null);
  const [statusCustomer, setStatusCustomer] = useState<CustomerDirectoryRow | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async (): Promise<boolean> => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCustomerDirectoryPage({
        search: appliedSearch,
        page,
        pageSize: 25,
      });
      if (requestId !== requestIdRef.current) return false;
      setDirectory(result);
      if (result.page !== page) setPage(result.page);
      return true;
    } catch (cause) {
      if (requestId === requestIdRef.current) {
        setDirectory(null);
        setError(cause instanceof Error ? cause.message : 'تعذر تحميل دليل العملاء.');
      }
      return false;
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [appliedSearch, page, reloadKey]);

  useEffect(() => {
    void load();
    return () => { requestIdRef.current += 1; };
  }, [load]);

  const rows = directory?.rows ?? [];
  const pageSize = directory?.pageSize ?? 25;
  const pageCount = directory ? Math.max(1, Math.ceil(directory.totalCount / pageSize)) : 1;
  const resultSummary = loading
    ? 'جار تحميل دليل العملاء...'
    : error
      ? 'تعذر تأكيد عدد العملاء'
      : directory
        ? 'إجمالي النتائج: ' + formatNumber(directory.totalCount)
        : 'لا توجد نتيجة مؤكدة';

  return <>
    <Heading eyebrow="المبيعات والعملاء" title="إدارة العملاء" description="اعتماد الحسابات ومتابعة الأرصدة وشرائح الأسعار" icon={Users} />
    <div className="toolbar">
      <span className="toolbar-note" aria-label="إجمالي نتائج دليل العملاء">{resultSummary}</span>
      <div className="toolbar-actions">
        <Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> تحديث</Button>
        {!isCustomerManagerOnly && <Button onClick={() => setModal(true)}><Plus size={17} /> إضافة عميل</Button>}
      </div>
    </div>
    <section className="panel table-panel">
      <div className="table-head">
        <h2>دليل العملاء</h2>
        <form className="search-field" onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setAppliedSearch(query.trim());
          setReloadKey((value) => value + 1);
        }}>
          <Search size={16} />
          <input
            aria-label="البحث في دليل العملاء"
            value={query}
            maxLength={254}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث باسم المنشأة أو جهة الاتصال أو الهاتف أو البريد الإلكتروني أو رمز العميل..."
          />
          <button type="submit" disabled={loading}>بحث</button>
        </form>
      </div>
      {loading ? <Loading /> : error ? <ErrorBox message={error} /> : <>
        <TableWrap>
          <table>
            <thead><tr><th>العميل</th><th>جهة الاتصال</th><th>الشريحة</th>{!isCustomerManagerOnly && <><th>الرصيد</th><th>الحد الائتماني</th></>}<th>الحالة</th><th /></tr></thead>
            <tbody>{rows.map((c) => <tr key={c.id}>
              <td><strong>{c.business_name}</strong><small>{c.customer_code}</small></td>
              <td>{c.contact_name ?? '—'}<small>{c.phone ?? '—'}</small><small>{c.email ?? '—'}</small></td>
              <td><span className="tier">{c.tier === 'vip' ? 'جملة الجملة' : c.tier === 'wholesale' ? 'جملة' : 'تجزئة'}</span></td>
              {!isCustomerManagerOnly && <><td className={typeof c.current_balance === 'number' && c.current_balance > 0 ? 'amount-danger' : ''}>{typeof c.current_balance === 'number' ? formatCurrency(c.current_balance) : 'غير متاح'}</td><td>{typeof c.credit_limit === "number" ? formatCurrency(c.credit_limit) : "غير متاح"}</td></>}
              <td><span className={`badge ${c.status === 'approved' ? 'success' : c.status === 'pending' ? 'warning' : 'danger'}`}>{CUSTOMER_STATUS_LABELS[c.status] ?? c.status}</span></td>
              <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {canReadCustomer360 && <Button variant="outline" onClick={() => setSelectedCustomer(c)}>ملف 360</Button>}
                {canManageCustomerRecords && <Button variant="outline" onClick={() => setTierCustomer(c)}>تغيير الشريحة</Button>}
                {canManageCustomerActivation && c.status === 'approved' && <Button variant="outline" onClick={() => setActivationCustomer({
                  id: c.id,
                  business_name: c.business_name.trim(),
                  status: c.status,
                  email: c.email,
                  profile_id: c.profile_id ?? null,
                  customer_code: c.customer_code,
                })}>دعوة تفعيل</Button>}
                {canManageCustomerLifecycle && <Button variant="outline" onClick={() => setStatusCustomer(c)}>إدارة دورة الحياة</Button>}
              </div></td>
            </tr>)}</tbody>
          </table>
          {rows.length === 0 && <Empty text={appliedSearch ? 'لا توجد نتائج مطابقة للبحث.' : 'لا يوجد عملاء مسجلون.'} />}
        </TableWrap>
        {pageCount > 1 && <nav aria-label="صفحات دليل العملاء" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', padding: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn outline" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={loading || page <= 1} aria-label="صفحة العملاء السابقة">السابق</button>
          <span role="status" aria-label="صفحة دليل العملاء الحالية">{'صفحة ' + page + ' من ' + pageCount}</span>
          <button type="button" className="btn outline" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={loading || page >= pageCount} aria-label="صفحة العملاء التالية">التالي</button>
        </nav>}
      </>}
    </section>
    {selectedCustomer && <AdminCustomer360 customer={selectedCustomer} onClose={() => setSelectedCustomer(null)} />}
    {activationCustomer && <CustomerActivationInvitationDialog customer={activationCustomer} onClose={() => setActivationCustomer(null)} />}
    {tierCustomer && <CustomerTierDialog customer={tierCustomer} onClose={() => setTierCustomer(null)} onSaved={() => {
      setTierCustomer(null);
      void load().then((refreshed) => onNotice(refreshed
        ? 'تم تحديث شريحة العميل وتسجيل السبب في سجل التدقيق.'
        : 'تم تحديث الشريحة، لكن تعذّر تحديث القائمة. اضغط تحديث للمزامنة.'));
    }} />}
    {statusCustomer && <CustomerLifecycleDialog customer={statusCustomer} onClose={() => setStatusCustomer(null)} onSaved={(nextStatus) => {
      setStatusCustomer(null);
      void load().then((refreshed) => onNotice(refreshed
        ? `تم تغيير حالة العميل إلى ${CUSTOMER_STATUS_LABELS[nextStatus] ?? nextStatus} وتسجيل السبب في سجل التدقيق.`
        : 'تم تحديث حالة العميل وتسجيل السبب، لكن تعذّر تحديث القائمة. اضغط تحديث للمزامنة.'));
    }} />}
    {modal && <CustomerModal onClose={() => setModal(false)} onSaved={() => {
      setModal(false);
      setQuery('');
      setAppliedSearch('');
      setPage(1);
      setReloadKey((value) => value + 1);
      onNotice('تمت إضافة العميل');
    }} />}
  </>;
}


export function CustomerTierDialog({ customer, onClose, onSaved }: {
  customer: Pick<CustomerDirectoryRow, "id" | "business_name" | "tier">; onClose: () => void; onSaved: () => void;
}) {
  const currentTier = typeof customer.tier === 'string' ? customer.tier.trim().toLowerCase() : '';
  const supportedTiers = ['retail', 'wholesale', 'vip'] as const;
  const [tier, setTier] = useState(supportedTiers.includes(currentTier as typeof supportedTiers[number]) ? currentTier : 'retail');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submitInFlight = useRef(false);
  async function save() {
    if (submitInFlight.current || saving) return;
    setError('');
    const cleanReason = reason.trim();
    if (tier === currentTier) { setError('اختر شريحة مختلفة عن الشريحة الحالية.'); return; }
    if (cleanReason.length < 3 || cleanReason.length > 500) {
      setError('سبب تغيير الشريحة مطلوب (3 إلى 500 حرف).'); return;
    }
    submitInFlight.current = true;
    setSaving(true);
    try {
      await updateCustomerTier(customer.id, currentTier, tier, cleanReason);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحديث شريحة العميل.');
      submitInFlight.current = false;
    } finally { setSaving(false); }
  }
  return <Modal title={`تغيير شريحة ${customer.business_name}`} onClose={() => { if (!saving) onClose(); }}>
    <p className="text-muted">يتطلب تغيير الشريحة صلاحية مدير أو مسؤول، مع تسجيل السبب والقيمة السابقة والجديدة في سجل التدقيق.</p>
    <Field label="شريحة العميل الجديدة">
      <select aria-label="شريحة العميل الجديدة" value={tier} onChange={(event) => setTier(event.target.value)} disabled={saving}>
        <option value="retail">تجزئة</option><option value="wholesale">جملة</option><option value="vip">جملة الجملة</option>
      </select>
    </Field>
    <Field label="سبب تغيير الشريحة">
      <textarea aria-label="سبب تغيير الشريحة" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} disabled={saving} />
    </Field>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="modal-actions">
      <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
      <Button onClick={() => void save()} disabled={saving || tier === currentTier || reason.trim().length < 3 || reason.trim().length > 500}>
        {saving ? 'جار حفظ الشريحة...' : 'حفظ تغيير الشريحة'}
      </Button>
    </div>
  </Modal>;
}

type CustomerLifecycleCommand = 'approved' | 'rejected' | 'frozen' | 'blocked' | 'archived' | 'restore';

const CUSTOMER_LIFECYCLE_TRANSITIONS: Record<string, { value: CustomerLifecycleCommand; label: string }[]> = {
  pending: [
    { value: 'approved', label: 'اعتماد العميل' },
    { value: 'rejected', label: 'رفض الطلب' },
    { value: 'blocked', label: 'حظر العميل' },
    { value: 'archived', label: 'أرشفة العميل' },
  ],
  approved: [
    { value: 'frozen', label: 'تجميد مؤقت' },
    { value: 'blocked', label: 'حظر العميل' },
    { value: 'archived', label: 'أرشفة العميل' },
  ],
  rejected: [
    { value: 'approved', label: 'إعادة التفعيل والاعتماد' },
    { value: 'blocked', label: 'حظر العميل' },
    { value: 'archived', label: 'أرشفة العميل' },
  ],
  frozen: [
    { value: 'approved', label: 'إعادة التفعيل' },
    { value: 'blocked', label: 'حظر العميل' },
    { value: 'archived', label: 'أرشفة العميل' },
  ],
  blocked: [
    { value: 'approved', label: 'إعادة التفعيل' },
    { value: 'archived', label: 'أرشفة العميل' },
  ],
  archived: [
    { value: 'restore', label: 'استرجاع الحالة السابقة' },
  ],
};

export function CustomerLifecycleDialog({ customer, onClose, onSaved }: {
  customer: Pick<CustomerDirectoryRow, "id" | "business_name" | "status">;
  onClose: () => void;
  onSaved: (status: string) => void;
}) {
  const options = CUSTOMER_LIFECYCLE_TRANSITIONS[customer.status] ?? [];
  const [nextStatus, setNextStatus] = useState<CustomerLifecycleCommand>(options[0]?.value ?? 'restore');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submitInFlight = useRef(false);

  async function save() {
    if (submitInFlight.current || saving) return;
    setError('');
    const cleanReason = reason.trim();
    if (!options.some((option) => option.value === nextStatus)) {
      setError('لا يوجد انتقال حالة مسموح لهذا العميل.');
      return;
    }
    if (cleanReason.length < 3 || cleanReason.length > 500) {
      setError('سبب تغيير الحالة مطلوب (3 إلى 500 حرف).');
      return;
    }
    submitInFlight.current = true;
    setSaving(true);
    try {
      const result = await updateCustomerStatus(customer.id, customer.status, nextStatus, cleanReason);
      onSaved(result.status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحديث حالة العميل.');
      submitInFlight.current = false;
    } finally {
      setSaving(false);
    }
  }

  return <Modal title={`إدارة دورة حياة ${customer.business_name}`} onClose={() => { if (!saving) onClose(); }}>
    <p className="text-muted">تُنفّذ الانتقالات المعتمدة خادميًا فقط، ويلزم سبب موثّق لكل تغيير. تُرفض الانتقالات القديمة أو غير المسموح بها ويُحفظ سجل التدقيق.</p>
    {options.length === 0 ? <div className="form-error" role="alert">لا يوجد انتقال حالة مسموح للحالة الحالية: {CUSTOMER_STATUS_LABELS[customer.status] ?? customer.status}.</div> : <>
      <Field label="الحالة التالية">
        <select aria-label="حالة العميل الجديدة" value={nextStatus} onChange={(event) => setNextStatus(event.target.value as CustomerLifecycleCommand)} disabled={saving}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </Field>
      <Field label="سبب تغيير الحالة">
        <textarea aria-label="سبب تغيير الحالة" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} disabled={saving} />
      </Field>
    </>}
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="modal-actions">
      <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
      <Button onClick={() => void save()} disabled={saving || options.length === 0 || reason.trim().length < 3 || reason.trim().length > 500}>
        {saving ? 'جار حفظ الحالة...' : 'حفظ تغيير الحالة'}
      </Button>
    </div>
  </Modal>;
}

export function CustomerModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [business, setBusiness] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [tier, setTier] = useState('retail');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submitInFlight = useRef(false);
  async function save() {
    if (submitInFlight.current || saving) return;
    setError('');
    let input: ReturnType<typeof validateCustomerInput>;
    try {
      input = validateCustomerInput({ business_name: business, contact_name: contact, phone, tier });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'بيانات العميل غير صالحة.');
      return;
    }
    submitInFlight.current = true;
    setSaving(true);
    try {
      await createCustomer(input);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ العميل.');
    } finally {
      submitInFlight.current = false;
      setSaving(false);
    }
  }
  return <Modal title="إضافة عميل" onClose={() => { if (!saving) onClose(); }}>
    <Field label="اسم المنشأة">
      <input value={business} onChange={(e) => setBusiness(e.target.value)} maxLength={200} autoComplete="organization" disabled={saving} />
    </Field>
    <div className="form-grid">
      <Field label="اسم المسؤول"><input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={120} autoComplete="name" disabled={saving} /></Field>
      <Field label="رقم الهاتف"><input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={32} autoComplete="tel" disabled={saving} /></Field>
    </div>
    <Field label="شريحة الأسعار">
      <select value={tier} onChange={(e) => setTier(e.target.value)} disabled={saving}>
        <option value="retail">تجزئة</option><option value="wholesale">جملة</option><option value="vip">جملة الجملة</option>
      </select>
    </Field>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="modal-actions"><Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button><Button onClick={() => void save()} disabled={saving}>{saving ? 'جار الحفظ...' : 'حفظ العميل'}</Button></div>
  </Modal>;
}

function Orders({ onViewDetail }: { onViewDetail: (id: string) => void }) {
  const { data, loading, error, refetch } = useFetch(fetchOrders);
  return <><Heading eyebrow="المبيعات والعملاء" title="الطلبات" description="متابعة دورة الطلب من الاستلام حتى التسليم" icon={ShoppingCart} /><div className="toolbar"><span className="toolbar-note">{data?.length ?? 0} طلب في النظام</span><div className="toolbar-actions"><Button variant="secondary" onClick={refetch}><RefreshCw size={16} /> تحديث</Button></div></div><section className="panel table-panel">{loading ? <Loading /> : error ? <ErrorBox message={error} /> : <TableWrap><table><thead><tr><th>رقم الطلب</th><th>العميل</th><th>التاريخ</th><th>الأصناف</th><th>الإجمالي</th><th>الحالة</th><th /></tr></thead><tbody>{data?.map((o) => <tr key={o.id}><td><strong>#{o.order_number}</strong></td><td>{o.customer?.business_name ?? '—'}</td><td>{formatDateShort(o.created_at)}</td><td>{formatNumber(o.total_items)}</td><td>{formatCurrency(o.total_amount)}</td><td><span className={`badge ${o.status === 'delivered' ? 'success' : o.status === 'processing' ? 'info' : 'warning'}`}>{orderLabel(o.status)}</span></td><td><Button variant="outline" onClick={() => onViewDetail(o.id)}>تفاصيل</Button></td></tr>)}</tbody></table>{!data?.length && <Empty text="لا توجد طلبات" />}</TableWrap>}</section></>;
}
function orderLabel(status: string) { return ORDER_STATUS_LABELS[status] ?? status; }

const PRICING_SCOPES = new Set(['default', 'all', 'product', 'category']);

function pricingScopeLabel(rule: PricingRule): string {
  if (rule.scope_type === 'default' || rule.scope_type === 'all') return 'كل الأصناف';
  if (rule.scope_type === 'product') return 'منتج محدد';
  if (rule.scope_type === 'category') return 'تصنيف محدد';
  return 'نطاق قديم غير مدعوم';
}

function pricingMethodLabel(rule: PricingRule): string {
  const method = rule.calculation_method ?? ({
    percentage: 'add_percentage',
    margin: 'margin_percentage',
    fixed: 'fixed_price',
    amount: 'add_subtract_amount',
  } as Record<string, string>)[rule.adjustment_type ?? ''] ?? '';
  return ({
    add_percentage: 'نسبة إضافة % على الأساس',
    margin_percentage: 'هامش ربح % من سعر البيع',
    fixed_price: 'سعر ثابت',
    add_subtract_amount: 'إضافة / خصم مبلغ',
  } as Record<string, string>)[method] ?? 'طريقة قديمة: ' + (rule.adjustment_type || 'غير محددة');
}

function pricingTargetLabel(rule: PricingRule): string {
  return ({ both: 'الجملة والتجزئة', wholesale: 'الجملة فقط', retail: 'التجزئة فقط' } as Record<string, string>)[rule.target_tier ?? 'both'] ?? 'شريحة غير معروفة';
}

function Pricing({ onNotice }: { onNotice: (m: string) => void }) {
  const { user } = useAuth();
  const canApprovePricing = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager'));
  const { data, loading, error, refetch } = useFetch(fetchPricingRules);
  const [showCreate, setShowCreate] = useState(false);
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null);
  const [approvalRule, setApprovalRule] = useState<PricingRule | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(rule: PricingRule) {
    if (rule.manually_locked) return;
    const next = !rule.is_active;
    if (next && !PRICING_SCOPES.has(rule.scope_type)) {
      onNotice('لا يمكن تفعيل القاعدة: نطاقها قديم وغير مدعوم. أوقفها أو أنشئ قاعدة جديدة.');
      return;
    }
    setBusyId(rule.id);
    try {
      const saved = await togglePricingRule(rule.id, next);
      await refetch();
      onNotice(saved.requires_approval && !saved.approved_at
        ? 'تم حفظ التغيير، والقاعدة بانتظار اعتماد المدير قبل تطبيق السعر.'
        : next ? 'تم تفعيل القاعدة وإعادة حساب أسعار الشرائح' : 'تم إيقاف القاعدة وإعادة حساب أسعار الشرائح');
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'تعذر تحديث قاعدة التسعير');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(rule: PricingRule) {
    if (!canApprovePricing) { onNotice('حذف قواعد التسعير متاح لمدير النظام أو المدير فقط.'); return; }
    if (rule.manually_locked || !window.confirm('حذف قاعدة «' + rule.name + '»؟ سيعيد محرك التسعير حساب الجملة والتجزئة من القواعد المتبقية، ويعود للسعر الأساسي عند عدم وجود قاعدة مطبقة.')) return;
    setBusyId(rule.id);
    try {
      await deletePricingRule(rule.id);
      await refetch();
      onNotice('حُذفت القاعدة وسُجّل الإجراء في سجل التدقيق');
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'تعذر حذف قاعدة التسعير');
    } finally {
      setBusyId(null);
    }
  }

  return <>
    <Heading eyebrow="الأصناف والمخزون" title="التسعير والمخزون" description="إدارة قواعد التسعير حسب طريقة الاحتساب وشريحة العميل والأولوية" icon={SlidersHorizontal} />
    <section className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head"><div><h2>محرك التسعير</h2><p>تُطبّق القاعدة الأعلى أولوية ضمن النطاق والشريحة والكمية والفترة المحددة. الحساب وإعادة تسعير الشرائح يجريان داخل قاعدة البيانات.</p></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Button variant="secondary" onClick={() => void refetch()}><RefreshCw size={16} /> تحديث</Button><Button onClick={() => setShowCreate(true)}><Plus size={17} /> قاعدة جديدة</Button></div></div>
      <div className="report-grid" style={{ marginTop: 12 }}>
        <article className="report-metric"><SlidersHorizontal size={22} /><span>القواعد المسجلة</span><strong>{formatNumber(data?.length ?? 0)}</strong></article>
        <article className="report-metric"><Check size={22} /><span>قواعد نشطة</span><strong>{formatNumber(data?.filter((rule) => rule.is_active).length ?? 0)}</strong></article>
        <article className="report-metric"><AlertTriangle size={22} /><span>قواعد موقوفة / تتطلب مراجعة</span><strong>{formatNumber(data?.filter((rule) => !rule.is_active || (rule.requires_approval && !rule.approved_at) || !PRICING_SCOPES.has(rule.scope_type)).length ?? 0)}</strong></article>
      </div>
    </section>
    <PricingPreviewPanel />
    {canApprovePricing && <PricingGrid onNotice={onNotice} />}
    {loading ? <Loading /> : error ? <ErrorBox message={error} /> : !data?.length ? <Empty text="لا توجد قواعد تسعير. أضف أول قاعدة لتحديد أسعار الشرائح." /> : <div className="rule-grid">
      {data.map((rule) => {
        const unsupported = !PRICING_SCOPES.has(rule.scope_type);
        const awaitingApproval = Boolean(rule.requires_approval && !rule.approved_at);
        const locked = Boolean(rule.manually_locked);
        return <article className="rule-card" key={rule.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div><span className="rule-number">أولوية {rule.priority}</span><h2>{rule.name}</h2></div>
            <label className="switch" title={locked ? 'القاعدة مقفلة يدويًا' : unsupported && !rule.is_active ? 'لا يمكن تفعيل نطاق قديم غير مدعوم' : rule.is_active ? 'إيقاف القاعدة' : 'تفعيل القاعدة'}>
              <input type="checkbox" aria-label={(rule.is_active ? "إيقاف قاعدة " : "تفعيل قاعدة ") + rule.name} checked={rule.is_active} disabled={!canApprovePricing || locked || busyId === rule.id || (unsupported && !rule.is_active) || awaitingApproval} onChange={() => void toggle(rule)} />
              <span />
            </label>
          </div>
          <p><strong>{pricingMethodLabel(rule)}</strong></p>
          <p>{pricingTargetLabel(rule)} · الأساس: {rule.base_source === 'cost_price' || rule.base_type === 'cost_price' ? 'التكلفة' : 'السعر الأساسي'}</p>
          <p>النطاق: {pricingScopeLabel(rule)}{rule.scope_value ? ' · ' + rule.scope_value : ''}</p>
          <p>من كمية {formatNumber(Number(rule.min_quantity ?? 1))} · قيمة الاحتساب {formatNumber(Number(rule.adjustment_value))}</p>
          {(rule.min_price != null || rule.max_price != null) && <p>حد السعر: {rule.min_price == null ? '—' : formatCurrency(Number(rule.min_price))} – {rule.max_price == null ? '—' : formatCurrency(Number(rule.max_price))}</p>}
          {(rule.effective_from || rule.effective_until) && <p>الفترة: {rule.effective_from ? formatDateShort(rule.effective_from) : 'من البداية'} – {rule.effective_until ? formatDateShort(rule.effective_until) : 'بلا نهاية'}</p>}
          {awaitingApproval && <p role="status" style={{ color: '#9a5b13', fontWeight: 800 }}>بانتظار الموافقة — لن تدخل القاعدة في الاحتساب قبل اعتمادها.</p>}
          {awaitingApproval && rule.submitted_by && <p style={{ color: '#71868a', fontSize: 12 }}>يجب أن يعتمد القاعدة مدير مختلف عن مقدمها.</p>}
          {rule.requires_approval && <p role="status" style={{ color: '#9a5b13' }}>هذه القاعدة خاضعة للموافقة؛ التعديل المباشر معطل حتى لا يتجاوز حوكمة الاعتماد.</p>}
          {awaitingApproval && canApprovePricing && !locked && <Button onClick={() => setApprovalRule(rule)} disabled={busyId === rule.id}>مراجعة واعتماد القاعدة</Button>}
          {unsupported && <p role="alert" style={{ color: '#9a5b13' }}>هذه قاعدة قديمة بنطاق غير مدعوم في المحرك الحالي. لن يُسمح بتفعيلها مجددًا.</p>}
          {locked && <p role="status">قاعدة مقفلة يدويًا؛ التعديل والحذف معطلان.</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <Button variant="outline" disabled={!canApprovePricing || locked || unsupported || Boolean(rule.requires_approval) || busyId === rule.id} onClick={() => setEditingRule(rule)}><Pencil size={15} /> تعديل القاعدة</Button>
            <Button variant="danger" disabled={!canApprovePricing || locked || busyId === rule.id} onClick={() => void remove(rule)}><Trash2 size={15} /> حذف القاعدة</Button>
          </div>
        </article>;
      })}
    </div>}
    {showCreate && <PricingRuleModal key="create" onClose={() => setShowCreate(false)} onSaved={async () => { await refetch(); setShowCreate(false); onNotice('تم حفظ القاعدة؛ وقد تبقى بانتظار اعتماد المدير قبل تطبيق السعر.'); }} />}
    {editingRule && <PricingRuleModal key={editingRule.id} rule={editingRule} onClose={() => setEditingRule(null)} onSaved={async () => { await refetch(); setEditingRule(null); onNotice('تم حفظ التعديلات؛ وقد تحتاج القاعدة إلى اعتماد المدير قبل تطبيقها.'); }} />}
    {approvalRule && <PricingApprovalModal key={approvalRule.id} rule={approvalRule} onClose={() => setApprovalRule(null)} onSaved={async () => { await refetch(); setApprovalRule(null); onNotice('تم اعتماد قاعدة التسعير وحُفظ سبب الاعتماد في سجل التدقيق.'); }} />}
  </>;
}


function PricingPreviewPanel() {
  const { data: customers, loading: customersLoading, error: customersError } = useFetch(fetchCustomers);
  const { data: products, loading: productsLoading, error: productsError } = useFetch(fetchProducts);
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [preview, setPreview] = useState<CustomerTierPricePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const qty = Number(quantity);
    if (!customerId || !productId || !Number.isInteger(qty) || qty < 1 || qty > 10000) {
      setError('اختر العميل والمنتج وأدخل كمية صحيحة بين 1 و10000.'); return;
    }
    setBusy(true); setError(''); setPreview(null);
    try { setPreview(await previewCustomerTierPrice({ customer_id: customerId, product_id: productId, quantity: qty })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر حساب سعر العميل.'); }
    finally { setBusy(false); }
  }
  return <section className="panel" style={{ marginBottom: 16 }}>
    <div className="panel-head"><div><h2>معاينة سعر العميل</h2><p>تستخدم المعاينة محرك التسعير الخادمي نفسه المستخدم عند الطلب؛ القواعد غير المعتمدة لا تدخل في الحساب.</p></div></div>
    {customersError && <ErrorBox message={customersError} />}
    {productsError && <ErrorBox message={productsError} />}
    <form onSubmit={submit} className="form-grid" style={{ alignItems: 'end' }}>
      <Field label="العميل"><select value={customerId} onChange={e => { setCustomerId(e.target.value); setPreview(null); }} required disabled={customersLoading}>
        <option value="">{customersLoading ? 'جار تحميل العملاء…' : 'اختر العميل'}</option>
        {(customers ?? []).map(c => <option key={c.id} value={c.id}>{c.business_name} · {c.customer_code}</option>)}
      </select></Field>
      <Field label="المنتج"><select value={productId} onChange={e => { setProductId(e.target.value); setPreview(null); }} required disabled={productsLoading}>
        <option value="">{productsLoading ? 'جار تحميل المنتجات…' : 'اختر المنتج'}</option>
        {(products ?? []).filter(p => p.status === 'active').map(p => <option key={p.id} value={p.id}>{p.name} · {p.item_code}</option>)}
      </select></Field>
      <Field label="الكمية المطلوبة"><input type="number" min="1" max="10000" step="1" value={quantity} onChange={e => { setQuantity(e.target.value); setPreview(null); }} required /></Field>
      <div><Button disabled={busy || customersLoading || productsLoading || !customerId || !productId}><Calculator size={16} />{busy ? 'جارٍ حساب السعر…' : 'معاينة السعر المعتمد'}</Button></div>
    </form>
    {error && <div className="form-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
    {preview && <div className="report-grid" style={{ marginTop: 14 }}>
      <article className="report-metric"><Users size={20} /><span>العميل / الشريحة الفعلية</span><strong>{preview.customer_name}</strong><small>{preview.tier === 'wholesale' ? 'الجملة' : 'التجزئة'}</small></article>
      <article className="report-metric"><Box size={20} /><span>سعر الوحدة</span><strong>{formatCurrency(Number(preview.unit_price))}</strong><small>{preview.item_code}</small></article>
      <article className="report-metric"><ShoppingCart size={20} /><span>إجمالي الكمية</span><strong>{formatCurrency(Number(preview.line_total))}</strong><small>{formatNumber(Number(preview.quantity))} {preview.currency}</small></article>
    </div>}
    {preview && <p style={{ marginTop: 10, color: '#71868a', fontSize: 12 }}>المنتج: {preview.product_name} · السعر محسوب من قاعدة البيانات وفق الشريحة والكمية وحالة اعتماد العميل.</p>}
  </section>;
}

function PricingApprovalModal({ rule, onClose, onSaved }: { rule: PricingRule; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (note.trim().length < 3) { setError('اكتب سبب الاعتماد حتى يُحفظ القرار في سجل التدقيق.'); return; }
    setSaving(true); setError('');
    try { await approvePricingRule(rule.id, note); await onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر اعتماد قاعدة التسعير.'); }
    finally { setSaving(false); }
  }
  return <Modal title="مراجعة واعتماد قاعدة التسعير" onClose={onClose}>
    <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      <p>القاعدة: <strong>{rule.name}</strong>. بعد الاعتماد يستطيع المحرك تطبيقها وفق الشريحة والكمية والنطاق والفترة المحددة.</p>
      <Field label="سبب الاعتماد / ملاحظات المراجع"><textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} minLength={3} required rows={4} placeholder="مثال: تمت مراجعة هامش الربح وحدود السعر ونطاق التطبيق." /></Field>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="btn outline" onClick={onClose} disabled={saving}>إلغاء</button><Button disabled={saving || note.trim().length < 3}>{saving ? 'جارٍ اعتماد القاعدة…' : 'تأكيد الاعتماد'}</Button></div>
    </form>
  </Modal>;
}

function pricingRuleMethodForForm(rule?: PricingRule): CreatePricingRuleInput['calculation_method'] {
  const legacy: Record<string, CreatePricingRuleInput['calculation_method']> = {
    percentage: 'add_percentage',
    margin: 'margin_percentage',
    fixed: 'fixed_price',
    amount: 'add_subtract_amount',
  };
  const candidate = rule?.calculation_method ?? legacy[rule?.adjustment_type ?? ''];
  const supported = new Set<string>(['add_percentage', 'margin_percentage', 'fixed_price', 'add_subtract_amount']);
  return candidate && supported.has(candidate)
    ? candidate as CreatePricingRuleInput['calculation_method']
    : 'add_percentage';
}

function pricingRuleScopeForForm(rule?: PricingRule): CreatePricingRuleInput['scope_type'] {
  const supported = new Set<string>(['default', 'all', 'product', 'category']);
  return rule && supported.has(rule.scope_type)
    ? rule.scope_type as CreatePricingRuleInput['scope_type']
    : 'default';
}

function pricingRuleTierForForm(rule?: PricingRule): CreatePricingRuleInput['target_tier'] {
  const supported = new Set<string>(['both', 'wholesale', 'retail']);
  return rule?.target_tier && supported.has(rule.target_tier)
    ? rule.target_tier as CreatePricingRuleInput['target_tier']
    : 'both';
}

function localDateTimeValue(value?: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '';
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function PricingRuleModal({ rule, onClose, onSaved }: { rule?: PricingRule; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const { data: products, loading: productsLoading, error: productsError, refetch: refetchProducts } = useFetch(fetchProducts);
  const { data: categories, loading: categoriesLoading, error: categoriesError, refetch: refetchCategories } = useFetch(fetchCategories);
  const [name, setName] = useState(rule?.name ?? '');
  const [scopeType, setScopeType] = useState<CreatePricingRuleInput['scope_type']>(pricingRuleScopeForForm(rule));
  const [scopeValue, setScopeValue] = useState(rule?.scope_value ?? '');
  const [targetTier, setTargetTier] = useState<CreatePricingRuleInput['target_tier']>(pricingRuleTierForForm(rule));
  const [method, setMethod] = useState<CreatePricingRuleInput['calculation_method']>(pricingRuleMethodForForm(rule));
  const [baseSource, setBaseSource] = useState<CreatePricingRuleInput['base_source']>(rule?.base_source === 'cost_price' || rule?.base_type === 'cost_price' ? 'cost_price' : 'base_price');
  const [adjustmentValue, setAdjustmentValue] = useState(String(rule?.adjustment_value ?? 10));
  const [minQuantity, setMinQuantity] = useState(String(rule?.min_quantity ?? 1));
  const [minPrice, setMinPrice] = useState(rule?.min_price == null ? '' : String(rule.min_price));
  const [maxPrice, setMaxPrice] = useState(rule?.max_price == null ? '' : String(rule.max_price));
  const [priority, setPriority] = useState(String(rule?.priority ?? 100));
  const [effectiveFrom, setEffectiveFrom] = useState(localDateTimeValue(rule?.effective_from));
  const [effectiveUntil, setEffectiveUntil] = useState(localDateTimeValue(rule?.effective_until));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const scopeOptionsUnavailable = scopeType === 'product'
    ? productsLoading || Boolean(productsError) || !products?.length
    : scopeType === 'category'
      ? categoriesLoading || Boolean(categoriesError) || !categories?.length
      : false;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (scopeOptionsUnavailable) {
      setError('تعذر التحقق من خيارات نطاق القاعدة؛ أعد تحميل المنتجات أو التصنيفات قبل الحفظ.');
      return;
    }
    const amount = Number(adjustmentValue);
    const quantity = Number(minQuantity);
    const rank = Number(priority);
    if (!name.trim() || !Number.isFinite(amount) || !Number.isFinite(quantity) || quantity <= 0 || quantity > 10000 ||
        !Number.isInteger(rank) || rank < 1 || rank > 100000) {
      setError('أكمل الاسم وقيمة الاحتساب والكمية والأولوية بأرقام صالحة.');
      return;
    }
    if (method === 'margin_percentage' && (amount < 0 || amount >= 100)) {
      setError('هامش الربح يجب أن يكون من 0% إلى أقل من 100%.');
      return;
    }
    if (method === 'fixed_price' && amount < 0) {
      setError('السعر الثابت لا يمكن أن يكون سالبًا.');
      return;
    }
    const from = effectiveFrom ? new Date(effectiveFrom) : null;
    const until = effectiveUntil ? new Date(effectiveUntil) : null;
    if ((from && !Number.isFinite(from.getTime())) || (until && !Number.isFinite(until.getTime())) || (from && until && from > until)) {
      setError('تحقق من تاريخي بداية ونهاية القاعدة.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const toIso = (date: string) => date ? new Date(date).toISOString() : null;
      const input: CreatePricingRuleInput = {
        name: name.trim(),
        scope_type: scopeType,
        scope_value: scopeType === 'product' || scopeType === 'category' ? scopeValue : null,
        target_tier: targetTier,
        calculation_method: method,
        base_source: baseSource,
        adjustment_value: amount,
        min_quantity: quantity,
        min_price: minPrice.trim() ? Number(minPrice) : null,
        max_price: maxPrice.trim() ? Number(maxPrice) : null,
        priority: rank,
        effective_from: toIso(effectiveFrom),
        effective_until: toIso(effectiveUntil),
      };
      if (rule) await updatePricingRule(rule.id, input);
      else await createPricingRule(input);
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : rule ? 'تعذر تحديث قاعدة التسعير.' : 'تعذر إنشاء قاعدة التسعير.');
    } finally {
      setSaving(false);
    }
  }

  return <Modal title={rule ? "تعديل قاعدة التسعير" : "إنشاء قاعدة تسعير"} onClose={onClose}>
    <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      <Field label="اسم القاعدة"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required placeholder="مثال: جملة بكمية كبيرة" /></Field>
      <div className="form-grid">
        <Field label="نطاق التطبيق"><select value={scopeType} onChange={(event) => { setScopeType(event.target.value as typeof scopeType); setScopeValue(''); }}><option value="default">كل الأصناف (افتراضي)</option><option value="all">كل الأصناف (عام)</option><option value="product">منتج محدد</option><option value="category">تصنيف محدد</option></select></Field>
        <Field label="الشريحة المستهدفة"><select value={targetTier} onChange={(event) => setTargetTier(event.target.value as typeof targetTier)}><option value="both">الجملة والتجزئة</option><option value="wholesale">الجملة</option><option value="retail">التجزئة</option></select></Field>
      </div>
      {(scopeType === 'product' || scopeType === 'category') && <>
        {scopeType === 'product' && productsError && <><ErrorBox message={productsError} /><button type="button" className="btn secondary" onClick={() => { void refetchProducts(); }}>إعادة تحميل المنتجات</button></>}
        {scopeType === 'category' && categoriesError && <><ErrorBox message={categoriesError} /><button type="button" className="btn secondary" onClick={() => { void refetchCategories(); }}>إعادة تحميل التصنيفات</button></>}
        {scopeType === 'product' && !productsLoading && !productsError && products?.length === 0 && <Empty text="لا توجد منتجات متاحة لاستخدامها في قاعدة تسعير." />}
        {scopeType === 'category' && !categoriesLoading && !categoriesError && categories?.length === 0 && <Empty text="لا توجد تصنيفات متاحة لاستخدامها في قاعدة تسعير." />}
        <Field label={scopeType === 'product' ? 'المنتج' : 'التصنيف'}>
          <select value={scopeValue} onChange={(event) => setScopeValue(event.target.value)} required disabled={scopeOptionsUnavailable}>
            <option value="">{scopeType === 'product' ? (productsLoading ? 'جار تحميل المنتجات…' : productsError ? 'تعذر تحميل المنتجات' : 'اختر المنتج') : (categoriesLoading ? 'جار تحميل التصنيفات…' : categoriesError ? 'تعذر تحميل التصنيفات' : 'اختر التصنيف')}</option>
            {scopeType === 'product' ? (products ?? []).map((product) => <option key={product.id} value={product.id}>{product.name} · {product.item_code}</option>) : (categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </Field>
      </>}
      <div className="form-grid">
        <Field label="طريقة الاحتساب"><select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}><option value="add_percentage">نسبة إضافة % على الأساس</option><option value="margin_percentage">هامش ربح % من سعر البيع</option><option value="fixed_price">سعر ثابت</option><option value="add_subtract_amount">إضافة/خصم مبلغ (السالب للخصم)</option></select></Field>
        <Field label="أساس الحساب"><select value={baseSource} onChange={(event) => setBaseSource(event.target.value as typeof baseSource)}><option value="base_price">السعر الأساسي</option><option value="cost_price">التكلفة</option></select></Field>
      </div>
      <div className="form-grid">
        <Field label={method === 'add_percentage' || method === 'margin_percentage' ? 'النسبة المئوية' : method === 'fixed_price' ? 'السعر الثابت' : 'قيمة الإضافة/الخصم'}><input type="number" step="0.01" value={adjustmentValue} onChange={(event) => setAdjustmentValue(event.target.value)} required /></Field>
        <Field label="تبدأ من كمية"><input type="number" min="0.001" max="10000" step="0.001" value={minQuantity} onChange={(event) => setMinQuantity(event.target.value)} required /></Field>
      </div>
      <div className="form-grid">
        <Field label="أقل سعر (اختياري)"><input type="number" min="0" step="0.01" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} /></Field>
        <Field label="أعلى سعر (اختياري)"><input type="number" min="0" step="0.01" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} /></Field>
      </div>
      <div className="form-grid">
        <Field label="الأولوية (الرقم الأصغر أولًا)"><input type="number" min="1" max="100000" step="1" value={priority} onChange={(event) => setPriority(event.target.value)} required /></Field>
        <div />
      </div>
      <div className="form-grid">
        <Field label="وقت بدء القاعدة (اختياري)"><input type="datetime-local" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></Field>
        <Field label="وقت انتهاء القاعدة (اختياري)"><input type="datetime-local" value={effectiveUntil} onChange={(event) => setEffectiveUntil(event.target.value)} /></Field>
      </div>
      <p style={{ color: '#71868a', fontSize: 12, lineHeight: 1.7 }}>{rule ? 'سيُحدّث المحرك هذه القاعدة ويزيد رقم إصدارها ويسجل التغيير، ثم يعيد احتساب الأسعار ضمن النطاق والشريحة والكمية والفترة المختارة.' : 'الحفظ لا يغيّر قائمة الأسعار يدويًا؛ قاعدة البيانات تحسب الجملة والتجزئة وتكتب سجل التدقيق. لا تُطبّق القاعدة إلا ضمن النطاق والشريحة والكمية والفترة المختارة.'}</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="btn outline" onClick={onClose} disabled={saving}>إلغاء</button><Button disabled={saving || scopeOptionsUnavailable}>{saving ? 'جارٍ الحفظ...' : rule ? 'حفظ التعديلات' : 'حفظ قاعدة التسعير'}</Button></div>
    </form>
  </Modal>;
}

function Offers({ onNotice }: { onNotice: (m: string) => void }) { return <PromotionManager onNotice={onNotice} />; }

function Reports() {
  const { user } = useAuth();
  const canViewProductActivity = Boolean(user?.roles.some((role) =>
    role === 'admin' || role === 'manager' || role === 'accountant',
  ));
  const [productActivityReport, setProductActivityReport] = useState<StoreProductActivityReport | null>(null);
  const [productActivityLoading, setProductActivityLoading] = useState(false);
  const [productActivityError, setProductActivityError] = useState('');
  const [productActivityActionMessage, setProductActivityActionMessage] = useState('');
  const [productActivityRefreshKey, setProductActivityRefreshKey] = useState(0);
  useEffect(() => {
    let active = true;
    if (!canViewProductActivity) {
      setProductActivityReport(null);
      setProductActivityError('');
      setProductActivityLoading(false);
      return () => { active = false; };
    }
    setProductActivityReport(null);
    setProductActivityError('');
    setProductActivityLoading(true);
    void fetchStoreProductActivityReport()
      .then((report) => {
        if (active) setProductActivityReport(report);
      })
      .catch((cause) => {
        if (active) {
          setProductActivityReport(null);
          setProductActivityError(cause instanceof Error
            ? cause.message
            : 'تعذر تحميل تقرير حركة الأصناف من الخادم.');
        }
      })
      .finally(() => {
        if (active) setProductActivityLoading(false);
      });
    return () => { active = false; };
  }, [canViewProductActivity, productActivityRefreshKey]);
  const productActivityPrint = useMemo(() => {
    if (!productActivityReport) return { document: null, error: '' };
    try {
      return { document: projectProductActivityPrintDocument(productActivityReport), error: '' };
    } catch (cause) {
      return {
        document: null,
        error: cause instanceof Error ? cause.message : 'بيانات التقرير غير مكتملة للطباعة.',
      };
    }
  }, [productActivityReport]);
  function downloadProductActivityReport() {
    if (!productActivityReport || productActivityReport.truncated
      || productActivityReport.products.length !== productActivityReport.total_products) {
      setProductActivityActionMessage('التقرير غير مكتمل؛ تم إيقاف تصدير XLSX حتى لا يظهر ملف جزئي على أنه كامل.');
      return;
    }
    try {
      downloadProductActivityWorkbookXlsx(productActivityReport);
      setProductActivityActionMessage('تم بدء تنزيل ملف Excel الكامل لحركة الأصناف.');
    } catch (cause) {
      setProductActivityActionMessage(cause instanceof Error
        ? cause.message
        : 'تعذر إنشاء ملف Excel لحركة الأصناف.');
    }
  }
  function printProductActivityReport() {
    if (!productActivityPrint.document) {
      setProductActivityActionMessage(productActivityPrint.error || 'لا تتوفر بيانات كاملة للطباعة.');
      return;
    }
    const root = document.documentElement;
    const cleanup = () => {
      root.classList.remove('print-product-activity');
      window.removeEventListener('afterprint', cleanup);
    };
    root.classList.add('print-product-activity');
    window.addEventListener('afterprint', cleanup, { once: true });
    try {
      window.print();
    } catch {
      cleanup();
      setProductActivityActionMessage('تعذر فتح نافذة الطباعة في هذا المتصفح.');
    }
  }
  const { data: stats, loading, error } = useFetch(fetchDashboardStats);
  const { data: products, loading: productsLoading, error: productsError } = useFetch(fetchProducts);
  const { data: orders, loading: ordersLoading, error: ordersError } = useFetch(fetchOrders);
  const signals = useMemo(() => buildBusinessSignals(orders ?? []), [orders]);
  const statusBreakdown = useMemo(() => buildBusinessStatusBreakdown(orders ?? []), [orders]);
  const inventoryValue = useMemo(() => {
    if (productsLoading) return 'جارٍ تحميل بيانات المخزون…';
    if (productsError) return 'غير متاح — تعذر تحميل بيانات المخزون';
    if (!products) return 'غير متاح — لم يتم تأكيد البيانات';
    let total = 0;
    for (const product of products) {
      const price = product.base_price;
      const quantity = product.inventory?.quantity_available;
      if (
        typeof price !== 'number' || !Number.isFinite(price) ||
        typeof quantity !== 'number' || !Number.isFinite(quantity)
      ) return 'غير متاح';
      total += price * quantity;
      if (!Number.isFinite(total) || Math.abs(total) > Number.MAX_SAFE_INTEGER) return 'غير متاح — تعذر جمع القيمة بأمان';
    }
    return formatCurrency(total);
  }, [products, productsLoading, productsError]);
  return <>
    <Heading eyebrow="التحليل التنفيذي" title="التقارير الذكية" description="مؤشرات قابلة للتنفيذ مبنية على البيانات التشغيلية الحالية" icon={BarChart3} />
    <div className="report-hero"><div><span>ملخص الأداء</span><h2>الأغبري في أرقام</h2><p>تتحدث المؤشرات من قاعدة البيانات مباشرة.</p></div><TrendingUp size={50} /></div>
    {loading ? <Loading /> : error ? <ErrorBox message={error} /> : <div className="report-grid">
      <ReportMetric label="إجمالي المبيعات" value={stats ? dashboardSalesDisplay(stats, formatCurrency) : 'غير متاح'} icon={CircleDollarSign} />
      <ReportMetric label="متوسط قيمة الطلب" value={stats ? dashboardAverageOrderDisplay(stats, formatCurrency) : 'غير متاح'} icon={ShoppingCart} />
      <ReportMetric label="قيمة المخزون المعروضة" value={inventoryValue} icon={Package} />
      <ReportMetric label="الأصناف منخفضة المخزون" value={!stats || stats.lowStockCount === null ? 'غير متاح' : formatNumber(stats.lowStockCount)} icon={AlertTriangle} />
    </div>}
    {canViewProductActivity && (
      <>
        <section className="panel product-activity-report" style={{ marginTop: 16 }}>
          <div className="panel-head">
            <div>
              <h2>تقرير حركة الأصناف والركود</h2>
              <p>بيانات كاملة من تقرير الخادم للمؤسسة الحالية: حركة 30 و90 يومًا ومتاح المخزون في المخازن النشطة، دون أسعار أو تكاليف أو هوامش.</p>
            </div>
            <Activity size={22} />
          </div>
          <div className="product-activity-toolbar">
            <Button variant="secondary" onClick={() => setProductActivityRefreshKey((value) => value + 1)} disabled={productActivityLoading}>
              <RefreshCw size={15} /> تحديث التقرير
            </Button>
            <Button variant="secondary" onClick={printProductActivityReport}
              disabled={!productActivityPrint.document || productActivityLoading}>
              <Printer size={15} /> طباعة PDF
            </Button>
            <Button onClick={downloadProductActivityReport}
              disabled={!productActivityReport || productActivityReport.truncated
                || productActivityReport.products.length !== productActivityReport.total_products
                || productActivityLoading}>
              <FileSpreadsheet size={15} /> تنزيل Excel
            </Button>
          </div>
          {productActivityActionMessage && <p className="report-note" role="status" aria-live="polite">{productActivityActionMessage}</p>}
          {productActivityLoading ? <Loading /> : productActivityError
            ? <div role="alert">
                <ErrorBox message={productActivityError} />
                <Button variant="secondary" onClick={() => setProductActivityRefreshKey((value) => value + 1)}>إعادة المحاولة</Button>
              </div>
            : productActivityReport ? (
              <>
                <div className="product-activity-report-meta">
                  <span>تاريخ الإنشاء: <bdi>{new Date(productActivityReport.generated_at).toLocaleString('ar-YE')}</bdi></span>
                  <span>النافذة: {formatNumber(productActivityReport.recent_days)} يومًا</span>
                  <span>حد الركود: {formatNumber(productActivityReport.slow_days)} يومًا</span>
                  <strong>{formatNumber(productActivityReport.returned_products)} من {formatNumber(productActivityReport.total_products)} صنفًا</strong>
                </div>
                {productActivityReport.truncated && (
                  <p className="product-activity-incomplete" role="alert">
                    التقرير يتجاوز حد 5000 صف. المعروض أدناه جزء للمعاينة فقط؛ تم تعطيل الطباعة والتصدير حتى لا يُسلّم ملف ناقص على أنه تقرير كامل.
                  </p>
                )}
                <div className="report-grid product-activity-metrics">
                  <ReportMetric label="نشط آخر 30 يومًا" value={formatNumber(productActivityReport.summary.active_last_30_days)} icon={Activity} />
                  <ReportMetric label="بطيء 31–90 يومًا" value={formatNumber(productActivityReport.summary.slow_moving_90_days)} icon={TrendingUp} />
                  <ReportMetric label="راكد أكثر من 90 يومًا" value={formatNumber(productActivityReport.summary.stagnant_over_90_days)} icon={AlertTriangle} />
                  <ReportMetric label="لم يُبع سابقًا" value={formatNumber(productActivityReport.summary.never_sold)} icon={Package} />
                  <ReportMetric label="رصيد غير متاح" value={formatNumber(productActivityReport.summary.stock_unknown_count)} icon={Database} />
                </div>
                {productActivityReport.products.length === 0
                  ? <Empty text="لا توجد أصناف في تقرير حركة الأصناف." />
                  : (
                    <>
                      <TableWrap>
                        <table>
                          <thead><tr>
                            <th>كود الصنف</th><th>الصنف</th><th>الوحدة</th><th>حالة الحركة</th>
                            <th>مباع 30 يومًا</th><th>مباع 90 يومًا</th><th>آخر بيع</th><th>المتاح</th>
                          </tr></thead>
                          <tbody>
                            {productActivityReport.products.slice(0, 100).map((row) => (
                              <tr key={row.product_id}>
                                <td><bdi>{row.item_code || 'دون رمز'}</bdi></td>
                                <td>{row.product_name}</td>
                                <td>{row.unit || 'غير محددة'}</td>
                                <td>{PRODUCT_ACTIVITY_STATUS_LABELS[row.activity_status]}</td>
                                <td>{formatNumber(row.sold_quantity_last_30_days)}</td>
                                <td>{formatNumber(row.sold_quantity_last_90_days)}</td>
                                <td>{row.last_sold_at ? formatDateShort(row.last_sold_at) : 'لم يُسجل بيع'}</td>
                                <td>{row.available_quantity === null ? 'غير متاح' : formatNumber(row.available_quantity)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </TableWrap>
                      {productActivityReport.products.length > 100 && (
                        <p className="report-note">تعرض المعاينة أول 100 صنف فقط؛ ملف Excel والطباعة يعتمدان جميع صفوف التقرير عندما يكون كاملاً.</p>
                      )}
                    </>
                  )}
                {productActivityPrint.error && (
                  <p className="report-note" role="status">الطباعة غير متاحة: {productActivityPrint.error}</p>
                )}
              </>
            ) : <Empty text="لم تصل بيانات تقرير حركة الأصناف من الخادم." />}
        </section>
        {productActivityPrint.document && (
          <div className="product-activity-print-only" aria-hidden="true">
            <ProductActivityPrintSheet document={productActivityPrint.document} />
          </div>
        )}
      </>
    )}
    <div style={{ marginTop: 16 }}><UnifiedOnyxAnalysisPanel /></div>
    <ExecutiveStoreAnalytics />
    <section className="panel" style={{ marginTop: 16 }}>
      <div className="panel-head"><div><h2>إشارات تشغيلية مدعومة بالأدلة</h2><p>تحليل حتمي لنتائج الطلبات الفعلية في نطاق المؤسسة، دون اختلاق أسباب أو توقعات.</p></div><Activity size={22} /></div>
      {ordersLoading ? <Loading /> : ordersError ? <ErrorBox message={ordersError} /> : signals.length === 0
        ? <Empty text="لا توجد إشارات تتجاوز حدود التنبيه الحالية في مجموعة الطلبات المحمّلة." />
        : <div className="report-grid">{signals.map((signal) => <article className="report-metric" key={signal.kind}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={20} /><span className={"badge " + (signal.severity === 'critical' ? 'danger' : signal.severity === 'warning' ? 'warning' : 'info')}>{signal.severity === 'critical' ? 'حرج' : signal.severity === 'warning' ? 'مراجعة' : 'معلومة'}</span></div>
            <strong>{signal.title}</strong><p>{signal.detail}</p>
            <small>الدليل: {formatNumber(signal.evidence.orderCount)} طلب، {formatNumber(signal.evidence.customerCount)} عميل معروف</small>
          </article>)}</div>}
      <p className="report-note" style={{ marginTop: 12 }}>لا تُستنتج أسباب الإلغاء أو أثرها المالي. ويُحجب تنبيه تركّز قيمة المبيعات عند وجود مبلغ أو معرّف عميل غير صالح.</p>
    </section>
    <section className="panel" style={{ marginTop: 16 }}>
      <div className="panel-head"><div><h2>توزيع الطلبات حسب الحالة</h2><p>عدّ ومبالغ من الطلبات الفعلية التي أعادها الخادم للمؤسسة الحالية؛ لا يتم تقدير القيم المفقودة.</p></div><ShoppingCart size={22} /></div>
      {ordersLoading ? <Loading /> : ordersError ? <ErrorBox message={ordersError} /> : statusBreakdown.length === 0 ? <Empty text="لا توجد طلبات مسجلة لعرض توزيع الحالات." /> :
        <TableWrap><table><thead><tr><th>الحالة</th><th>عدد الطلبات</th><th>النسبة</th><th>قيمة الطلبات</th></tr></thead><tbody>
          {statusBreakdown.map((row) => <tr key={row.status}>
            <td>{ORDER_STATUS_LABELS[row.status] ?? row.status}</td>
            <td>{formatNumber(row.count)}</td>
            <td>{formatNumber(Math.round(row.share * 100))}%</td>
            <td>{row.value === null ? <span title={row.invalidAmountCount + ' مبالغ غير صالحة'}>غير مكتمل — {formatNumber(row.invalidAmountCount)} مبلغ غير صالح</span> : formatCurrency(row.value)}</td>
          </tr>)}
        </tbody></table></TableWrap>}
      <p className="report-note" style={{ marginTop: 10 }}>النسب من مجموعة الطلبات المحمّلة فقط. إذا احتوى وضعٌ ما على مبلغ غير صالح، يبقى عدد الطلبات ظاهرًا وتُحجب القيمة المالية لذلك الوضع.</p>
    </section>
    <section className="panel report-note"><FileText size={21} /><div><h2>قرار اليوم</h2><p>{!stats || stats.lowStockCount === null ? 'تعذر إصدار قرار موثوق للمخزون؛ تحقق من ارتباط المستودع واكتمال قراءة الأرصدة أولًا.' : stats.lowStockCount > 0 ? 'ابدأ بمراجعة الأصناف منخفضة المخزون قبل استقبال الطلبات الجديدة.' : 'لا توجد أصناف أقل من حدود إعادة الطلب في المستودع الذي تم التحقق منه. ركّز على مراجعة المبيعات والعملاء.'}</p></div></section>
  </>;
}
function ReportMetric({ label, value, icon: Icon }: { label: string; value: string; icon: IconType }) { return <article className="report-metric"><Icon size={23} /><span>{label}</span><strong>{value}</strong></article>; }

function DataCenter({ onNotice, initialImportJobId }: { onNotice: (m: string) => void; initialImportJobId?: string }) {
  const { user } = useAuth();
  const canManageImports = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager'));
  const [section, setSection] = useState<'categories' | 'import' | 'onyx'>('categories');
  useEffect(() => {
    if (initialImportJobId && canManageImports) setSection('import');
  }, [initialImportJobId, canManageImports]);
  const { data: categories, loading, error, refetch } = useFetch(fetchCategories);
  const [name, setName] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [parentCategoryId, setParentCategoryId] = useState('');
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);

  async function add() {
    const categoryName = name.trim();
    const code = categoryCode.trim();
    if (!canManageImports || !categoryName || code.length > 64) return;
    try {
      const result = await createAdminCatalogCategory(categoryName, parentCategoryId || null, code || null);
      if (!result || typeof result.id !== 'string' || result.name !== categoryName || typeof result.created !== 'boolean') {
        throw new Error('لم يؤكد الخادم حفظ التصنيف.');
      }
      setName('');
      setCategoryCode('');
      setParentCategoryId('');
      await refetch();
      onNotice(result.created ? 'تمت إضافة التصنيف' : 'التصنيف موجود بالفعل ضمن الأب المحدد');
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'تعذر إضافة التصنيف');
    }
  }

  async function archive(category: Category) {
    if (!canManageImports || category.is_active === false || restoringId !== null) return;
    if (!window.confirm(`هل تريد أرشفة التصنيف «${category.name}»؟ سيبقى السجل محفوظًا، ولن يُحذف.`)) return;
    setArchivingId(category.id);
    try {
      const result = await archiveAdminCatalogCategory(category.id);
      if (result.id !== category.id || result.is_active !== false || result.archived !== true) {
        throw new Error('لم يؤكد الخادم أرشفة التصنيف.');
      }
      await refetch();
      onNotice('تمت أرشفة التصنيف');
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'تعذر أرشفة التصنيف');
    } finally {
      setArchivingId(null);
    }
  }

  async function restore(category: Category) {
    if (!canManageImports || category.is_active !== false || restoringId !== null || archivingId !== null || renamingId !== null) return;
    if (!window.confirm(`هل تريد استعادة التصنيف «${category.name}» وإعادته إلى الاختيارات النشطة؟`)) return;
    setRestoringId(category.id);
    try {
      const result = await restoreAdminCatalogCategory(category.id);
      if (result.id !== category.id || result.is_active !== true || typeof result.restored !== 'boolean') {
        throw new Error('لم يؤكد الخادم استعادة التصنيف.');
      }
      await refetch();
      onNotice(result.restored ? 'تمت استعادة التصنيف' : 'التصنيف نشط بالفعل');
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'تعذرت استعادة التصنيف');
    } finally {
      setRestoringId(null);
    }
  }

  function beginRename(category: Category) {
    if (!canManageImports || category.is_active === false || renamingId !== null || archivingId !== null || restoringId !== null) return;
    setEditingCategoryId(category.id);
    setRenameDraft(category.name);
  }

  function cancelRename() {
    if (renamingId !== null) return;
    setEditingCategoryId(null);
    setRenameDraft('');
  }

  async function renameCategory(category: Category) {
    const nextName = renameDraft.trim();
    if (!canManageImports || category.is_active === false || editingCategoryId !== category.id
      || !nextName || renamingId !== null || archivingId !== null || restoringId !== null) return;
    setRenamingId(category.id);
    try {
      const result = await renameAdminCatalogCategory(category.id, nextName);
      if (result.id !== category.id || result.name !== nextName || typeof result.renamed !== 'boolean') {
        throw new Error('لم يؤكد الخادم إعادة تسمية التصنيف.');
      }
      setEditingCategoryId(null);
      setRenameDraft('');
      await refetch();
      onNotice(result.renamed ? 'تم تحديث اسم التصنيف' : 'لم يتغير اسم التصنيف');
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'تعذر تحديث اسم التصنيف');
    } finally {
      setRenamingId(null);
    }
  }

  if (section === 'import' && canManageImports) {
    return <>
      <div className="toolbar">
        <span className="toolbar-note">الاستيراد الموحد — صلاحية المدير أو مدير النظام</span>
        <div className="toolbar-actions">
          <Button variant="outline" onClick={() => setSection('categories')}>
            <Database size={16} /> العودة إلى التصنيفات
          </Button>
        </div>
      </div>
      <UnifiedImportEngine onNotice={onNotice} initialJobId={initialImportJobId} />
    </>;
  }

  if (section === 'onyx' && user?.isStaff) {
    return <OnyxSnapshotCenter onBack={() => setSection('categories')} />;
  }

  return <>
    <Heading eyebrow="إدارة البيانات" title="مركز البيانات الموحد" description="تنظيم التصنيفات واستيراد البيانات مع التحقق من الجودة والبصمة ومنع التكرار" icon={Database} />
    <div className="toolbar">
      <span className="toolbar-note">المصدر المعتمد هو قاعدة بيانات المؤسسة الحالية؛ لا تُنشأ بيانات تجريبية.</span>
      <div className="toolbar-actions">
        {canManageImports && <Button onClick={() => setSection('import')}><FileText size={16} /> فتح محرك الاستيراد الموحد</Button>}
        {user?.isStaff && <Button variant="outline" onClick={() => setSection('onyx')}><PackageCheck size={16} /> تحليلات أونكس ومطابقة المخزون</Button>}
        <Button variant="secondary" onClick={() => void refetch()}><RefreshCw size={16} /> تحديث التصنيفات</Button>
      </div>
    </div>
    <div className="data-layout">
      <section className="panel">
        <div className="panel-head"><div><h2>التصنيفات</h2><p>تستخدم لتنظيم المنتجات والتقارير</p></div></div>
        {canManageImports && <div className="form-grid">
          <Field label="اسم التصنيف">
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="اسم التصنيف الجديد" />
          </Field>
          <Field label="رمز التصنيف (اختياري)">
            <input value={categoryCode} onChange={(event) => setCategoryCode(event.target.value)} maxLength={64} placeholder="رمز داخلي للتصنيف" dir="auto" />
          </Field>
          <Field label="التصنيف الأب (اختياري)">
            <select aria-label="التصنيف الأب" value={parentCategoryId} onChange={(event) => setParentCategoryId(event.target.value)}>
              <option value="">تصنيف رئيسي</option>
              {(categories ?? []).filter((candidate) => candidate.is_active !== false).map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
              ))}
            </select>
          </Field>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <Button onClick={() => void add()} disabled={!name.trim() || categoryCode.trim().length > 64}>
              <Plus size={16} /> إضافة التصنيف
            </Button>
          </div>
        </div>}
        {loading ? <Loading /> : error ? <ErrorBox message={error} /> : categories?.length
          ? <div className="category-list">{categories.map((category: Category) =>
              <div key={category.id}>
                {editingCategoryId === category.id && category.is_active !== false ? <>
                  <input
                    aria-label={`اسم التصنيف الجديد: ${category.name}`}
                    value={renameDraft}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    maxLength={100}
                    disabled={renamingId === category.id}
                  />
                  <Button onClick={() => void renameCategory(category)} disabled={!renameDraft.trim() || renamingId !== null || archivingId !== null || restoringId !== null}>
                    <Check size={16} /> {renamingId === category.id ? 'جار حفظ الاسم…' : 'حفظ الاسم'}
                  </Button>
                  <Button variant="outline" disabled={renamingId !== null} onClick={cancelRename}>إلغاء</Button>
                </> : <>
                  <span>{category.name}</span>
                  {category.parent_id && <small className="text-muted">التصنيف الأب: {(categories ?? []).find((parent) => parent.id === category.parent_id)?.name ?? 'غير متاح'}</small>}
                  {canManageImports && category.is_active !== false && <Button variant="outline" disabled={renamingId !== null || archivingId !== null || restoringId !== null} onClick={() => beginRename(category)}>
                    <Pencil size={16} /> تعديل الاسم
                  </Button>}
                </>}
                <small>{category.code ?? 'بدون رمز'}</small>
                {category.is_active === false && <small className="text-muted">مؤرشف</small>}
                {canManageImports && category.is_active === false && <Button variant="outline" disabled={restoringId !== null || archivingId !== null || renamingId !== null || editingCategoryId !== null} onClick={() => void restore(category)}>
                  <RefreshCw size={16} /> {restoringId === category.id ? "جار الاستعادة…" : "استعادة"}
                </Button>}
                {canManageImports && category.is_active !== false && <Button variant="outline" disabled={archivingId === category.id || renamingId !== null || editingCategoryId !== null || restoringId !== null} onClick={() => void archive(category)}>
                  <Trash2 size={16} /> {archivingId === category.id ? 'جار الأرشفة…' : 'أرشفة'}
                </Button>}
              </div>
            )}</div>
          : <Empty text="لا توجد تصنيفات محفوظة لهذه المؤسسة بعد." />}
      </section>
      <section className="panel data-info">
        <Database size={28} />
        <h2>استيراد مضبوط وقابل للاستئناف</h2>
        <p>محرك الاستيراد يعمل على الملفات الفعلية بحدود معلنة، وبصمة SHA-256، وملفات تعريف وقواعد تحقق، ويوقف التعارض الذي يحتاج قرارًا بشريًا. لا يخزن الملف الخام ولا يمحو سجلات لم تظهر في المصدر.</p>
        <div className={'data-status ' + (loading ? 'pending' : error ? 'error' : 'success')}>
          {loading ? <RefreshCw size={16} className="spin" /> : error ? <AlertTriangle size={16} /> : <Check size={16} />}
          {loading ? 'جار التحقق من بيانات التصنيفات…' : error ? 'تعذر تحميل التصنيفات: ' + error : 'اتصال التصنيفات ناجح'}
        </div>
        {!canManageImports && <p className="text-muted">استيراد البيانات متاح لمدير النظام أو المدير فقط. تظل صلاحيات الخادم وسياسات قاعدة البيانات هي المرجع الحاكم.</p>}
      </section>
    </div>
  </>;
}

