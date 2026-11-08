import { BUSINESS_BRAND_NAME } from '@/lib/brand';
import type { InventoryStockCountLine, InventoryStockCountSession } from '@/lib/api';
import { xmlEscape, worksheetXml, zipStore, type CellValue } from '@/lib/onyx-export';

const STATUS_LABELS = {
  open: 'مفتوحة — بانتظار الاعتماد',
  completed: 'مكتملة',
  cancelled: 'ملغاة',
} as const;
const DETAIL_HEADERS = [
  'رمز الصنف', 'اسم الصنف', 'الوحدة', 'رصيد اللقطة', 'المحجوز وقت اللقطة',
  'العد الفعلي المحفوظ', 'الفرق المحفوظ', 'وقت حفظ العد', 'آخر حركة وقت اللقطة',
] as const;

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('حقل ' + label + ' غير صالح في ملف الجرد.');
  return value;
}
function requireDate(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('تاريخ ' + label + ' غير صالح في ملف الجرد.');
  return value;
}
function requireQuantity(value: unknown, label: string, allowNegative = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || (!allowNegative && value < 0)
      || Math.abs(value) > 999999999999.999 || !Number.isSafeInteger(Math.round(value * 1000))
      || Math.round(value * 1000) !== value * 1000) {
    throw new Error('كمية ' + label + ' غير صالحة في ملف الجرد.');
  }
  return value;
}
function validate(
  session: InventoryStockCountSession,
  lines: readonly InventoryStockCountLine[],
  warehouseName: string,
  exportedAt: string,
): { counted: number; uncounted: number } {
  if (!session || typeof session !== 'object') throw new Error('جلسة الجرد غير صالحة.');
  if (session.status !== 'open' && session.status !== 'completed' && session.status !== 'cancelled') {
    throw new Error('حالة جلسة الجرد غير معروفة.');
  }
  requireText(session.id, 'الجلسة');
  requireText(warehouseName, 'اسم المستودع');
  requireDate(session.started_at, 'بدء الجلسة');
  if (session.notes !== null && typeof session.notes !== 'string') throw new Error('ملاحظات الجلسة غير صالحة.');
  if (!Number.isSafeInteger(session.total_lines) || session.total_lines < 0 || session.total_lines > 100000) {
    throw new Error('عدد أصناف لقطة الجرد خارج الحدود.');
  }
  if (lines.length !== session.total_lines) throw new Error('عدد أسطر الجرد المحملة لا يطابق اللقطة؛ أوقف التصدير لمنع ملف جزئي.');
  if (!Number.isFinite(Date.parse(exportedAt))) throw new Error('وقت إنشاء ملف الجرد غير صالح.');
  const seen = new Set<string>();
  let counted = 0;
  for (const line of lines) {
    const id = requireText(line.product_id, 'الصنف');
    if (seen.has(id)) throw new Error('تكرر صنف في لقطة الجرد؛ أوقف التصدير.');
    seen.add(id);
    requireText(line.product_code, 'رمز الصنف');
    requireText(line.product_name, 'اسم الصنف');
    if (line.unit !== null && typeof line.unit !== 'string') throw new Error('وحدة الصنف غير صالحة.');
    requireQuantity(line.expected_quantity, 'رصيد اللقطة');
    requireQuantity(line.expected_reserved_quantity, 'المحجوز');
    if (line.counted_quantity !== null) { requireQuantity(line.counted_quantity, 'العد الفعلي'); counted += 1; }
    if (line.variance !== null) requireQuantity(line.variance, 'الفرق', true);
    requireDate(line.counted_at, 'حفظ العد');
    requireDate(line.expected_last_movement_at, 'آخر حركة');
  }
  if (!Number.isSafeInteger(session.counted_lines) || session.counted_lines < 0 || session.counted_lines > session.total_lines) {
    throw new Error('عدد الأسطر المعدودة في الجلسة غير صالح.');
  }
  if (counted !== session.counted_lines) {
    throw new Error('عدد العدود المحفوظة لا يطابق تفاصيل اللقطة؛ أوقف التصدير.');
  }
  return { counted, uncounted: lines.length - counted };
}
function packageFiles(
  summary: readonly (readonly CellValue[])[],
  details: readonly (readonly CellValue[])[],
  exportedAt: string,
): { name: string; content: string }[] {
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
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
    '<sheets><sheet name="ملخص الجرد" sheetId="1" r:id="rId1"/><sheet name="تفاصيل الجرد" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191029"/></workbook>';
  const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
    '</Relationships>';
  const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + xmlEscape(BUSINESS_BRAND_NAME + ' — ورقة الجرد الفعلي') + '</dc:title><dc:creator>' + xmlEscape(BUSINESS_BRAND_NAME) +
    '</dc:creator><dc:subject>Saved inventory stock-count snapshot</dc:subject><dcterms:created xsi:type="dcterms:W3CDTF">' +
    xmlEscape(exportedAt) + '</dcterms:created></cp:coreProperties>';
  const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<Application>' + xmlEscape(BUSINESS_BRAND_NAME) + '</Application><TitlesOfParts><vt:vector size="2" baseType="lpstr">' +
    '<vt:lpstr>ملخص الجرد</vt:lpstr><vt:lpstr>تفاصيل الجرد</vt:lpstr></vt:vector></TitlesOfParts></Properties>';
  return [
    {name:'[Content_Types].xml',content:contentTypes},
    {name:'_rels/.rels',content:rootRels},
    {name:'docProps/core.xml',content:core},
    {name:'docProps/app.xml',content:app},
    {name:'xl/workbook.xml',content:workbook},
    {name:'xl/_rels/workbook.xml.rels',content:workbookRels},
    {name:'xl/worksheets/sheet1.xml',content:worksheetXml(summary,false)},
    {name:'xl/worksheets/sheet2.xml',content:worksheetXml(details,true)},
  ];
}
export function buildStockCountWorkbookXlsx(
  session: InventoryStockCountSession,
  lines: readonly InventoryStockCountLine[],
  warehouseName: string,
  exportedAt = new Date().toISOString(),
): Uint8Array {
  const {counted,uncounted}=validate(session,lines,warehouseName,exportedAt);
  const summary: CellValue[][]=[
    ['المؤشر','القيمة'],
    ['اسم الملف',BUSINESS_BRAND_NAME+' — ورقة الجرد الفعلي'],
    ['المستودع',warehouseName],
    ['حالة الجلسة',STATUS_LABELS[session.status]],
    ['وقت بدء الجلسة',session.started_at],
    ['وقت إنشاء الملف',exportedAt],
    ['إجمالي أصناف اللقطة',session.total_lines],
    ['العدود المحفوظة',counted],
    ['أصناف لم يُحفظ عدّها',uncounted],
    ['ملاحظات الجلسة',session.notes],
    ['مصدر الكميات','رصيد ومحجوز اللقطة المحفوظان عند بداية الجلسة.'],
    ['مصدر العد والفرق','القيم المحفوظة في النظام فقط؛ التعديلات غير المحفوظة في الشاشة غير مدرجة.'],
    ['تنبيه الفروقات','الفرق الخالي يعني أنه غير مسجل؛ لم يُحوّل إلى صفر.'],
    ['الخصوصية','لا يتضمن الملف معرفات المؤسسة أو المستخدم أو سجل الجرد الداخلية، ولا أسعارًا أو تكاليف.'],
  ];
  const details: CellValue[][]=[
    [...DETAIL_HEADERS],
    ...lines.map(line=>[
      line.product_code,line.product_name,line.unit,
      requireQuantity(line.expected_quantity,'رصيد اللقطة'),
      requireQuantity(line.expected_reserved_quantity,'المحجوز'),
      line.counted_quantity===null?null:requireQuantity(line.counted_quantity,'العد الفعلي'),
      line.variance===null?null:requireQuantity(line.variance,'الفرق',true),
      line.counted_at,line.expected_last_movement_at,
    ]),
  ];
  return zipStore(packageFiles(summary,details,exportedAt));
}
export function downloadStockCountWorkbookXlsx(
  session: InventoryStockCountSession,
  lines: readonly InventoryStockCountLine[],
  warehouseName: string,
): boolean {
  if (typeof document==='undefined'||typeof URL.createObjectURL!=='function') return false;
  const bytes=buildStockCountWorkbookXlsx(session,lines,warehouseName);
  const blob=new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download='aghbari-stock-count-'+session.started_at.slice(0,10)+'.xlsx';
  anchor.hidden=true; document.body.appendChild(anchor);
  try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(url); }
  return true;
}
