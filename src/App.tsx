import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { ToastProvider } from '@/components/ui/Toast'
import { ConnectivityStatus } from '@/components/ui/ConnectivityStatus'
import { StorefrontShell } from '@/components/storefront/StorefrontShell'
import { AdminShell } from '@/components/admin/AdminShell'
import { ProtectedRoute, AdminRoute, PublicOnlyRoute } from '@/components/guards/RouteGuards'
// Route-owned screens load only when the route is visited.
const lazyNamed = <TModule extends object, TName extends keyof TModule>(
  load: () => Promise<TModule>,
  name: TName,
) => lazy(async () => ({ default: (await load())[name] as ComponentType<any> }))

const storefrontPages = () => import('@/pages/storefront/StorefrontPages')
const adminPages = () => import('@/pages/admin/AdminPages')
const operationsPages = () => import('@/pages/admin/OperationsPages')
const transactionsPages = () => import('@/pages/admin/TransactionsPages')
const utilityPages = () => import('@/pages/admin/UtilityPages')

const PolicyCenter = lazy(() => import('@/pages/admin/PolicyCenter'))
const AIAssistant = lazy(() => import('@/pages/admin/AIAssistant'))

const AdminInventory = lazyNamed(operationsPages, 'Inventory')
const AdminWarehouses = lazyNamed(operationsPages, 'Warehouses')
const AdminStockMovements = lazyNamed(operationsPages, 'StockMovements')
const AdminSuppliers = lazyNamed(operationsPages, 'Suppliers')
const AdminFinanceInvoices = lazyNamed(operationsPages, 'AdminInvoices')
const AdminFinancePayments = lazyNamed(operationsPages, 'AdminPayments')
const AdminFinanceStatements = lazyNamed(operationsPages, 'AdminStatements')
const AdminRoles = lazyNamed(operationsPages, 'AdminRoles')
const AdminOutbox = lazyNamed(operationsPages, 'AdminOutbox')
const AdminIdempotency = lazyNamed(operationsPages, 'AdminIdempotency')

const AdminPurchasing = lazyNamed(transactionsPages, 'Purchasing')
const AdminReceiving = lazyNamed(transactionsPages, 'Receiving')
const AdminTransfers = lazyNamed(transactionsPages, 'Transfers')
const AdminStockCounts = lazyNamed(transactionsPages, 'StockCounts')
const AdminExpenses = lazyNamed(transactionsPages, 'Expenses')
const AdminBarcodeLookup = lazyNamed(utilityPages, 'BarcodeLookup')
const AdminDataExports = lazyNamed(utilityPages, 'DataExports')

const Landing = lazy(() => import('@/pages/storefront/Landing'))
const Login = lazy(() => import('@/pages/storefront/Login'))
const Register = lazy(() => import('@/pages/storefront/Register'))
const ForgotPassword = lazy(() => import('@/pages/storefront/ForgotPassword'))
const ResetPassword = lazy(() => import('@/pages/storefront/ResetPassword'))
const Store = lazy(() => import('@/pages/storefront/Store'))
const Catalog = lazy(() => import('@/pages/storefront/Catalog'))
const ProductDetail = lazy(() => import('@/pages/storefront/ProductDetail'))
const NotFound = lazy(() => import('@/pages/NotFound'))

const SearchPage = lazyNamed(storefrontPages, 'SearchPage')
const Cart = lazyNamed(storefrontPages, 'Cart')
const Checkout = lazyNamed(storefrontPages, 'Checkout')
const OrderSuccess = lazyNamed(storefrontPages, 'OrderSuccess')
const Orders = lazyNamed(storefrontPages, 'Orders')
const OrderDetail = lazyNamed(storefrontPages, 'OrderDetail')
const Wishlist = lazyNamed(storefrontPages, 'Wishlist')
const Invoices = lazyNamed(storefrontPages, 'Invoices')
const InvoiceDetail = lazyNamed(storefrontPages, 'InvoiceDetail')
const Statements = lazyNamed(storefrontPages, 'Statements')
const Payments = lazyNamed(storefrontPages, 'Payments')
const Profile = lazyNamed(storefrontPages, 'Profile')
const Company = lazyNamed(storefrontPages, 'Company')
const Addresses = lazyNamed(storefrontPages, 'Addresses')
const Notifications = lazyNamed(storefrontPages, 'Notifications')
const AccountSettings = lazyNamed(storefrontPages, 'AccountSettings')
const Help = lazyNamed(storefrontPages, 'Help')
const OnboardingCompany = lazyNamed(storefrontPages, 'OnboardingCompany')
const AccountPending = lazyNamed(storefrontPages, 'AccountPending')
const VerifyAccount = lazyNamed(storefrontPages, 'VerifyAccount')
const ProfileOnboarding = lazyNamed(storefrontPages, 'ProfileOnboarding')
const InvitePage = lazyNamed(storefrontPages, 'InvitePage')
const ProductsPage = lazyNamed(storefrontPages, 'ProductsPage')
const CategoriesPage = lazyNamed(storefrontPages, 'CategoriesPage')
const AdvancedSearch = lazyNamed(storefrontPages, 'AdvancedSearch')
const ComparePage = lazyNamed(storefrontPages, 'ComparePage')
const CheckoutReview = lazyNamed(storefrontPages, 'CheckoutReview')
const CheckoutConfirm = lazyNamed(storefrontPages, 'CheckoutConfirm')
const ReorderList = lazyNamed(storefrontPages, 'ReorderList')
const ReorderDetail = lazyNamed(storefrontPages, 'ReorderDetail')
const Templates = lazyNamed(storefrontPages, 'Templates')
const TemplateDetail = lazyNamed(storefrontPages, 'TemplateDetail')
const TemplateEdit = lazyNamed(storefrontPages, 'TemplateEdit')
const TemplateNew = lazyNamed(storefrontPages, 'TemplateNew')
const PricingPage = lazyNamed(storefrontPages, 'PricingPage')
const StatementDetail = lazyNamed(storefrontPages, 'StatementDetail')
const PaymentDetail = lazyNamed(storefrontPages, 'PaymentDetail')
const Receivables = lazyNamed(storefrontPages, 'Receivables')
const FinancialDocuments = lazyNamed(storefrontPages, 'FinancialDocuments')
const CompanyDetails = lazyNamed(storefrontPages, 'CompanyDetails')
const CompanyContacts = lazyNamed(storefrontPages, 'CompanyContacts')
const CompanyUsers = lazyNamed(storefrontPages, 'CompanyUsers')
const HelpOrder = lazyNamed(storefrontPages, 'HelpOrder')
const HelpAccount = lazyNamed(storefrontPages, 'HelpAccount')

const AdminDashboard = lazyNamed(adminPages, 'Dashboard')
const AdminOrders = lazyNamed(adminPages, 'Orders')
const AdminOrderDetail = lazyNamed(adminPages, 'OrderDetail')
const AdminCustomers = lazyNamed(adminPages, 'Customers')
const AdminCatalog = lazyNamed(adminPages, 'Catalog')
const AdminPricing = lazyNamed(adminPages, 'Pricing')
const AdminDataCenter = lazyNamed(adminPages, 'DataCenter')
const AdminImport = lazyNamed(adminPages, 'Import')
const AdminImportLogs = lazyNamed(adminPages, 'ImportLogs')
const AdminAI = lazyNamed(adminPages, 'AI')
const AdminAIReports = lazyNamed(adminPages, 'AIReports')
const AdminAIAlerts = lazyNamed(adminPages, 'AIAlerts')
const AdminAITasks = lazyNamed(adminPages, 'AITasks')
const AdminReports = lazyNamed(adminPages, 'Reports')
const AdminUsers = lazyNamed(adminPages, 'UsersPage')
const AdminAudit = lazyNamed(adminPages, 'Audit')
const AdminNotifications = lazyNamed(adminPages, 'AdminNotifications')
const AdminHealth = lazyNamed(adminPages, 'Health')
const AdminSettings = lazyNamed(adminPages, 'Settings')

function PageLoading() {
  return <div role="status" aria-live="polite" dir="rtl" className="flex min-h-[30vh] items-center justify-center p-6 text-sm text-neutral-500">جارٍ تحميل الصفحة…</div>
}

function suspendPage(element: ReactNode) {
  return <Suspense fallback={<PageLoading />}>{element}</Suspense>
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConnectivityStatus />
        <Routes>
          {/* Storefront */}
          <Route element={suspendPage(<StorefrontShell />)}>
            <Route path="/" element={suspendPage(<Landing />)} />
            <Route path="/store" element={suspendPage(<Store />)} />
            <Route path="/catalog" element={suspendPage(<Catalog />)} />
            <Route path="/products" element={suspendPage(<ProductsPage />)} />
            <Route path="/categories" element={suspendPage(<CategoriesPage />)} />
            <Route path="/category/:slug" element={suspendPage(<Catalog />)} />
            <Route path="/category/:slug/subcategory/:subcategorySlug" element={suspendPage(<Catalog />)} />
            <Route path="/collection/:slug" element={suspendPage(<Store />)} />
            <Route path="/product/:id" element={suspendPage(<ProductDetail />)} />
            <Route path="/search" element={suspendPage(<SearchPage />)} />
            <Route path="/search/advanced" element={suspendPage(<AdvancedSearch />)} />
            <Route path="/featured" element={suspendPage(<Store />)} />
            <Route path="/new" element={suspendPage(<Store />)} />
            <Route path="/popular" element={suspendPage(<Store />)} />
            <Route path="/offers" element={suspendPage(<Store />)} />
            <Route path="/collections" element={suspendPage(<Store />)} />
            <Route path="/help" element={suspendPage(<Help />)} />
            <Route path="/help/faq" element={suspendPage(<Help />)} />
            <Route path="/help/contact" element={suspendPage(<Help />)} />
            <Route path="/help/policies" element={suspendPage(<Help />)} />
            <Route path="/help/order" element={suspendPage(<HelpOrder />)} />
            <Route path="/help/account" element={suspendPage(<HelpAccount />)} />

            {/* Protected storefront */}
            <Route path="/cart" element={<ProtectedRoute>{suspendPage(<Cart />)}</ProtectedRoute>} />
            <Route path="/checkout" element={<ProtectedRoute>{suspendPage(<Checkout />)}</ProtectedRoute>} />
            <Route path="/checkout/review" element={<ProtectedRoute>{suspendPage(<CheckoutReview />)}</ProtectedRoute>} />
            <Route path="/checkout/confirm" element={<ProtectedRoute>{suspendPage(<CheckoutConfirm />)}</ProtectedRoute>} />
            <Route path="/order-success/:id" element={<ProtectedRoute>{suspendPage(<OrderSuccess />)}</ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute>{suspendPage(<Orders />)}</ProtectedRoute>} />
            <Route path="/orders/:id" element={<ProtectedRoute>{suspendPage(<OrderDetail />)}</ProtectedRoute>} />
            <Route path="/reorder" element={<ProtectedRoute>{suspendPage(<ReorderList />)}</ProtectedRoute>} />
            <Route path="/reorder/:id" element={<ProtectedRoute>{suspendPage(<ReorderDetail />)}</ProtectedRoute>} />
            <Route path="/templates" element={<ProtectedRoute>{suspendPage(<Templates />)}</ProtectedRoute>} />
            <Route path="/templates/new" element={<ProtectedRoute>{suspendPage(<TemplateNew />)}</ProtectedRoute>} />
            <Route path="/templates/:id" element={<ProtectedRoute>{suspendPage(<TemplateDetail />)}</ProtectedRoute>} />
            <Route path="/templates/:id/edit" element={<ProtectedRoute>{suspendPage(<TemplateEdit />)}</ProtectedRoute>} />
            <Route path="/pricing" element={<ProtectedRoute>{suspendPage(<PricingPage />)}</ProtectedRoute>} />
            <Route path="/wishlist" element={<ProtectedRoute>{suspendPage(<Wishlist />)}</ProtectedRoute>} />
            <Route path="/compare" element={suspendPage(<ComparePage />)} />
            <Route path="/invoices" element={<ProtectedRoute>{suspendPage(<Invoices />)}</ProtectedRoute>} />
            <Route path="/invoices/:id" element={<ProtectedRoute>{suspendPage(<InvoiceDetail />)}</ProtectedRoute>} />
            <Route path="/payments/:id" element={<ProtectedRoute>{suspendPage(<PaymentDetail />)}</ProtectedRoute>} />
            <Route path="/payments" element={<ProtectedRoute>{suspendPage(<Payments />)}</ProtectedRoute>} />
            <Route path="/receivables" element={<ProtectedRoute>{suspendPage(<Receivables />)}</ProtectedRoute>} />
            <Route path="/financial-documents" element={<ProtectedRoute>{suspendPage(<FinancialDocuments />)}</ProtectedRoute>} />
            <Route path="/statements" element={<ProtectedRoute>{suspendPage(<Statements />)}</ProtectedRoute>} />
            <Route path="/statements/:id" element={<ProtectedRoute>{suspendPage(<StatementDetail />)}</ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute>{suspendPage(<Profile />)}</ProtectedRoute>} />
            <Route path="/company" element={<ProtectedRoute>{suspendPage(<Company />)}</ProtectedRoute>} />
            <Route path="/company/details" element={<ProtectedRoute>{suspendPage(<CompanyDetails />)}</ProtectedRoute>} />
            <Route path="/company/contacts" element={<ProtectedRoute>{suspendPage(<CompanyContacts />)}</ProtectedRoute>} />
            <Route path="/company/users" element={<ProtectedRoute>{suspendPage(<CompanyUsers />)}</ProtectedRoute>} />
            <Route path="/addresses" element={<ProtectedRoute>{suspendPage(<Addresses />)}</ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute>{suspendPage(<Notifications />)}</ProtectedRoute>} />
            <Route path="/account/settings" element={<ProtectedRoute>{suspendPage(<AccountSettings />)}</ProtectedRoute>} />
            <Route path="/account/password" element={<ProtectedRoute>{suspendPage(<AccountSettings />)}</ProtectedRoute>} />
            <Route path="/account/notifications" element={<ProtectedRoute>{suspendPage(<Notifications />)}</ProtectedRoute>} />
            <Route path="/account/language" element={<ProtectedRoute>{suspendPage(<AccountSettings />)}</ProtectedRoute>} />
            <Route path="/account/appearance" element={<ProtectedRoute>{suspendPage(<AccountSettings />)}</ProtectedRoute>} />
            <Route path="/account/devices" element={<ProtectedRoute>{suspendPage(<AccountSettings />)}</ProtectedRoute>} />
            <Route path="/addresses/new" element={<ProtectedRoute>{suspendPage(<Addresses />)}</ProtectedRoute>} />
            <Route path="/addresses/:id/edit" element={<ProtectedRoute>{suspendPage(<Addresses />)}</ProtectedRoute>} />
            <Route path="/onboarding/profile" element={<ProtectedRoute>{suspendPage(<ProfileOnboarding />)}</ProtectedRoute>} />
            <Route path="/account/pending" element={<ProtectedRoute>{suspendPage(<AccountPending />)}</ProtectedRoute>} />
            <Route path="/onboarding/company" element={<ProtectedRoute>{suspendPage(<OnboardingCompany />)}</ProtectedRoute>} />
          </Route>

          {/* Auth */}
          <Route path="/login" element={<PublicOnlyRoute>{suspendPage(<Login />)}</PublicOnlyRoute>} />
          <Route path="/register" element={<PublicOnlyRoute>{suspendPage(<Register />)}</PublicOnlyRoute>} />
          <Route path="/forgot-password" element={suspendPage(<ForgotPassword />)} />
          <Route path="/reset-password" element={suspendPage(<ResetPassword />)} />
          <Route path="/verify" element={suspendPage(<VerifyAccount />)} />
          <Route path="/invite/:token" element={suspendPage(<InvitePage />)} />

          {/* Admin */}
          <Route path="/admin" element={<AdminRoute><AdminShell /></AdminRoute>}>
            <Route index element={suspendPage(<AdminDashboard />)} />
            <Route path="orders" element={suspendPage(<AdminOrders />)} />
            <Route path="order/:id" element={suspendPage(<AdminOrderDetail />)} />
            <Route path="customers" element={suspendPage(<AdminCustomers />)} />
            <Route path="catalog" element={suspendPage(<AdminCatalog />)} />
            <Route path="pricing" element={suspendPage(<AdminPricing />)} />
            <Route path="inventory" element={suspendPage(<AdminInventory />)} />
            <Route path="warehouses" element={suspendPage(<AdminWarehouses />)} />
            <Route path="inventory/movements" element={suspendPage(<AdminStockMovements />)} />
            <Route path="purchasing" element={suspendPage(<AdminPurchasing />)} />
            <Route path="receiving" element={suspendPage(<AdminReceiving />)} />
            <Route path="transfers" element={suspendPage(<AdminTransfers />)} />
            <Route path="stock-counts" element={suspendPage(<AdminStockCounts />)} />
            <Route path="expenses" element={suspendPage(<AdminExpenses />)} />
            <Route path="barcode" element={suspendPage(<AdminBarcodeLookup />)} />
            <Route path="exports" element={suspendPage(<AdminDataExports />)} />
            <Route path="suppliers" element={suspendPage(<AdminSuppliers />)} />
            <Route path="invoices" element={suspendPage(<AdminFinanceInvoices />)} />
            <Route path="payments" element={suspendPage(<AdminFinancePayments />)} />
            <Route path="statements" element={suspendPage(<AdminFinanceStatements />)} />
            <Route path="roles" element={suspendPage(<AdminRoles />)} />
            <Route path="outbox" element={suspendPage(<AdminOutbox />)} />
            <Route path="idempotency" element={suspendPage(<AdminIdempotency />)} />
            <Route path="data-center" element={suspendPage(<AdminDataCenter />)} />
            <Route path="import" element={suspendPage(<AdminImport />)} />
            <Route path="import-logs" element={suspendPage(<AdminImportLogs />)} />
            <Route path="ai" element={suspendPage(<AdminAI />)} />
            <Route path="ai/reports" element={suspendPage(<AdminAIReports />)} />
            <Route path="ai/alerts" element={suspendPage(<AdminAIAlerts />)} />
            <Route path="ai/tasks" element={suspendPage(<AdminAITasks />)} />
            <Route path="reports" element={suspendPage(<AdminReports />)} />
            <Route path="users" element={suspendPage(<AdminUsers />)} />
            <Route path="audit" element={suspendPage(<AdminAudit />)} />
            <Route path="notifications" element={suspendPage(<AdminNotifications />)} />
            <Route path="health" element={suspendPage(<AdminHealth />)} />
            <Route path="settings" element={suspendPage(<AdminSettings />)} />
            <Route path="policy-center" element={suspendPage(<PolicyCenter />)} />
            <Route path="workspace" element={suspendPage(<AdminCustomers />)} />
            <Route path="devices" element={suspendPage(<AdminCustomers />)} />
            <Route path="engines" element={suspendPage(<AdminDataCenter />)} />
            <Route path="finance-data" element={suspendPage(<AdminDataCenter />)} />
            <Route path="images" element={suspendPage(<AdminCatalog />)} />
            <Route path="ai/sync" element={suspendPage(<AdminAI />)} />
            <Route path="ai/stock-sync" element={suspendPage(<AdminAI />)} />
            <Route path="ai/assistant" element={suspendPage(<AIAssistant />)} />
            <Route path="ai/governance" element={suspendPage(<AdminAI />)} />
            <Route path="ai/insights" element={suspendPage(<AdminAI />)} />
            <Route path="ai/prompts" element={suspendPage(<AdminAI />)} />
            <Route path="ai/models" element={suspendPage(<AdminAI />)} />
            <Route path="ai/settings" element={suspendPage(<AdminSettings />)} />
            <Route path="ai/audit" element={suspendPage(<AdminAudit />)} />
            <Route path="ai/executive" element={suspendPage(<AdminReports />)} />
            <Route path="architecture" element={suspendPage(<AdminHealth />)} />
            <Route path="errors" element={suspendPage(<AdminHealth />)} />
            <Route path="queues" element={suspendPage(<AdminHealth />)} />
            <Route path="appearance" element={suspendPage(<AdminSettings />)} />
            <Route path="invites" element={suspendPage(<AdminUsers />)} />
            <Route path="onyx" element={suspendPage(<AdminSettings />)} />
            <Route path="restore" element={suspendPage(<AdminDataCenter />)} />
            <Route path="dev-ai" element={suspendPage(<AdminAI />)} />
            <Route path="dev-ai/patches" element={suspendPage(<AdminAI />)} />
            <Route path="dev-ai/audit" element={suspendPage(<AdminAudit />)} />
            <Route path="dev-ai/settings" element={suspendPage(<AdminSettings />)} />
          </Route>

          {/* 404 */}
          <Route path="*" element={suspendPage(<NotFound />)} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  )
}
