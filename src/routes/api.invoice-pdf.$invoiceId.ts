import { createFileRoute } from "@tanstack/react-router";
import { buildCustomerInvoicePdf } from "@/lib/finance-document-pdf";
import {
  financeDocumentError,
  getFinanceDocumentClient,
  loadArabicDocumentFont,
  pdfResponse,
} from "@/lib/finance-pdf-server";

import { parseCustomerInvoicePdfPayload } from "@/lib/customer-invoice-pdf-contract";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invoicePdfRpcErrorResponse(code: string | undefined): Response {
  if (code === "42501") {
    return financeDocumentError(403, "هذا الحساب غير مخوّل لتنزيل هذه الفاتورة.");
  }
  if (code === "P0002") {
    return financeDocumentError(404, "الفاتورة غير موجودة أو غير متاحة لهذا الحساب.");
  }
  return financeDocumentError(503, "تعذر تحميل بيانات الفاتورة المعتمدة.");
}

async function handleCustomerInvoicePdfGet(request: Request, invoiceId: string): Promise<Response> {
  const auth = await getFinanceDocumentClient(request);
  if (auth.response) return auth.response;

  if (!UUID_PATTERN.test(invoiceId)) {
    return financeDocumentError(400, "معرّف الفاتورة غير صالح.");
  }

  // The RPC derives customer, tenant and invoice-read capability from auth.uid().
  // Financial columns are returned only for this customer's requested invoice.
  const invoicePdfResult = await auth.client.rpc("get_customer_invoice_pdf", {
    p_invoice_id: invoiceId,
  });
  if (invoicePdfResult.error) {
    return invoicePdfRpcErrorResponse(invoicePdfResult.error.code);
  }

  const payload = parseCustomerInvoicePdfPayload(invoicePdfResult.data);
  if (!payload) {
    return financeDocumentError(503, "أعاد الخادم بيانات فاتورة غير مكتملة؛ لم يتم إنشاء المستند.");
  }

  try {
    const bytes = await buildCustomerInvoicePdf(
      payload.invoice,
      payload.lines,
      payload.customer,
      loadArabicDocumentFont(),
      undefined,
      payload.financial_details_visible,
      payload.customer_tier_visible,
    );
    return pdfResponse(bytes, "aghbari-invoice.pdf");
  } catch {
    return financeDocumentError(
      500,
      "تعذر إنشاء ملف الفاتورة؛ لم تُعرض بيانات غير مكتملة كمستند ناجح.",
    );
  }
}

export const Route = createFileRoute("/api/invoice-pdf/$invoiceId")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        handleCustomerInvoicePdfGet(request, params.invoiceId),
    },
  },
});
