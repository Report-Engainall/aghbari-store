export type AdminViewId =
  | "dashboard" | "products" | "customers" | "orders" | "pricing" | "offers" | "reports" | "data"
  | "operations" | "notifications" | "ai" | "suppliers" | "devices" | "settings" | "quotes"
  | "finance" | "tasks" | "audit" | "stock-count" | "inventory-transfers" | "purchase-orders"
  | "intelligence" | "service-desk";

export type AdminRoleId = "admin" | "manager" | "staff" | "accountant" | "customer_manager" | "customer";

export const ADMIN_NAV_GROUPS: ReadonlyArray<{
  id: string;
  label: string;
  views: readonly AdminViewId[];
}> = [
  { id: "executive", label: "القيادة والمتابعة", views: ["dashboard", "intelligence", "reports"] },
  { id: "sales", label: "المبيعات والعملاء", views: ["customers", "service-desk", "orders", "quotes"] },
  { id: "catalog", label: "الكتالوج والتسعير", views: ["products", "pricing", "offers"] },
  { id: "supply", label: "المخزون والمشتريات", views: ["stock-count", "inventory-transfers", "suppliers", "purchase-orders"] },
  { id: "operations", label: "البيانات والتشغيل", views: ["data", "operations", "tasks", "ai", "notifications"] },
  { id: "administration", label: "الإدارة والنظام", views: ["finance", "devices", "audit", "settings"] },
];

export const ADMIN_ACCESS_ROLES: ReadonlyArray<{
  id: AdminRoleId;
  label: string;
  scope: string;
  summary: string;
}> = [
  { id: "admin", label: "مدير النظام", scope: "المؤسسة كاملة", summary: "إدارة النظام والعمليات والتسعير والمالية والصلاحيات." },
  { id: "manager", label: "مدير", scope: "المؤسسة كاملة", summary: "إدارة التشغيل والتسعير والمالية والقرارات؛ دون تغيير أدوار المستخدمين." },
  { id: "staff", label: "موظف تشغيل", scope: "مساحات التشغيل", summary: "العمل في الكتالوج والعملاء والطلبات والمخزون والمهام دون صلاحية المحاسبة أو قرارات الإدارة." },
  { id: "accountant", label: "محاسب", scope: "المالية والمهام", summary: "وصول مالي مستقل؛ لا يكتسب صلاحيات الطلبات أو المنتجات أو المخزون." },
  { id: "customer_manager", label: "مسؤول العملاء", scope: "إدارة العملاء", summary: "دليل العملاء ودورة العميل ضمن صلاحية الدور؛ لا يفتح مساحات التشغيل الأخرى منفردًا." },
  { id: "customer", label: "عميل", scope: "واجهة المتجر", summary: "حساب متجر وليس حسابًا إداريًا؛ لا يظهر في قائمة الإدارة." },
];

const GENERAL_OPERATIONS: readonly AdminViewId[] = [
  "dashboard", "products", "customers", "service-desk", "orders", "pricing", "offers", "reports",
  "data", "operations", "notifications", "ai", "suppliers", "devices", "settings", "quotes",
  "tasks", "stock-count", "inventory-transfers",
];

export const ROLE_PAGE_ACCESS: Readonly<Record<AdminRoleId, readonly AdminViewId[]>> = {
  admin: [...GENERAL_OPERATIONS, "finance", "audit", "purchase-orders", "intelligence"],
  manager: [...GENERAL_OPERATIONS, "finance", "audit", "purchase-orders", "intelligence"],
  staff: GENERAL_OPERATIONS,
  accountant: ["finance", "tasks"],
  customer_manager: ["customers"],
  customer: [],
};

export function roleCanAccessView(role: string, view: AdminViewId): boolean {
  return Object.prototype.hasOwnProperty.call(ROLE_PAGE_ACCESS, role) &&
    ROLE_PAGE_ACCESS[role as AdminRoleId].includes(view);
}

export function rolesCanAccessView(roles: readonly string[], view: AdminViewId): boolean {
  return roles.some((role) => roleCanAccessView(role, view));
}

export function pageAccessReason(role: string, view: AdminViewId): string {
  if (roleCanAccessView(role, view)) return "مسموح وفق نطاق الدور الظاهر في قائمة الإدارة.";
  if (role === "customer") return "هذا حساب عميل؛ الوصول الإداري يقتصر على فريق المؤسسة.";
  if (role === "customer_manager") return "دور مسؤول العملاء محصور في دليل العملاء ودورة العميل.";
  if (role === "accountant") return "دور المحاسب مستقل عن التشغيل؛ يسمح بالفواتير والتحصيل والمهام فقط.";
  if (view === "finance") return "تتطلب مساحة المالية دور مدير النظام أو المدير أو المحاسب.";
  if (view === "audit" || view === "intelligence") return "هذه المساحة محصورة بمدير النظام أو المدير.";
  if (view === "purchase-orders") return "إدارة أوامر الشراء محصورة بمدير النظام أو المدير.";
  return "لا توجد صلاحية لهذا المسار ضمن الدور المحدد؛ الخادم وسياسات RLS هي المرجع النهائي.";
}

export type AdminOperationId =
  | "pricing_rules_write" | "pricing_rule_submit" | "pricing_rules_approve" | "product_lifecycle"
  | "inventory_reorder_point" | "inventory_transfer" | "stock_count_edit" | "stock_count_finalize"
  | "customer_lifecycle" | "customer_activation" | "customer_360" | "imports_stage" | "imports_finalize"
  | "purchase_orders_manage" | "operational_task_status" | "finance_manage" | "role_assignment" | "audit_intelligence" | "pricing_rule_submit" | "imports_stage" | "imports_finalize" | "operational_task_status";

export const ADMIN_OPERATION_RULES: ReadonlyArray<{
  id: AdminOperationId;
  label: string;
  area: string;
  allowedRoles: readonly AdminRoleId[];
  limit: string;
  denial: string;
}> = [
  { id: "pricing_rules_write", label: "تعديل القواعد القائمة وشبكة الأسعار", area: "الأسعار", allowedRoles: ["admin", "manager"], limit: "شبكة الأسعار وتعديل القاعدة القائمة محصوران بمدير النظام أو المدير؛ القواعد ذات الموافقة المقفلة لا تعدل مباشرة.", denial: "تعديل القواعد القائمة وشبكة الأسعار يتطلب دور مدير النظام أو المدير." },
  { id: "pricing_rule_submit", label: "تقديم قاعدة تسعير جديدة للموافقة", area: "الأسعار", allowedRoles: ["admin", "manager", "staff"], limit: "يستطيع موظف التشغيل تقديم قاعدة جديدة فقط؛ يحولها الخادم إلى قاعدة تتطلب موافقة ولا يسمح له بتعديل القاعدة القائمة أو شبكة الأسعار.", denial: "تقديم قواعد التسعير الجديدة يتطلب دورًا تشغيليًا في المؤسسة؛ الحساب المالي أو مسؤول العملاء لا يملكان هذا المسار." },
  { id: "pricing_rules_approve", label: "اعتماد قواعد التسعير", area: "الأسعار", allowedRoles: ["admin", "manager"], limit: "الاعتماد يمر عبر إجراء الموافقة الحالي في الخادم.", denial: "الموافقة على قواعد التسعير محصورة بمدير النظام أو المدير." },
  { id: "product_lifecycle", label: "أرشفة المنتج وإعادة تفعيله", area: "البيانات الأساسية", allowedRoles: ["admin", "manager"], limit: "الأرشفة تحفظ سجل المنتج ولا تحذف الأصل أو تغير رصيد المخزون.", denial: "تغيير دورة حياة المنتج محصور بمدير النظام أو المدير." },
  { id: "inventory_reorder_point", label: "تعديل حد إعادة الطلب", area: "المخزون", allowedRoles: ["admin", "manager"], limit: "يتطلب رصيد مستودع مثبتًا وسببًا للتعديل؛ لا يُنشأ رصيد افتراضي عند غياب المصدر.", denial: "تعديل حد إعادة الطلب محصور بمدير النظام أو المدير." },
  { id: "inventory_transfer", label: "نقل المخزون بين المستودعات", area: "المخزون", allowedRoles: ["admin", "manager", "staff"], limit: "يتطلب مستودعين نشطين وكمية متاحة بعد الحجوزات وسببًا ومفتاح منع التكرار.", denial: "النقل يتطلب دورًا تشغيليًا؛ المحاسب ومسؤول العملاء لا يملكان هذا المسار." },
  { id: "stock_count_edit", label: "بدء الجرد وإدخال الكميات", area: "المخزون", allowedRoles: ["admin", "manager", "staff"], limit: "إدخال العد يحفظ مسودة ولا يطبق الفروقات على الرصيد النهائي.", denial: "إدخال الجرد يتطلب دورًا تشغيليًا داخل المؤسسة." },
  { id: "stock_count_finalize", label: "اعتماد الجرد أو إلغاؤه", area: "المخزون", allowedRoles: ["admin", "manager"], limit: "الاعتماد يطبق الفروقات بمعاملة خادمية واحدة؛ الإلغاء يتطلب سببًا.", denial: "الإقفال النهائي للجرد وإلغاؤه محصوران بمدير النظام أو المدير." },
  { id: "customer_lifecycle", label: "تغيير حالة العميل أو شريحته", area: "العملاء", allowedRoles: ["admin", "manager", "customer_manager"], limit: "تغيير الحالة يتطلب الحالة المتوقعة والسبب، ويسجل التغيير في التدقيق.", denial: "تتطلب دورة العميل صلاحية مدير أو مسؤول العملاء." },
  { id: "customer_activation", label: "تنشيط حساب العميل وإرسال الدعوة", area: "العملاء", allowedRoles: ["admin", "manager", "staff", "customer_manager"], limit: "التنشيط منفصل عن تغيير الحالة والشريحة ويطبق موافقات الخادم.", denial: "لا يملك هذا الدور صلاحية تنشيط حسابات العملاء." },
  { id: "customer_360", label: "عرض ملف العميل 360", area: "العملاء والمالية", allowedRoles: ["admin", "manager", "accountant"], limit: "ملف 360 يتطلب صلاحية المالية؛ دور مسؤول العملاء لا يكتسب وصول الفواتير والتحصيل بمجرد إدارة ملف العميل.", denial: "عرض ملف العميل 360 يتطلب صلاحية المالية: مدير النظام أو المدير أو المحاسب." },
  { id: "imports_stage", label: "إنشاء دفعة الاستيراد ورفع الملف ومعاينته", area: "البيانات", allowedRoles: ["admin", "manager", "staff"], limit: "المعاينة والرفع وتجهيز الدفعة لا تنشر لقطة بيانات ولا تستبدل مصدرًا حيًا.", denial: "رفع وتجهيز الاستيراد يتطلب دورًا تشغيليًا في المؤسسة." },
  { id: "imports_finalize", label: "اعتماد الاستيراد ونشر اللقطة", area: "البيانات", allowedRoles: ["admin", "manager"], limit: "الاعتماد يتطلب اكتمال manifest والشرائح وبصمة إعدادات المطابقة؛ الاستبدال الكامل لا يقبل ملفًا غير مثبت كبيانات كاملة.", denial: "اعتماد الاستيراد ونشر اللقطة محصوران بمدير النظام أو المدير." },
  { id: "purchase_orders_manage", label: "إدارة أوامر الشراء والاستلام", area: "المشتريات", allowedRoles: ["admin", "manager"], limit: "الكميات والاستلامات مرتبطة بسجل أمر الشراء وحركات المخزون المعتمدة.", denial: "إدارة أوامر الشراء محصورة بمدير النظام أو المدير." },
  { id: "operational_task_status", label: "تحديث حالة المهمة التشغيلية", area: "المهام", allowedRoles: ["admin", "manager", "staff", "accountant"], limit: "يعتمد السماح على مسار المهمة (مبيعات، مستودع، مشتريات، محاسبة، إدارة أو تشغيل) ودور المستخدم؛ تظهر للموظف مهامه المصرح بها فقط.", denial: "لا يملك هذا الدور صلاحية رؤية مسار المهمة أو تحديث حالتها." },
  { id: "finance_manage", label: "إدارة الفواتير والتحصيل", area: "المالية", allowedRoles: ["admin", "manager", "accountant"], limit: "المحاسب يصل إلى المالية والمهام فقط؛ لا يكتسب صلاحيات التسعير أو المخزون أو الطلبات.", denial: "تتطلب المالية دور مدير النظام أو المدير أو المحاسب." },
  { id: "role_assignment", label: "إسناد أدوار مستخدمي المؤسسة", area: "إدارة النظام", allowedRoles: ["admin"], limit: "يتم عبر RPC محمي ومقيد بالمؤسسة، مع حماية الحساب الحالي وآخر مدير نشط وتسجيل التدقيق.", denial: "تعديل أدوار المستخدمين محصور بمدير النظام؛ لا يمكن للحساب تعديل أدواره بنفسه." },
  { id: "audit_intelligence", label: "عرض سجل التدقيق ومركز ذكاء الأعمال", area: "الإدارة", allowedRoles: ["admin", "manager"], limit: "العرض والتحليل لا يستبدلان أمر المصدر عند تنفيذ القرار أو المعاملة.", denial: "سجل التدقيق ومركز ذكاء الأعمال محصوران بمدير النظام أو المدير." },
];

export function operationAllowed(role: string, operation: AdminOperationId): boolean {
  return Boolean(ADMIN_OPERATION_RULES.find((item) => item.id === operation)?.allowedRoles.includes(role as AdminRoleId));
}

export function operationDenialReason(role: string, operation: AdminOperationId): string {
  if (operationAllowed(role, operation)) return "";
  if (role === "customer") return "حساب العميل لا يملك عمليات إدارية.";
  if (role === "customer_manager") return "دور مسؤول العملاء محصور بعمليات العملاء ولا يمتد إلى التسعير أو المخزون أو المالية أو إدارة النظام.";
  if (role === "accountant") return "دور المحاسب مخصص للمالية والمهام؛ لا يمنح صلاحيات تشغيل المنتجات أو التسعير أو المخزون.";
  return ADMIN_OPERATION_RULES.find((item) => item.id === operation)?.denial ?? "لا تسمح سياسة الدور بهذه العملية.";
}
