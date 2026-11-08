import {useState,type FormEvent} from "react";
import {MessageCircle,RefreshCw,Send} from "lucide-react";
import {addCustomerServiceCaseStaffMessage,fetchCustomerServiceCaseMessages,type CustomerServicePortalMessage} from "@/lib/customer-service-portal";
import type {CustomerServiceCaseStatus} from "@/lib/customer-service-cases";
const stamp=(value:string)=>{const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat("ar-YE",{dateStyle:"medium",timeStyle:"short"}).format(d):"وقت غير محدد";};
export function CustomerServiceConversation({caseId,status,onReplied}:{caseId:string;status:CustomerServiceCaseStatus;onReplied?:()=>Promise<void>|void}){
 const[expanded,setExpanded]=useState(false),[loaded,setLoaded]=useState(false),[messages,setMessages]=useState<CustomerServicePortalMessage[]>([]),[draft,setDraft]=useState(""),[loading,setLoading]=useState(false),[sending,setSending]=useState(false),[error,setError]=useState("");
 const canReply=status!=="resolved"&&status!=="closed";
 async function refresh(){setLoading(true);setError("");try{setMessages(await fetchCustomerServiceCaseMessages(caseId));setLoaded(true);}catch(e){setError(e instanceof Error?e.message:"تعذر تحميل المراسلات.");}finally{setLoading(false);}}
 async function toggle(){const next=!expanded;setExpanded(next);if(next&&!loaded&&!loading)await refresh();}
 async function send(event:FormEvent<HTMLFormElement>){event.preventDefault();const body=draft.trim();if(!body||body.length>2000||sending||!canReply)return;setSending(true);setError("");try{await addCustomerServiceCaseStaffMessage(caseId,body);setDraft("");await refresh();await onReplied?.();}catch(e){setError(e instanceof Error?e.message:"تعذر إرسال الرد للعميل.");}finally{setSending(false);}}
 return <section className="customer-service-conversation">
  <button type="button" className="customer-service-conversation-toggle" aria-expanded={expanded} onClick={()=>{void toggle();}}><MessageCircle size={16}/><span>المراسلات الظاهرة للعميل</span><span className="customer-service-conversation-count">{loaded?messages.length:"عرض"}</span></button>
  {expanded&&<div className="customer-service-conversation-body"><div className="customer-service-conversation-toolbar"><span>المحتوى هنا مشترك مع جهة اتصال العميل؛ الملاحظات الداخلية لا تظهر.</span><button type="button" className="btn secondary btn-sm" disabled={loading} onClick={()=>{void refresh();}}><RefreshCw size={13}/> تحديث</button></div>
   {loading&&<p role="status" className="customer-service-conversation-muted">جار تحميل المراسلات...</p>}{!loading&&!messages.length&&<p className="customer-service-conversation-muted">لا توجد مراسلات بعد.</p>}
   {!loading&&messages.length>0&&<ol className="customer-service-conversation-list">{messages.map(m=><li key={m.id} className={m.authorSide==="staff"?"from-staff":"from-customer"}><div><strong>{m.authorSide==="staff"?"فريق الأغبري":m.authorName}</strong><time dateTime={m.createdAt}>{stamp(m.createdAt)}</time></div><p>{m.message}</p></li>)}</ol>}
   {canReply?<form className="customer-service-conversation-reply" onSubmit={e=>{void send(e);}}><label htmlFor={"staff-case-reply-"+caseId}>رد ظاهر للعميل</label><textarea id={"staff-case-reply-"+caseId} value={draft} maxLength={2000} rows={2} disabled={sending} onChange={e=>setDraft(e.target.value)} placeholder="اكتب ردًا سيظهر لجهة اتصال العميل..."/><button type="submit" className="btn primary" disabled={sending||!draft.trim()}><Send size={14}/>{sending?"جار الإرسال...":"إرسال الرد للعميل"}</button></form>:<p className="customer-service-conversation-muted">الحالة منتهية؛ لا يمكن إضافة مراسلات جديدة.</p>}
   {error&&<p role="alert" className="customer-service-conversation-error">{error}</p>}
  </div>}
 </section>;
}
