import { supabase } from "@/lib/supabase";
import { buildCustomerQuotePipeline,parseCustomerQuotePipelineSnapshot,type CustomerQuotePipelineResult } from "./customer-quote-pipeline";
export type CustomerQuotePipelineFetchResult=
 |{ok:true;result:CustomerQuotePipelineResult}
 |{ok:false;status:"DENIED"|"UNAVAILABLE"|"ERROR";message:string};
const DAY=/^\d{4}-\d{2}-\d{2}$/;
function validDay(value:string):boolean {
 if(!DAY.test(value))return false;
 const date=new Date(value+"T00:00:00.000Z");
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export async function fetchCustomerQuotePipeline(input:{from:string;to:string}):Promise<CustomerQuotePipelineFetchResult>{
 const fromTime=Date.parse(input.from+"T00:00:00.000Z"),toTime=Date.parse(input.to+"T00:00:00.000Z");
 if(!validDay(input.from)||!validDay(input.to)||input.from>input.to||(toTime-fromTime)/86_400_000>730)
  return {ok:false,status:"ERROR",message:"فترة عروض العملاء غير صالحة."};
 try{
  const {data,error}=await supabase.rpc("fetch_customer_quote_pipeline",{p_from:input.from,p_to:input.to});
  if(error){
   if(error.code==="42501"||error.code==="28000"||error.code==="PGRST301")
    return {ok:false,status:"DENIED",message:"لا تملك صلاحية قراءة مسار عروض العملاء."};
   if(error.code==="PGRST202"||error.code==="42883")
    return {ok:false,status:"UNAVAILABLE",message:"مصدر مسار عروض العملاء غير متاح قبل تطبيق ترحيله."};
   return {ok:false,status:"ERROR",message:"تعذر قراءة مسار عروض العملاء من المصدر المعتمد."};
  }
  const snapshot=parseCustomerQuotePipelineSnapshot(data);
  if(!snapshot)return {ok:false,status:"ERROR",message:"استجابة مسار عروض العملاء غير متوازنة أو غير مكتملة؛ حُجبت المؤشرات."};
  return {ok:true,result:buildCustomerQuotePipeline(snapshot)};
 }catch{return {ok:false,status:"UNAVAILABLE",message:"تعذر الاتصال بمصدر مسار عروض العملاء."};}
}
