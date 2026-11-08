import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "@/lib/onyx-export";

export type CustomerReturnReviewXlsxLine = { item_code:string|null; product_name:string; unit:string|null; requested_quantity:number };
export type CustomerReturnReviewXlsxRequest = {
  id:string; request_number:string; status:"submitted"|"under_review";
  reason:"damaged"|"wrong_item"|"missing_item"|"quality"|"other"; notes:string|null;
  created_at:string; order_id:string; order_number:string; customer_name:string; customer_code:string;
  items:CustomerReturnReviewXlsxLine[];
};
export type CustomerReturnReviewXlsxInput = { rows:readonly CustomerReturnReviewXlsxRequest[]; roles:readonly string[]; exportedAt?:string };

const REVIEW_ROLES = new Set(["admin","manager"]);
const REASONS:Record<CustomerReturnReviewXlsxRequest["reason"],string> = {
  damaged:"الصنف تالف", wrong_item:"صنف غير صحيح", missing_item:"كمية ناقصة", quality:"مشكلة جودة", other:"سبب آخر",
};
const STATUSES:Record<CustomerReturnReviewXlsxRequest["status"],string> = {
  submitted:"مرسل للمراجعة", under_review:"قيد المراجعة",
};
function textValue(value:unknown,label:string,max=500):string {
  if(typeof value!=="string"||!value.trim()||value.length>max) throw new Error("حقل "+label+" غير صالح في تصدير مراجعة المرتجعات.");
  return value;
}
function optionalText(value:unknown,label:string,max=500):string|null {
  return value===null?null:textValue(value,label,max);
}
function timestamp(value:unknown):string {
  if(typeof value!=="string"||!value.includes("T")||!Number.isFinite(Date.parse(value))) throw new Error("تاريخ إنشاء طلب المرتجع غير صالح في ملف التصدير.");
  return value;
}
function quantity(value:unknown):number {
  if(typeof value!=="number"||!Number.isFinite(value)||value<=0) throw new Error("كمية صنف المرتجع غير صالحة في ملف التصدير.");
  const scaled=Math.round(value*1000);
  if(!Number.isSafeInteger(scaled)||scaled>999_999_999_999_999||Math.abs(value*1000-scaled)>1e-7) {
    throw new Error("كمية صنف المرتجع تتجاوز دقة التخزين المعتمدة (3 منازل عشرية).");
  }
  return scaled/1000;
}
function validate(input:CustomerReturnReviewXlsxInput) {
  if(!input||!Array.isArray(input.roles)||!input.roles.some(role=>REVIEW_ROLES.has(role))) {
    throw new Error("تصدير مراجعة المرتجعات متاح للمدير والمسؤول فقط.");
  }
  if(!Array.isArray(input.rows)||input.rows.length<1||input.rows.length>50) {
    throw new Error("قائمة المراجعة يجب أن تحتوي من طلب واحد إلى 50 طلباً أعادها الخادم.");
  }
  const ids=new Set<string>(),numbers=new Set<string>();
  const requests=input.rows.map((request: CustomerReturnReviewXlsxRequest)=>{
    if(!request||typeof request!=="object") throw new Error("سجل مراجعة مرتجع غير صالح.");
    const id=textValue(request.id,"مرجع الطلب",80),number=textValue(request.request_number,"رقم المرتجع",60);
    if(ids.has(id)||numbers.has(number)) throw new Error("تكرر مرجع طلب أو رقم مرتجع؛ أوقف التصدير.");
    ids.add(id);numbers.add(number);
    if(request.status!=="submitted"&&request.status!=="under_review") throw new Error("لا يجوز تصدير طلب خرج من قائمة المراجعة المفتوحة.");
    if(!Object.prototype.hasOwnProperty.call(REASONS,request.reason)) throw new Error("سبب مرتجع غير معتمد في ملف التصدير.");
    textValue(request.order_id,"مرجع الطلب الأصلي",80);
    textValue(request.order_number,"رقم الطلب الأصلي",60);
    textValue(request.customer_name,"اسم العميل",200);
    textValue(request.customer_code,"رمز العميل",60);
    timestamp(request.created_at);
    optionalText(request.notes,"ملاحظة العميل",2000);
    if(!Array.isArray(request.items)||request.items.length<1||request.items.length>100) throw new Error("عدد أصناف المرتجع يجب أن يكون من 1 إلى 100.");
    const items=request.items.map((line: CustomerReturnReviewXlsxLine)=>{
      if(!line||typeof line!=="object") throw new Error("تفصيل صنف المرتجع غير صالح.");
      optionalText(line.item_code,"رمز الصنف",80);
      textValue(line.product_name,"اسم الصنف",300);
      optionalText(line.unit,"وحدة الصنف",80);
      return { ...line, requested_quantity:quantity(line.requested_quantity) };
    });
    return { ...request, items };
  });
  return { requests, lines:requests.flatMap((request: CustomerReturnReviewXlsxRequest)=>request.items.map((line: CustomerReturnReviewXlsxLine)=>({request,line}))) };
}
function workbookXml(summaryRows:readonly (readonly CellValue[])[],detailRows:readonly (readonly CellValue[])[],createdAt:string):Uint8Array {
  const contentTypes='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
  const rootRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
  const book='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="طلبات المراجعة" sheetId="1" r:id="rId1"/><sheet name="أصناف المرتجعات" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191029"/></workbook>';
  const rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>';
  const core='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+'<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>'+xmlEscape(BUSINESS_BRAND_NAME+" — مراجعة طلبات المرتجعات")+'</dc:title><dc:creator>'+xmlEscape(BUSINESS_BRAND_NAME)+'</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">'+xmlEscape(createdAt)+'</dcterms:created></cp:coreProperties>';
  const app='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+'<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>'+xmlEscape(BUSINESS_BRAND_NAME)+'</Application><TitlesOfParts><vt:vector size="2" baseType="lpstr"><vt:lpstr>طلبات المراجعة</vt:lpstr><vt:lpstr>أصناف المرتجعات</vt:lpstr></vt:vector></TitlesOfParts></Properties>';
  return zipStore([
    {name:"[Content_Types].xml",content:contentTypes},{name:"_rels/.rels",content:rootRels},
    {name:"docProps/core.xml",content:core},{name:"docProps/app.xml",content:app},
    {name:"xl/workbook.xml",content:book},{name:"xl/_rels/workbook.xml.rels",content:rels},
    {name:"xl/worksheets/sheet1.xml",content:worksheetXml(summaryRows,true)},
    {name:"xl/worksheets/sheet2.xml",content:worksheetXml(detailRows,true)},
  ]);
}
/** Current open manager queue only (server limit 50), never a full historical return export. */
export function buildCustomerReturnReviewWorkbookXlsx(input:CustomerReturnReviewXlsxInput):Uint8Array {
  if(!input||!Array.isArray(input.roles)||!input.roles.some(role=>REVIEW_ROLES.has(role))) throw new Error("تصدير مراجعة المرتجعات متاح للمدير والمسؤول فقط.");
  const createdAt=input.exportedAt??new Date().toISOString();
  if(typeof createdAt!=="string"||!createdAt.includes("T")||!Number.isFinite(Date.parse(createdAt))) throw new Error("وقت إنشاء ملف مراجعة المرتجعات غير صالح.");
  const {requests,lines}=validate(input);
  const summary:CellValue[][]=[
    ["المؤشر","القيمة"],["اسم التقرير",BUSINESS_BRAND_NAME+" — مراجعة طلبات المرتجعات"],
    ["وقت إنشاء الملف UTC",createdAt],["نطاق التقرير","طلبات المراجعة المفتوحة التي أعادها الخادم في القراءة الحالية فقط"],
    ["الحد الأقصى لقراءة الخادم",50],["عدد الطلبات المصدرة",requests.length],["عدد تفاصيل الأصناف",lines.length],
    ["حدود التقرير","لقطة لقائمة المراجعة الحالية (حتى 50 طلباً)، وليست سجلاً تاريخياً كاملاً. ملاحظات العميل والمعرفات التقنية غير مضمنة."],[],
    ["رقم المرتجع","رقم الطلب","اسم العميل","رمز العميل","الحالة","سبب المرتجع","وقت إنشاء الطلب","عدد الأصناف"],
    ...requests.map(request=>[request.request_number,request.order_number,request.customer_name,request.customer_code,STATUSES[request.status],REASONS[request.reason],request.created_at,request.items.length]),
  ];
  const details:CellValue[][]=[
    ["رقم المرتجع","رقم الطلب","اسم العميل","رمز العميل","رمز الصنف","اسم الصنف","الوحدة","الكمية المطلوبة"],
    ...lines.map(({request,line})=>[request.request_number,request.order_number,request.customer_name,request.customer_code,line.item_code,line.product_name,line.unit,line.requested_quantity]),
  ];
  return workbookXml(summary,details,createdAt);
}
export function downloadCustomerReturnReviewWorkbookXlsx(input:CustomerReturnReviewXlsxInput):boolean {
  if(typeof document==="undefined"||typeof URL.createObjectURL!=="function") return false;
  const bytes=buildCustomerReturnReviewWorkbookXlsx(input);
  const blob=new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url=URL.createObjectURL(blob),anchor=document.createElement("a");
  anchor.href=url;
  anchor.download="aghbari-customer-return-review-"+(input.exportedAt??new Date().toISOString()).slice(0,10)+".xlsx";
  anchor.hidden=true;document.body.appendChild(anchor);
  try{anchor.click();}finally{anchor.remove();URL.revokeObjectURL(url);}
  return true;
}

