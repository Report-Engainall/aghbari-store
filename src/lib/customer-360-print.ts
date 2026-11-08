import type { StaffCustomer360Summary } from "@/lib/customer-360-summary";
import type { CustomerInteraction, CustomerInteractionType } from "@/lib/types";

export type Customer360PrintDocument = {
  generatedAt: string;
  customer: { businessName: string; customerCode: string; tier: string; status: string; currentBalance: number | null; creditLimit: number | null };
  orderSummary: {
    orderCount: number; pendingOrderCount: number; fulfilledOrderCount: number; cancelledOrderCount: number;
    nonCancelledOrderValue: number | null; averageOrderValue: number | null; invalidOrderAmountCount: number;
    lastOrderAt: string | null; daysSinceLastOrder: number | null; averageDaysBetweenOrders: number | null;
    statusDistribution: Array<{ status: string; count: number }>;
  };
  recentOrders: Array<{ orderNumber: string; status: string; totalAmount: number | null; totalItems: number | null; createdAt: string }>;
  recentInvoices: Array<{
    invoiceNumber: string; status: string; issuedAt: string | null; dueAt: string | null; currency: string;
    totalAmount: number | null; paidAmount: number; creditMemoAmount: number; outstandingAmount: number | null;
  }>;
  recentPayments: Array<{ paidAt: string; invoiceReference: string; paymentMethod: string | null; amount: number | null; currency: string | null }>;
  financeByCurrency: Array<{
    currency: string; invoiceCount: number; invoicedTotal: number | null; paidTotal: number | null;
    creditMemoTotal: number; outstandingTotal: number | null; overdueInvoiceCount: number;
    overdueOutstanding: number | null; unknownDueDateInvoiceCount: number;
    unknownDueDateOutstanding: number | null; invalidTotalAmountCount: number;
  }>;
  topProducts: Array<{ itemCode: string; productName: string; quantity: number; sales: number | null; lastPurchasedAt: string | null }>;
  recommendations: Array<{
    priority: "high" | "medium" | "low"; title: string; description: string; action: string; currency: string | null;
    overdueInvoiceCount: number | null; overdueOutstanding: number | null; pendingOrderCount: number | null;
    daysSinceLastOrder: number | null; lastOrderAt: string | null;
  }>;
  interactions: Array<{
    interactionType: CustomerInteractionType;
    subject: string;
    details: string;
    interactionAt: string;
    nextFollowUpAt: string | null;
    createdAt: string;
    recordedByName: string;
  }>;
};

function validDate(value: string | null, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error("تاريخ غير صالح في تقرير العميل: " + label + ".");
  return value;
}
function nonNegative(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("قيمة غير صالحة في تقرير العميل: " + label + ".");
  return value;
}
function nonNegativeInteger(value: number, label: string): number {
  const result = nonNegative(value, label);
  if (!Number.isSafeInteger(result)) throw new Error("عدد غير صالح في تقرير العميل: " + label + ".");
  return result;
}
function nullableMoney(value: number | null, label: string): number | null {
  return value === null ? null : nonNegative(value, label);
}
function text(value: string, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error("نص مفقود في تقرير العميل: " + label + ".");
  return value.trim();
}

/**
 * Explicit staff print allowlist. Internal row IDs, customer/contact PII, invoice/payment
 * foreign keys, organization identifiers, raw objects, cost and margin never enter the DTO.
 */
export function projectStaffCustomer360PrintDocument(source: StaffCustomer360Summary, interactions: readonly CustomerInteraction[] = []): Customer360PrintDocument {
  const generatedAt = validDate(source.generated_at, "وقت إنشاء التقرير");
  if (!generatedAt) throw new Error("وقت إنشاء تقرير العميل غير متاح.");

  const recentInvoices = source.recent_invoices.map((invoice) => ({
    invoiceNumber: text(invoice.invoice_number, "رقم الفاتورة"),
    status: text(invoice.status, "حالة الفاتورة"),
    issuedAt: validDate(invoice.issued_at, "تاريخ إصدار الفاتورة"),
    dueAt: validDate(invoice.due_at, "تاريخ استحقاق الفاتورة"),
    currency: text(invoice.currency, "عملة الفاتورة").toUpperCase(),
    totalAmount: nullableMoney(invoice.total_amount, "إجمالي الفاتورة"),
    paidAmount: nonNegative(invoice.paid_amount, "المسدّد"),
    creditMemoAmount: nonNegative(invoice.credit_memo_amount, "الإشعارات الدائنة"),
    outstandingAmount: nullableMoney(invoice.outstanding_amount, "المتبقي"),
  }));
  const invoiceByInternalId = new Map(source.recent_invoices.map((invoice) => [invoice.id, invoice]));

  return {
    generatedAt,
    customer: {
      businessName: text(source.customer.business_name, "اسم العميل"),
      customerCode: text(source.customer.customer_code, "رمز العميل"),
      tier: text(source.customer.tier, "شريحة العميل"),
      status: text(source.customer.status, "حالة العميل"),
      currentBalance: nullableMoney(source.customer.current_balance, "الرصيد المسجل"),
      creditLimit: nullableMoney(source.customer.credit_limit, "الحد الائتماني"),
    },
    orderSummary: {
      orderCount: nonNegativeInteger(source.order_summary.order_count, "إجمالي الطلبات"),
      pendingOrderCount: nonNegativeInteger(source.order_summary.pending_order_count, "الطلبات المعلقة"),
      fulfilledOrderCount: nonNegativeInteger(source.order_summary.fulfilled_order_count, "الطلبات المنفذة"),
      cancelledOrderCount: nonNegativeInteger(source.order_summary.cancelled_order_count, "الطلبات الملغاة"),
      nonCancelledOrderValue: nullableMoney(source.order_summary.non_cancelled_order_value, "قيمة الطلبات غير الملغاة"),
      averageOrderValue: nullableMoney(source.order_summary.average_order_value, "متوسط قيمة الطلب"),
      invalidOrderAmountCount: nonNegativeInteger(source.order_summary.invalid_order_amount_count, "المبالغ غير الصالحة"),
      lastOrderAt: validDate(source.order_summary.last_order_at, "آخر طلب"),
      daysSinceLastOrder: source.order_summary.days_since_last_order === null ? null : nonNegativeInteger(source.order_summary.days_since_last_order, "الأيام منذ آخر طلب"),
      averageDaysBetweenOrders: nullableMoney(source.order_summary.average_days_between_orders, "متوسط المدة بين الطلبات"),
      statusDistribution: source.order_summary.status_distribution.map((entry) => ({
        status: text(entry.status, "حالة الطلب"),
        count: nonNegativeInteger(entry.count, "عدد الطلبات حسب الحالة"),
      })),
    },
    recentOrders: source.recent_orders.map((order) => ({
      orderNumber: text(order.order_number, "رقم الطلب"),
      status: text(order.status, "حالة الطلب"),
      totalAmount: nullableMoney(order.total_amount, "إجمالي الطلب"),
      totalItems: order.total_items === null ? null : nonNegativeInteger(order.total_items, "أصناف الطلب"),
      createdAt: validDate(order.created_at, "تاريخ الطلب")!,
    })),
    recentInvoices,
    recentPayments: source.recent_payments.map((payment) => {
      const invoice = invoiceByInternalId.get(payment.invoice_id);
      return {
        paidAt: validDate(payment.paid_at, "تاريخ الدفعة")!,
        invoiceReference: invoice?.invoice_number ?? "خارج أحدث 20 فاتورة",
        paymentMethod: payment.payment_method,
        amount: invoice ? nonNegative(payment.amount, "مبلغ الدفعة") : null,
        currency: invoice?.currency ?? null,
      };
    }),
    financeByCurrency: source.finance_by_currency.map((finance) => ({
      currency: text(finance.currency, "العملة").toUpperCase(),
      invoiceCount: nonNegativeInteger(finance.invoice_count, "عدد الفواتير"),
      invoicedTotal: nullableMoney(finance.invoiced_total, "إجمالي الفواتير"),
      paidTotal: nullableMoney(finance.paid_total, "إجمالي المدفوع"),
      creditMemoTotal: nonNegative(finance.credit_memo_total, "الإشعارات الدائنة"),
      outstandingTotal: nullableMoney(finance.outstanding_total, "المتبقي"),
      overdueInvoiceCount: nonNegativeInteger(finance.overdue_invoice_count, "الفواتير المتأخرة"),
      overdueOutstanding: nullableMoney(finance.overdue_outstanding, "المتأخرات"),
      unknownDueDateInvoiceCount: nonNegativeInteger(finance.unknown_due_date_invoice_count, "فواتير دون تاريخ استحقاق"),
      unknownDueDateOutstanding: nullableMoney(finance.unknown_due_date_outstanding, "مبالغ دون تاريخ استحقاق"),
      invalidTotalAmountCount: nonNegativeInteger(finance.invalid_total_amount_count, "الإجماليات غير الصالحة"),
    })),
    topProducts: source.top_products.map((product) => ({
      itemCode: product.item_code,
      productName: text(product.product_name, "اسم الصنف"),
      quantity: nonNegative(product.quantity, "كمية الصنف"),
      sales: nullableMoney(product.sales, "قيمة مبيعات الصنف"),
      lastPurchasedAt: validDate(product.last_purchased_at, "آخر شراء للصنف"),
    })),
    recommendations: source.recommendations.map((recommendation) => ({
      priority: recommendation.priority,
      title: text(recommendation.title, "عنوان التوصية"),
      description: text(recommendation.description, "وصف التوصية"),
      action: text(recommendation.action, "إجراء التوصية"),
      currency: recommendation.currency ?? null,
      overdueInvoiceCount: recommendation.overdue_invoice_count ?? null,
      overdueOutstanding: recommendation.overdue_outstanding ?? null,
      pendingOrderCount: recommendation.pending_order_count ?? null,
      daysSinceLastOrder: recommendation.days_since_last_order ?? null,
      lastOrderAt: validDate(recommendation.last_order_at ?? null, "آخر طلب في التوصية"),
    })),
    interactions: (() => {
      if (interactions.length > 50) throw new Error("تجاوز سجل التواصل حد أحدث 50 إدخالًا في تقرير العميل.");
      return interactions.map((interaction) => {
        if (!["call","visit","whatsapp","email","meeting","note","other"].includes(interaction.interaction_type)) {
          throw new Error("نوع تواصل غير صالح في تقرير العميل.");
        }
        return {
          interactionType: interaction.interaction_type,
          subject: text(interaction.subject, "موضوع التواصل"),
          details: text(interaction.details, "تفاصيل التواصل"),
          interactionAt: validDate(interaction.interaction_at, "تاريخ التواصل")!,
          nextFollowUpAt: validDate(interaction.next_follow_up_at, "موعد متابعة التواصل"),
          createdAt: validDate(interaction.created_at, "تاريخ تسجيل التواصل")!,
          recordedByName: text(interaction.recorded_by_name, "مسجل التواصل"),
        };
      });
    })(),
  };
}
