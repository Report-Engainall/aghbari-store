import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import {
  acceptOperationalShiftHandover,
  captureOperationalShiftSnapshot,
  startOperationalShift,
  fetchOperationalShiftHandoverAcceptance,
  recordOperationalShiftCashCount,
  recordOperationalShiftHandover,
} from "@/lib/intelligence/shift-operations-client";
import type {
  ShiftOperationsCenterResult,
  ShiftOperationalCheck,
  ShiftQueueItem,
  ShiftCashControlResult,
  ShiftItemState,
  ShiftItemSeverity,
} from "@/lib/intelligence/shift-operations";
import {
  EvidenceReferences,
  EvidenceStatusLabel,
  EvidenceWarnings,
  IntelligenceStatePanel,
  formatEvidenceNumber,
  type IntelligenceViewState,
} from "./shared";

export interface ShiftOperationsCenterProps {
  result?: ShiftOperationsCenterResult | null;
  state?: IntelligenceViewState;
  onRetry?: () => void;
  onOpenItem?: (sourceKey: ShiftQueueItem["sourceKey"], sourceRef: string) => void;
}

const checkLabels = {
  CLEAR: "مكتمل", ACTION_REQUIRED: "يتطلب إجراء", UNKNOWN: "غير متحقق", NOT_APPLICABLE: "لا ينطبق",
} as const;
const itemLabels: Record<ShiftItemState,string> = {
  OPEN: "مفتوح", IN_PROGRESS: "قيد المعالجة", BLOCKED: "متعثر", RESOLVED: "تمت المعالجة", UNKNOWN: "غير متحقق",
};
const severityLabels: Record<ShiftItemSeverity,string> = {
  CRITICAL: "حرج", WARNING: "تنبيه", INFO: "معلومة",
};
const sourceLabels: Record<ShiftQueueItem["sourceKey"],string> = {
  CONNECTIVITY:"الاتصال والمزامنة",TASKS:"المهام",ORDERS:"الطلبات",INVOICES:"الفواتير",
  RECEIPTS:"الاستلامات",PAYMENTS:"المدفوعات",CASH:"الصندوق",MOVEMENTS:"حركات المخزون",
  DELIVERIES:"التوصيل",INVENTORY:"المخزون",REMINDERS:"التذكيرات",HANDOVER:"التسليم بين الورديات",
};
const cashStates = {
  MATCHED:"مطابق",VARIANCE:"فرق يحتاج مراجعة",NOT_RECORDED:"لم يسجل العد",NOT_APPLICABLE:"لا ينطبق",UNKNOWN:"المصدر غير متحقق",
};
const formatNumber=(value:number|null)=>value===null?"غير متاح":new Intl.NumberFormat("ar-YE",{maximumFractionDigits:2}).format(value);
const amount=(value:number|null,currency:string)=>value===null?"غير متاح":formatNumber(value)+" "+currency;

function StateChip({state}:{state:ShiftOperationalCheck["state"]}){
  return <span className="rounded-full border px-2 py-1 text-xs">{checkLabels[state]}</span>;
}

function CheckCard({item}:{item:ShiftOperationalCheck}){
  return <article className="rounded-lg border p-3 space-y-2">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-sm font-semibold">{item.title}</h4>
      <StateChip state={item.state}/>
    </header>
    <p className="text-sm text-muted-foreground">{item.message}</p>
    {item.count!==null?<p className="text-xs">عدد السجلات في المصدر الكامل: {formatNumber(item.count)}</p>:null}
    {item.relatedItems.length?(
      <ul className="space-y-2">
        {item.relatedItems.map(row=><li key={row.id} className="rounded-md border p-2 text-sm">
          <p className="font-medium">{row.title}</p>
          {row.summary?<p className="text-xs text-muted-foreground">{row.summary}</p>:null}
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            <span>{itemLabels[row.state]}</span><span>{severityLabels[row.severity]}</span>
            {row.ownerProfileId?<span>مسؤول معيّن</span>:<span>لم يعيّن مسؤول</span>}
            {row.dueAt?<span>الاستحقاق: {row.dueAt}</span>:null}
          </div>
          {row.amount!==null&&row.currency?<p className="mt-1 font-semibold">{amount(row.amount,row.currency)}</p>:null}
          <p className="mt-1 text-xs">الإثبات: <EvidenceReferences ids={row.evidenceIds}/></p>
        </li>)}
      </ul>
    ):null}
    {item.evidenceIds.length?<p className="text-xs">مرجع المصدر: <EvidenceReferences ids={item.evidenceIds}/></p>:null}
  </article>;
}

function QueueItemCard({item,onOpenItem}:{item:ShiftQueueItem;onOpenItem?:ShiftOperationsCenterProps["onOpenItem"]}){
  return <article className="rounded-lg border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-semibold">{item.title}</p>
      <span className="text-xs">{itemLabels[item.state]} · {severityLabels[item.severity]}</span>
    </div>
    {item.summary?<p className="mt-1 text-sm text-muted-foreground">{item.summary}</p>:null}
    <div className="mt-2 flex flex-wrap gap-2 text-xs">
      <span>{sourceLabels[item.sourceKey]}</span>
      {item.ownerProfileId?<span>مسؤول معيّن</span>:<span>لا يوجد تعيين موثق</span>}
      {item.dueAt?<span>الاستحقاق: {item.dueAt}</span>:null}
      {item.amount!==null&&item.currency?<strong>{amount(item.amount,item.currency)}</strong>:null}
    </div>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs">الدليل: <EvidenceReferences ids={item.evidenceIds}/></span>
      {onOpenItem&&item.state!=="UNKNOWN"?(
        <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={()=>onOpenItem(item.sourceKey,item.sourceRef)}>
          فتح السجل
        </button>
      ):null}
    </div>
  </article>;
}

function CashCard({item}:{item:ShiftCashControlResult}){
  const rows=[
    ["العهدة المتوقعة",item.opening.expected],
    ["العد الفعلي",item.opening.counted],
    ["الفرق",item.opening.variance],
  ] as const;
  const closing=[
    ["المتوقع للإقفال",item.closing.expected],
    ["العد عند الإقفال",item.closing.counted],
    ["الفرق",item.closing.variance],
  ] as const;
  return <article className="rounded-lg border p-3">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="font-semibold">{item.currency}</h4>
      <span className="text-xs">مصدر النقد حتى {item.sourceAsOf}</span>
    </header>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <section className="rounded-md border p-3">
        <h5 className="text-sm font-semibold">افتتاح الصندوق</h5>
        <p className="text-xs">{cashStates[item.opening.state]}</p>
        <dl className="mt-2 space-y-1 text-sm">
          {rows.map(([label,value])=><div key={label} className="flex justify-between gap-2"><dt>{label}</dt><dd className="font-medium">{amount(value,item.currency)}</dd></div>)}
        </dl>
      </section>
      <section className="rounded-md border p-3">
        <h5 className="text-sm font-semibold">إقفال الصندوق</h5>
        <p className="text-xs">{cashStates[item.closing.state]}</p>
        <dl className="mt-2 space-y-1 text-sm">
          {closing.map(([label,value])=><div key={label} className="flex justify-between gap-2"><dt>{label}</dt><dd className="font-medium">{amount(value,item.currency)}</dd></div>)}
        </dl>
      </section>
    </div>
    <p className="mt-2 text-xs">الإثبات: <EvidenceReferences ids={item.evidenceIds}/></p>
  </article>;
}

const SOURCE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ShiftOperationsCenter({
  result=null,state="ready",onRetry,onOpenItem,
}:ShiftOperationsCenterProps){
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const manager = roles.includes("admin") || roles.includes("manager");
  const canRecordCash = manager || roles.includes("accountant");
  const canCaptureSnapshot = Boolean(user?.isStaff || canRecordCash);
  const isOutgoingOwner = Boolean(user?.profileId && result?.handover.outgoingOwnerProfileId === user.profileId);
  const isIncomingOwner = Boolean(user?.profileId && result?.handover.incomingOwnerProfileId === user.profileId);
  const [commandBusy,setCommandBusy] = useState<string|null>(null);
  const [startShiftKey,setStartShiftKey] = useState<string|null>(null);
  const [startShiftLabel,setStartShiftLabel] = useState("");
  const [startShiftDate,setStartShiftDate] = useState(result?.businessDate??"");
  const [cashCountKey,setCashCountKey] = useState<string|null>(null);
  const [handoverRecordKey,setHandoverRecordKey] = useState<string|null>(null);
  const [handoverAcceptKey,setHandoverAcceptKey] = useState<string|null>(null);
  const [snapshotKeys,setSnapshotKeys] = useState<{OPENING:string|null;CLOSEOUT:string|null}>({OPENING:null,CLOSEOUT:null});
  const [commandError,setCommandError] = useState<string|null>(null);
  const [commandNotice,setCommandNotice] = useState<string|null>(null);
  const [cashPhase,setCashPhase] = useState<"OPENING"|"CLOSING">("OPENING");
  const [cashCurrency,setCashCurrency] = useState("");
  const [cashAmount,setCashAmount] = useState("");
  const [cashNote,setCashNote] = useState("");
  const [cashCorrectionReason,setCashCorrectionReason] = useState("");
  const [handoverReason,setHandoverReason] = useState("");
  const [handoverNote,setHandoverNote] = useState("");
  const [selectedHandoverRefs,setSelectedHandoverRefs] = useState<string[]>([]);
  const [handoverLookup,setHandoverLookup] = useState<{handoverId:string|null;acceptedAt:string|null}|null>(null);
  const [handoverLookupLoading,setHandoverLookupLoading] = useState(false);
  const effective=state==="ready"&&!result?"unavailable":state;

  useEffect(()=>{
    setCommandError(null);
    setCommandNotice(null);
    setStartShiftKey(null);
    setStartShiftLabel("");
    setStartShiftDate(result?.businessDate??"");
    setCashCountKey(null);
    setHandoverRecordKey(null);
    setHandoverAcceptKey(null);
    setSnapshotKeys({OPENING:null,CLOSEOUT:null});
    setHandoverLookup(null);
    setSelectedHandoverRefs([]);
    setHandoverReason("");
    setHandoverNote("");
    setCashAmount("");
    setCashNote("");
    setCashCorrectionReason("");
    setCashCurrency(result?.cashControls[0]?.currency??"");
  },[result?.shiftId]);

  useEffect(()=>{
    let active=true;
    if(!result || !isIncomingOwner || !result.handover.recordedAt || result.handover.acceptedAt){
      setHandoverLookup(null);
      setHandoverLookupLoading(false);
      return;
    }
    setHandoverLookupLoading(true);
    void fetchOperationalShiftHandoverAcceptance(result.shiftId).then(response=>{
      if(!active)return;
      if(response.ok){
        setHandoverLookup({handoverId:response.data.handoverId,acceptedAt:response.data.acceptedAt});
      }else{
        setHandoverLookup(null);
        setCommandError(response.message);
      }
    }).catch(()=>{
      if(active)setCommandError("تعذر تحميل مرجع قبول التسليم من الخادم.");
    }).finally(()=>{
      if(active)setHandoverLookupLoading(false);
    });
    return ()=>{active=false;};
  },[result?.shiftId,result?.handover.recordedAt,result?.handover.acceptedAt,isIncomingOwner]);

  async function startNextShift(event: FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!result || commandBusy)return;
    if(startShiftLabel.trim().length<2 || !/^\d{4}-\d{2}-\d{2}$/.test(startShiftDate)){
      setCommandError("أدخل اسم وردية صالحاً وتاريخ عمل صحيحاً.");
      return;
    }
    const idempotencyKey=startShiftKey??crypto.randomUUID();
    if(!startShiftKey)setStartShiftKey(idempotencyKey);
    setCommandBusy("start-shift");
    setCommandError(null);
    setCommandNotice(null);
    try{
      const response=await startOperationalShift({
        businessDate:startShiftDate,shiftLabel:startShiftLabel.trim(),
        timeZone:result.organizationTimeZone,previousShiftId:result.shiftId,idempotencyKey,
      });
      if(!response.ok){setCommandError(response.message);return;}
      setStartShiftKey(null);
      setCommandNotice("أكد الخادم بدء الوردية الجديدة "+response.data.shiftLabel+
        " وربطها بالوردية السابقة. أعد تحميل المركز لعرض سجل الوردية الجديدة.");
      onRetry?.();
    }catch{
      setCommandError("تعذر بدء الوردية؛ لم يُعرض نجاح محلي.");
    }finally{setCommandBusy(null);}
  }

  async function saveCashCount(event: FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!result || commandBusy)return;
    const parsedAmount=Number(cashAmount);
    if(!cashCurrency || !cashAmount.trim() || !Number.isFinite(parsedAmount) || parsedAmount<0){
      setCommandError("اختر عملة مسجلة وأدخل مبلغ العد الفعلي الصحيح.");
      return;
    }
    const idempotencyKey=cashCountKey??crypto.randomUUID();
    if(!cashCountKey)setCashCountKey(idempotencyKey);
    setCommandBusy("cash");
    setCommandError(null);
    setCommandNotice(null);
    try{
      const response=await recordOperationalShiftCashCount({
        shiftId:result.shiftId,phase:cashPhase,currency:cashCurrency,
        countedAmount:parsedAmount,note:cashNote,
        correctionReason:cashCorrectionReason,idempotencyKey,
      });
      if(!response.ok){setCommandError(response.message);return;}
      setCashCountKey(null);
      setCashAmount("");
      setCashNote("");
      setCashCorrectionReason("");
      setCommandNotice("أكد الخادم حفظ العد الفعلي بصفته نسخة "+String(response.data.version??1)+
        (response.data.idempotentReplay?" (إعادة إرسال مطابقة).":"."));
      onRetry?.();
    }catch{
      setCommandError("تعذر تسجيل العد النقدي؛ لم يُعرض نجاح محلي.");
    }finally{setCommandBusy(null);}
  }

  async function saveHandover(event: FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!result || commandBusy)return;
    const refs=[...new Set(selectedHandoverRefs)];
    if(handoverReason.trim().length<5 || refs.length>200){
      setCommandError("اكتب سبباً واضحاً من خمسة أحرف على الأقل، واختر حتى 200 مرجع مفتوح.");
      return;
    }
    const idempotencyKey=handoverRecordKey??crypto.randomUUID();
    if(!handoverRecordKey)setHandoverRecordKey(idempotencyKey);
    setCommandBusy("handover");
    setCommandError(null);
    setCommandNotice(null);
    try{
      const response=await recordOperationalShiftHandover({
        currentShiftId:result.shiftId,openItemRefs:refs,
        reason:handoverReason.trim(),note:handoverNote.trim()||undefined,idempotencyKey,
      });
      if(!response.ok){setCommandError(response.message);return;}
      setHandoverRecordKey(null);
      setCommandNotice("أكد الخادم تسجيل محضر التسليم. ينتظر قبول المستلم المعيّن.");
      onRetry?.();
    }catch{
      setCommandError("تعذر تسجيل محضر التسليم؛ لم يُعرض نجاح محلي.");
    }finally{setCommandBusy(null);}
  }

  async function acceptHandover(){
    if(!handoverLookup?.handoverId || commandBusy)return;
    const idempotencyKey=handoverAcceptKey??crypto.randomUUID();
    if(!handoverAcceptKey)setHandoverAcceptKey(idempotencyKey);
    setCommandBusy("accept-handover");
    setCommandError(null);
    setCommandNotice(null);
    try{
      const response=await acceptOperationalShiftHandover(handoverLookup.handoverId,idempotencyKey);
      if(!response.ok){setCommandError(response.message);return;}
      setHandoverAcceptKey(null);
      setHandoverLookup({handoverId:response.data.handoverId??handoverLookup.handoverId,acceptedAt:response.data.acceptedAt??new Date().toISOString()});
      setCommandNotice(response.data.idempotentReplay
        ?"التسليم مقبول مسبقاً؛ أكد الخادم أن إعادة الإرسال مطابقة."
        :"أكد الخادم قبولك للتسليم وسُجل الحدث في سجل الوردية.");
      onRetry?.();
    }catch{
      setCommandError("تعذر قبول التسليم؛ لم يتغير عرضه محلياً.");
    }finally{setCommandBusy(null);}
  }

  async function captureShiftSnapshot(snapshotKind:"OPENING"|"CLOSEOUT"){
    if(!result || commandBusy)return;
    const idempotencyKey=snapshotKeys[snapshotKind]??crypto.randomUUID();
    if(!snapshotKeys[snapshotKind])setSnapshotKeys(current=>({...current,[snapshotKind]:idempotencyKey}));
    setCommandBusy(snapshotKind);
    setCommandError(null);
    setCommandNotice(null);
    try{
      const response=await captureOperationalShiftSnapshot({shiftId:result.shiftId,snapshotKind,idempotencyKey});
      if(!response.ok){setCommandError(response.message);return;}
      setSnapshotKeys(current=>({...current,[snapshotKind]:null}));
      setCommandNotice("أكد الخادم حفظ لقطة "+(snapshotKind==="OPENING"?"الافتتاح":"الإقفال التشغيلي")+
        " رقم "+String(response.data.version??1)+" بتاريخ "+String(response.data.recordedAt??"غير متاح")+".");
      onRetry?.();
    }catch{
      setCommandError("تعذر حفظ لقطة الوردية؛ لم يُعرض نجاح محلي.");
    }finally{setCommandBusy(null);}
  }
  if(effective!=="ready") return <IntelligenceStatePanel state={effective} onRetry={onRetry} errorMessage="تعذر تحميل مركز الوردية." />;
  if(!result) return <IntelligenceStatePanel state="unavailable" unavailableMessage="بيانات الوردية غير متاحة؛ لم يتم توليد قوائم أو أرصدة افتراضية." />;
  const openingLabel=result.openingReadiness==="READY"?"جاهز للاستلام":result.openingReadiness==="ATTENTION"?"توجد عناصر تحتاج معالجة":"مصادر الافتتاح غير مكتملة";
  const closeLabel=result.operationalClose==="COMPLETE"?"قائمة الإقفال التشغيلية مكتملة":result.operationalClose==="PARTIAL"?"الإقفال التشغيلي جزئي":"مصادر الإقفال غير مكتملة";
  const financialLabel=result.financialClose.state==="ELIGIBLE"?"مؤهل لمراجعة الإقفال":result.financialClose.state==="BLOCKED"?"الإقفال المالي محجوب":result.financialClose.state==="NOT_RECORDED"?"لم يسجل الإقفال":"المصالحة المالية غير متاحة";
  return <section dir="rtl" className="space-y-4 rounded-xl border p-4" aria-label="مركز إقفال اليوم وبدء الوردية">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">مركز إقفال اليوم وبدء الوردية</h2>
        <p className="text-xs text-muted-foreground">{result.shiftLabel} · {result.businessDate} · {result.organizationTimeZone}</p>
        <p className="text-xs text-muted-foreground">آخر قراءة للمصادر: {result.asOf} · تم إنشاء العرض: {result.generatedAt}</p>
      </div>
      <div className="flex flex-wrap gap-2 print:hidden">
        {canCaptureSnapshot?<>
          <button type="button" className="rounded-lg border px-3 py-2 text-sm" disabled={commandBusy!==null} onClick={()=>void captureShiftSnapshot("OPENING")}>
            {commandBusy==="OPENING"?"جارٍ حفظ لقطة الافتتاح…":"حفظ لقطة الافتتاح"}
          </button>
          <button type="button" className="rounded-lg border px-3 py-2 text-sm" disabled={commandBusy!==null} onClick={()=>void captureShiftSnapshot("CLOSEOUT")}>
            {commandBusy==="CLOSEOUT"?"جارٍ حفظ لقطة الإقفال…":"حفظ لقطة الإقفال التشغيلي"}
          </button>
        </>:null}
        <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={()=>window.print()}>
          طباعة تقرير الوردية
        </button>
      </div>
    </header>
    <p className="text-sm text-muted-foreground">هذا المركز يجمع أدلة التشغيل ويعرض أهلية الإقفال فقط. لا يرحّل قيوداً، ولا يغلق الصندوق أو الطلبات، ولا يغيّر المخزون أو ينقل مسؤولية المهام تلقائياً.</p>
    <div className="grid gap-3 lg:grid-cols-3">
      <article className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">بدء الوردية</p>
        <strong>{openingLabel}</strong>
        <p className="mt-1 text-xs">نتيجة قائمة الاستلام من المصادر المكتملة فقط.</p>
      </article>
      <article className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">إقفال التشغيل</p>
        <strong>{closeLabel}</strong>
        <p className="mt-1 text-xs">يمكن إنهاء قائمة التشغيل جزئياً مع إبقاء البنود المفتوحة موثقة.</p>
      </article>
      <article className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">الإقفال المالي</p>
        <strong>{financialLabel}</strong>
        <p className="mt-1 text-xs">{result.financialClose.statement}</p>
      </article>
    </div>
    {canCaptureSnapshot?<section className="space-y-3 rounded-xl border p-3 print:hidden">
      <div>
        <h3 className="font-semibold">بدء وردية تالية</h3>
        <p className="text-xs text-muted-foreground">تُنشأ وردية جديدة مرتبطة بهذه الوردية وبالمنطقة الزمنية المعتمدة ({result.organizationTimeZone}). لا يغلق هذا الإجراء الوردية الحالية، ولا يسجل عدّاً نقدياً أو إقفالاً مالياً.</p>
      </div>
      <form onSubmit={event=>void startNextShift(event)} className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">اسم الوردية
          <input required minLength={2} maxLength={80} value={startShiftLabel}
            onChange={event=>{setStartShiftKey(null);setStartShiftLabel(event.target.value);}}
            className="rounded-lg border bg-background p-2" placeholder="مثال: الوردية المسائية"/>
        </label>
        <label className="grid gap-1 text-sm">تاريخ العمل
          <input required type="date" value={startShiftDate}
            onChange={event=>{setStartShiftKey(null);setStartShiftDate(event.target.value);}}
            className="rounded-lg border bg-background p-2"/>
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={commandBusy!==null||startShiftLabel.trim().length<2||!startShiftDate}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {commandBusy==="start-shift"?"جارٍ بدء الوردية…":"بدء الوردية وربطها بالسابق"}
          </button>
        </div>
      </form>
    </section>:null}
    <section className="space-y-2">
      <h3 className="font-semibold">بدء الوردية واستلام العهدة</h3>
      <div className="grid gap-2 xl:grid-cols-2">{result.openingChecks.map(item=><CheckCard key={item.id} item={item}/>)}</div>
    </section>
    <section className="space-y-2">
      <h3 className="font-semibold">قائمة الإقفال التشغيلي</h3>
      <div className="grid gap-2 xl:grid-cols-2">{result.closingChecks.map(item=><CheckCard key={item.id} item={item}/>)}</div>
    </section>
    <section className="space-y-2">
      <h3 className="font-semibold">مصالحة النقد حسب العملة</h3>
      {result.cashControls.length?result.cashControls.map(item=><CashCard key={item.currency} item={item}/>):<p className="text-sm text-muted-foreground">لا توجد سجلات عهدة نقدية متاحة من مصدر موثق.</p>}
      <p className="text-xs text-muted-foreground">لا تُجمع عملات مختلفة. الفرق لا يُصحح تلقائياً ولا يتحول إلى قيد يومية دون إجراء مستقل مصرح به.</p>
    </section>
    <section className="space-y-2">
      <h3 className="font-semibold">محضر تسليم الوردية</h3>
      {result.handover.state==="NOT_REQUIRED"?<p className="text-sm">لا توجد وردية سابقة مطلوبة للتسليم.</p>:
        <article className="rounded-lg border p-3 space-y-2">
          <p className="text-sm font-semibold">{result.handover.state==="ACCEPTED"?"تم قبول التسليم":result.handover.state==="PENDING"?"بانتظار قبول التسليم":"التسليم غير متحقق"}</p>
          {result.handover.recordedAt?<p className="text-xs text-muted-foreground">وقت تسجيل التسليم: {result.handover.recordedAt}</p>:null}
          {result.handover.acceptedAt?<p className="text-xs text-muted-foreground">وقت قبول المستلم: {result.handover.acceptedAt}</p>:null}
          {result.handover.outgoingOwnerProfileId?<p className="text-xs text-muted-foreground">المسؤول السابق: ملف مستخدم موثق</p>:null}
          {result.handover.incomingOwnerProfileId?<p className="text-xs text-muted-foreground">المسؤول المستلم: ملف مستخدم موثق</p>:null}
          {result.handover.reason?<p className="text-sm text-muted-foreground">{result.handover.reason}</p>:null}
          {result.handover.openItemRefs.length?<div><p className="text-xs">العناصر المرحّلة للوردية الحالية: {result.handover.openItemRefs.length}</p><ul className="list-disc ps-5 text-xs">{result.handover.openItemRefs.map(ref=><li key={ref} dir="ltr">{ref}</li>)}</ul></div>:null}
          {result.handover.note?<p className="text-sm">{result.handover.note}</p>:null}
          <p className="text-xs">الإثبات: <EvidenceReferences ids={result.handover.evidenceIds}/></p>
          {!result.handover.recordedAt && (isOutgoingOwner || manager)?(
            <form onSubmit={event=>void saveHandover(event)} className="space-y-3 rounded-lg border p-3 print:hidden">
              <h4 className="text-sm font-semibold">تسجيل محضر التسليم</h4>
              <p className="text-xs text-muted-foreground">اختر المراجع المفتوحة التي ستنتقل للمستلم. يعيد الخادم التحقق من المؤسسة والحالة والصلاحية قبل الحفظ.</p>
              <label className="grid gap-1 text-sm">
                سبب التسليم
                <textarea required minLength={5} maxLength={500} rows={2} value={handoverReason} onChange={event=>{setHandoverRecordKey(null);setHandoverReason(event.target.value);}} className="rounded-lg border bg-background p-2" />
              </label>
              <label className="grid gap-1 text-sm">
                ملاحظة للمستلم (اختياري)
                <textarea maxLength={2000} rows={2} value={handoverNote} onChange={event=>{setHandoverRecordKey(null);setHandoverNote(event.target.value);}} className="rounded-lg border bg-background p-2" />
              </label>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">العناصر المفتوحة التي ستُذكر في المحضر ({selectedHandoverRefs.length}/200)</legend>
                {result.items.filter(item=>item.state!=="RESOLVED"&&item.state!=="UNKNOWN"&&SOURCE_UUID.test(item.sourceRef)).length?
                  <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-2">
                    {result.items.filter(item=>item.state!=="RESOLVED"&&item.state!=="UNKNOWN"&&SOURCE_UUID.test(item.sourceRef)).map(item=>{
                      const selected=selectedHandoverRefs.includes(item.sourceRef);
                      return <label key={item.id} className="flex items-start gap-2 text-sm">
                        <input type="checkbox" checked={selected} disabled={!selected&&selectedHandoverRefs.length>=200}
                          onChange={event=>{setHandoverRecordKey(null);setSelectedHandoverRefs(current=>event.target.checked
                            ?[...current,item.sourceRef]:current.filter(ref=>ref!==item.sourceRef));}}/>
                        <span><span className="font-medium">{item.title}</span><span className="block text-xs text-muted-foreground">{sourceLabels[item.sourceKey]} · {itemLabels[item.state]}</span></span>
                      </label>;
                    })}
                  </div>
                :<p className="text-xs text-muted-foreground">لا توجد عناصر مفتوحة ذات مراجع صالحة في الصفحة الحالية؛ يمكن تسجيل المحضر بسبب وملاحظة فقط.</p>}
              </fieldset>
              <button type="submit" disabled={commandBusy!==null||handoverReason.trim().length<5} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {commandBusy==="handover"?"جارٍ تسجيل المحضر…":"تسجيل التسليم لدى الخادم"}
              </button>
            </form>
          ):null}
          {result.handover.recordedAt && result.handover.acceptedAt===null && isIncomingOwner?(
            <div className="space-y-2 rounded-lg border p-3 print:hidden">
              <p className="text-sm font-semibold">مراجعة المستلم</p>
              {handoverLookupLoading?<p role="status" className="text-xs text-muted-foreground">جارٍ التحقق من مرجع التسليم لدى الخادم…</p>:
                handoverLookup?.handoverId && !handoverLookup.acceptedAt?<button type="button" disabled={commandBusy!==null} onClick={()=>void acceptHandover()} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                  {commandBusy==="accept-handover"?"جارٍ قبول التسليم…":"مراجعة المحضر وقبول الاستلام"}
                </button>:handoverLookup?.acceptedAt?<p role="status" className="text-sm">أكد الخادم قبول هذا المحضر في {handoverLookup.acceptedAt}.</p>:
                <p className="text-xs text-muted-foreground">لم يعرض الخادم محضراً قابلاً للقبول لهذا الحساب؛ لا يمكن قبول التسليم من واجهة المستخدم دون مرجع موثق.</p>}
            </div>
          ):null}
        </article>
      }
    </section>
    {canRecordCash?<section className="space-y-3 rounded-xl border p-3 print:hidden">
      <div><h3 className="font-semibold">تسجيل العد النقدي الفعلي</h3>
        <p className="text-xs text-muted-foreground">يسجل مبلغ العد الذي أدخله المستخدم كدليل مستقل لكل عملة ومرحلة. لا ينشئ قيداً ولا يغير الرصيد المتوقع؛ صلاحية finance يعيد الخادم التحقق منها.</p></div>
      {result.cashControls.length?(
        <form onSubmit={event=>void saveCashCount(event)} className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">المرحلة
            <select value={cashPhase} onChange={event=>{setCashCountKey(null);setCashPhase(event.target.value as "OPENING"|"CLOSING");}} className="rounded-lg border bg-background p-2">
              <option value="OPENING">عد افتتاح الصندوق</option><option value="CLOSING">عد إقفال الصندوق</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">العملة
            <select value={cashCurrency} onChange={event=>{setCashCountKey(null);setCashCurrency(event.target.value);}} className="rounded-lg border bg-background p-2" required>
              {result.cashControls.map(item=><option key={item.currency} value={item.currency}>{item.currency}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">المبلغ المعدود فعلياً
            <input type="number" inputMode="decimal" min="0" step="0.01" required value={cashAmount} onChange={event=>{setCashCountKey(null);setCashAmount(event.target.value);}} className="rounded-lg border bg-background p-2" />
          </label>
          <label className="grid gap-1 text-sm">ملاحظة العد (اختياري)
            <input maxLength={1000} value={cashNote} onChange={event=>{setCashCountKey(null);setCashNote(event.target.value);}} className="rounded-lg border bg-background p-2" />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">سبب التصحيح عند إعادة العد (إن وجد)
            <input maxLength={500} value={cashCorrectionReason} onChange={event=>{setCashCountKey(null);setCashCorrectionReason(event.target.value);}} className="rounded-lg border bg-background p-2" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={commandBusy!==null||!cashAmount.trim()||!cashCurrency} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {commandBusy==="cash"?"جارٍ تسجيل العد…":"حفظ العد الفعلي"}
            </button>
          </div>
        </form>
      ):<p className="text-sm text-muted-foreground">لا توجد عملات عهدة محملة من مصدر الوردية؛ لم نضف عملاً غير مثبت.</p>}
    </section>:null}
    {commandError?<p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{commandError}</p>:null}
    {commandNotice?<p role="status" className="rounded-lg border p-3 text-sm">{commandNotice}</p>:null}
    <section className="space-y-2">
      <h3 className="font-semibold">السجلات التي لا تزال تحتاج متابعة</h3>
      {result.items.filter(item=>item.state!=="RESOLVED").length?
        <div className="grid gap-2 lg:grid-cols-2">{result.items.filter(item=>item.state!=="RESOLVED").map(item=><QueueItemCard key={item.id} item={item} onOpenItem={onOpenItem}/>)}</div>:
        <p className="text-sm">لا توجد سجلات مفتوحة في المصادر المكتملة المعروضة.</p>}
    </section>
    {result.financialClose.blockers.length?<section className="rounded-lg border p-3">
      <h3 className="font-semibold">موانع الإقفال المالي</h3>
      <ul className="mt-1 list-disc ps-5 text-sm">{result.financialClose.blockers.map(item=><li key={item}>{item}</li>)}</ul>
    </section>:null}
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-semibold">تغطية المصادر والأدلة ({result.sourceCoverage.length})</summary>
      <div className="mt-2 space-y-2">{result.sourceCoverage.map(source=><article key={source.key} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-xs">
        <span>{sourceLabels[source.key as ShiftQueueItem["sourceKey"]]??source.key}</span>
        <EvidenceStatusLabel status={source.status}/>
        <span>{source.returnedCount===null?"العدد غير متاح":formatEvidenceNumber(source.returnedCount)}</span>
        <span>{source.asOf??"لا يوجد تاريخ مصدر"}</span>
        <span>الإثبات: <EvidenceReferences ids={source.evidenceIds}/></span>
        <p className="w-full text-muted-foreground">{source.message}</p>
      </article>)}</div>
    </details>
    <EvidenceWarnings warnings={result.warnings}/>
    <p className="text-xs text-muted-foreground">المستخدم المسؤول: {result.currentOwnerProfileId ? "ملف مستخدم مصرح به" : "غير محدد"} · حالة الأدلة: <EvidenceStatusLabel status={result.status}/></p>
  </section>;
}
