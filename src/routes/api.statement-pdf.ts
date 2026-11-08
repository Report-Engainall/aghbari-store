import { createFileRoute } from "@tanstack/react-router";
import { buildCustomerStatementPdf } from "@/lib/finance-document-pdf";
import {
  financeDocumentError,
  getFinanceDocumentClient,
  loadArabicDocumentFont,
  pdfResponse,
} from "@/lib/finance-pdf-server";

type StatementRpcError = {
  code?: string;
  message: string;
};

function statementPdfRpcErrorResponse(error: StatementRpcError): Response {
  const permissionDenied =
    error.code === "42501" ||
    /authenticated|active customer|account is not linked/i.test(error.message);

  return financeDocumentError(
    permissionDenied ? 403 : 503,
    permissionDenied
      ? "هذا الحساب غير مخوّل للوصول إلى كشف الحساب."
      : "تعذر تحميل كشف الحساب لإنشاء المستند.",
  );
}

async function handleCustomerStatementPdfGet(request: Request): Promise<Response> {
  const auth = await getFinanceDocumentClient(request);
  if (auth.response) return auth.response;

  const { data, error } = await auth.client.rpc("get_customer_account_statement");
  if (error) return statementPdfRpcErrorResponse(error);

  try {
    const bytes = await buildCustomerStatementPdf(data, loadArabicDocumentFont());
    return pdfResponse(bytes, "aghbari-account-statement.pdf");
  } catch {
    return financeDocumentError(
      500,
      "تعذر إنشاء ملف PDF؛ لم تُعرض بيانات غير مكتملة كمستند ناجح.",
    );
  }
}

export const Route = createFileRoute("/api/statement-pdf")({
  server: {
    handlers: {
      GET: ({ request }) => handleCustomerStatementPdfGet(request),
    },
  },
});
