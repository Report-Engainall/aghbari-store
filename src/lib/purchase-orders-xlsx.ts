import { BUSINESS_BRAND_NAME } from '@/lib/brand';
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus } from '@/lib/purchase-orders';
import { xmlEscape, worksheetXml, zipStore, type CellValue } from '@/lib/onyx-export';

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'مسودة',
  submitted: 'معتمد للتوريد',
  partially_received: 'استلام جزئي',
  received: 'مستلم بالكامل',
  cancelled: 'ملغى',
};

const ORDER_HEADERS = [
  'رقم أمر الشراء', 'المورد', 'رمز المورد', 'المخزن المستلم', 'الحالة',
  'تاريخ الإنشاء', 'تاريخ الاعتماد', 'إجمالي التكلفة المسجلة', 'ملاحظات',
] as const;

const LINE_HEADERS = [
  'رقم أمر الشراء', 'كود الصنف', 'اسم الصنف', 'الوحدة', 'الكمية المطلوبة',
  'الكمية المستلمة', 'الكمية المتبقية', 'تكلفة الوحدة', 'قيمة البند', 'حالة أمر الشراء',
] as const;

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('تعذر تصدير أوامر الشراء: الحقل ' + label + ' مفقود.');
  }
  return value;
}

function requireOptionalMoney(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER / 100) {
    throw new Error('تعذر تصدير أوامر الشراء: قيمة ' + label + ' غير صالحة.');
  }
  return value;
}

function requireQuantity(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 999999999999.999) {
    throw new Error('تعذر تصدير أوامر الشراء: كمية ' + label + ' غير صالحة.');
  }
  return value;
}

function validateOrders(orders: readonly PurchaseOrder[], filterLabel: string): void {
  if (!Array.isArray(orders) || orders.length === 0) {
    throw new Error('لا توجد أوامر شراء ظاهرة لتصديرها.');
  }
  if (orders.length > 1_000_000) {
    throw new Error('عدد أوامر الشراء يتجاوز حد Excel؛ لم يتم إنشاء ملف جزئي.');
  }
  if (typeof filterLabel !== 'string' || !filterLabel.trim()) {
    throw new Error('فلتر التصدير غير محدد.');
  }
  const orderIds = new Set<string>();
  let lineCount = 0;
  for (const order of orders) {
    const id = requireText(order.id, 'معرّف الأمر');
    if (orderIds.has(id)) throw new Error('توجد أوامر مكررة في نتيجة التصدير؛ أوقف التصدير.');
    orderIds.add(id);
    requireText(order.purchase_order_number, 'رقم الأمر');
    requireText(order.supplier_name, 'اسم المورد');
    requireText(order.supplier_code, 'رمز المورد');
    requireText(order.warehouse_name, 'اسم المخزن');
    if (!(order.status in STATUS_LABELS)) throw new Error('حالة أمر شراء غير معروفة؛ أوقف التصدير.');
    if (!Number.isFinite(Date.parse(requireText(order.created_at, 'تاريخ الإنشاء')))) {
      throw new Error('تاريخ إنشاء أمر الشراء غير صالح؛ أوقف التصدير.');
    }
    requireOptionalMoney(order.total_cost, 'إجمالي التكلفة');
    if (!Array.isArray(order.items)) throw new Error('قائمة بنود أمر الشراء غير صالحة.');
    lineCount += order.items.length;
    if (lineCount > 1_000_000) throw new Error('عدد بنود الشراء يتجاوز حد Excel؛ لم يتم إنشاء ملف جزئي.');
    for (const item of order.items) {
      requireText(item.id, 'معرّف البند');
      requireText(item.item_code, 'كود الصنف');
      requireText(item.product_name, 'اسم الصنف');
      const ordered = requireQuantity(item.quantity_ordered, 'المطلوبة');
      const received = requireQuantity(item.quantity_received, 'المستلمة');
      const remaining = requireQuantity(item.remaining_quantity, 'المتبقية');
      if (received > ordered || Math.abs(ordered - received - remaining) > 0.0005) {
        throw new Error('كميات بند أمر الشراء غير متسقة؛ أوقف التصدير.');
      }
      requireOptionalMoney(item.unit_cost, 'تكلفة الوحدة');
      requireOptionalMoney(item.line_total, 'قيمة البند');
    }
  }
}

function buildPackage(
  summary: readonly (readonly CellValue[])[],
  orderRows: readonly (readonly CellValue[])[],
  lineRows: readonly (readonly CellValue[])[],
  exportedAt: string,
): Uint8Array {
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';
  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';
  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="ملخص التصدير" sheetId="1" r:id="rId1"/>' +
    '<sheet name="أوامر الشراء" sheetId="2" r:id="rId2"/>' +
    '<sheet name="بنود الشراء" sheetId="3" r:id="rId3"/></sheets><calcPr calcId="191029"/></workbook>';
  const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>' +
    '</Relationships>';
  const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + xmlEscape(BUSINESS_BRAND_NAME + ' — تصدير أوامر الشراء') + '</dc:title>' +
    '<dc:creator>' + xmlEscape(BUSINESS_BRAND_NAME) + '</dc:creator>' +
    '<dc:subject>Filtered purchase orders</dc:subject>' +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + xmlEscape(exportedAt) + '</dcterms:created></cp:coreProperties>';
  const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<Application>' + xmlEscape(BUSINESS_BRAND_NAME) + '</Application><TitlesOfParts><vt:vector size="3" baseType="lpstr">' +
    '<vt:lpstr>ملخص التصدير</vt:lpstr><vt:lpstr>أوامر الشراء</vt:lpstr><vt:lpstr>بنود الشراء</vt:lpstr></vt:vector></TitlesOfParts></Properties>';
  return zipStore([
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: rootRels },
    { name: 'docProps/core.xml', content: core },
    { name: 'docProps/app.xml', content: app },
    { name: 'xl/workbook.xml', content: workbook },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRels },
    { name: 'xl/worksheets/sheet1.xml', content: worksheetXml(summary, false) },
    { name: 'xl/worksheets/sheet2.xml', content: worksheetXml(orderRows, true) },
    { name: 'xl/worksheets/sheet3.xml', content: worksheetXml(lineRows, true) },
  ]);
}

export function buildPurchaseOrdersWorkbookXlsx(
  orders: readonly PurchaseOrder[],
  filterLabel: string,
): Uint8Array {
  validateOrders(orders, filterLabel);
  const exportedAt = new Date().toISOString();
  const statusCounts: CellValue[][] = (Object.keys(STATUS_LABELS) as PurchaseOrderStatus[]).map((status) => [
    STATUS_LABELS[status],
    orders.filter((order) => order.status === status).length,
  ]);
  const lineCount = orders.reduce((sum, order) => sum + order.items.length, 0);
  const summary: CellValue[][] = [
    ['المؤشر', 'القيمة'],
    ['اسم الملف', BUSINESS_BRAND_NAME + ' — أوامر الشراء'],
    ['وقت إنشاء الملف', exportedAt],
    ['فلتر الحالة المطبق', filterLabel],
    ['عدد الأوامر المصدرة', orders.length],
    ['عدد البنود المصدرة', lineCount],
    ...statusCounts,
    ['نطاق البيانات', 'هذه النتائج الظاهرة بعد تطبيق فلتر الحالة على السجلات المحمّلة في الشاشة؛ لا تدّعي اكتمال أوامر لم تُحمّل.'],
    ['التكلفة المجهولة', 'الخانة الفارغة تعني أن التكلفة غير مسجلة؛ لم تُحوّل إلى صفر.'],
    ['صيغة الأكواد', 'أكواد الأصناف وأرقام الأعمال محفوظة كنصوص، بما فيها الأصفار البادئة.'],
    ['الخصوصية', 'يضم الملف تكاليف الشراء المسموح بها لمدير النظام أو المدير فقط؛ لا يضم معرّفات المؤسسة أو المستخدمين الداخلية.'],
  ];
  const orderRows: CellValue[][] = [
    [...ORDER_HEADERS],
    ...orders.map((order) => [
      order.purchase_order_number,
      order.supplier_name,
      order.supplier_code,
      order.warehouse_name,
      STATUS_LABELS[order.status],
      order.created_at,
      order.submitted_at,
      requireOptionalMoney(order.total_cost, 'إجمالي التكلفة'),
      order.notes,
    ]),
  ];
  const lineRows: CellValue[][] = [
    [...LINE_HEADERS],
    ...orders.flatMap((order) => order.items.map((item: PurchaseOrderItem) => [
      order.purchase_order_number,
      item.item_code,
      item.product_name,
      item.unit,
      requireQuantity(item.quantity_ordered, 'المطلوبة'),
      requireQuantity(item.quantity_received, 'المستلمة'),
      requireQuantity(item.remaining_quantity, 'المتبقية'),
      requireOptionalMoney(item.unit_cost, 'تكلفة الوحدة'),
      requireOptionalMoney(item.line_total, 'قيمة البند'),
      STATUS_LABELS[order.status],
    ])),
  ];
  return buildPackage(summary, orderRows, lineRows, exportedAt);
}

export function downloadPurchaseOrdersWorkbookXlsx(
  orders: readonly PurchaseOrder[],
  filterLabel: string,
): boolean {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
  const bytes = buildPurchaseOrdersWorkbookXlsx(orders, filterLabel);
  const blob = new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'aghbari-purchase-orders-' + new Date().toISOString().slice(0, 10) + '.xlsx';
  anchor.hidden = true;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
  return true;
}
