import {ClientOnly,createFileRoute} from "@tanstack/react-router";
import {CustomerServicePortal} from "@/components/CustomerServicePortal";
export const Route=createFileRoute("/service-cases")({
 head:()=>({meta:[{title:"خدمة العملاء | متجر الأغبري"},{name:"description",content:"تابع حالات الخدمة ومراسلات شركتك مع فريق الأغبري."},{name:"robots",content:"noindex"}]}),
 component:()=><ClientOnly fallback={<main className="customer-service-portal" dir="rtl" role="status">جار تحميل بوابة خدمة العملاء...</main>}><CustomerServicePortal/></ClientOnly>,
});
