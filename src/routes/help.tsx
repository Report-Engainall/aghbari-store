import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft, BookOpen, ClipboardList, FileText, Headphones, Lock, RotateCcw,
  MapPin, MessageCircle, Package, Search, ShoppingBag, UserRound, Users,
} from "lucide-react";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "مركز المساعدة | متجر الأغبري" },
      { name: "description", content: "إجابات عملية وروابط مباشرة لإدارة الطلبات والعناوين والفواتير والتواصل مع خدمة عملاء الأغبري." },
    ],
  }),
  component: HelpCenterPage,
});

type HelpArticle = {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string;
};

const articles: HelpArticle[] = [
  {
    id: "place-order",
    category: "الطلبات",
    question: "كيف أرسل طلب شراء؟",
    answer: "تصفح المنتجات واختر الكميات المطلوبة، ثم افتح السلة وراجع الأصناف وانتقل إلى إتمام الطلب. يتحقق النظام من بيانات السلة والأسعار والتوفر من الخادم قبل إرسال الطلب. لا يُعد الطلب مرسلاً حتى يعرض النظام تأكيد الحفظ ورقم الطلب.",
    keywords: "شراء سلة checkout كمية سعر ارسال",
  },
  {
    id: "pwa-install",
    category: "الحساب والتوصيل",
    question: "كيف أثبّت متجر الأغبري كتطبيق على جهازي؟",
    answer: "في المتصفحات التي تدعم التثبيت سيظهر زر «تثبيت التطبيق» تلقائياً عندما يعلن المتصفح أن المتجر جاهز. اضغطه وأكمل نافذة التثبيت الأصلية. إذا لم يظهر الزر، افتح قائمة المتصفح وابحث عن «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية» إن كان الخيار متاحاً. لا يدعم كل متصفح حدث التثبيت نفسه، كما أن العمل دون اتصال يظل للقراءة من الملفات العامة المسموح تخزينها فقط؛ لا تُرسل الطلبات أو المدفوعات دون اتصال.",
    keywords: "تثبيت التطبيق PWA إضافة الشاشة الرئيسية تنزيل تطبيق offline دون اتصال",
  },
  {
    id: "phone-login",
    category: "الحساب والتوصيل",
    question: "هل يمكنني تسجيل الدخول برقم الهاتف؟",
    answer: "اختر «تسجيل الدخول برقم الهاتف» من شاشة الدخول، ثم أدخل رقماً يمنياً محلياً يبدأ بـ7 أو رقماً دولياً بصيغة +رمز الدولة مع كلمة المرور. يتطلب ذلك أن يكون الهاتف مرتبطاً بحساب ومؤكداً وأن يكون موفر الهاتف مفعّلاً في المصادقة؛ إذا لم تكن هذه الشروط متوفرة سيعرض النظام سبب عدم الإتاحة. التسجيل الجديد حالياً بالبريد الإلكتروني.",
    keywords: "هاتف جوال رقم الهاتف تسجيل دخول كلمة مرور",
  },
  {
    id: "order-status",
    category: "الطلبات",
    question: "كيف أتابع حالة طلبي؟",
    answer: "افتح صفحة «طلباتي»، ثم اختر الطلب لعرض تفاصيله وسجل الحالات المسجل. استخدم زر تحديث الحالة في صفحة الطلب للحصول على أحدث حالة محفوظة من الخادم. ظهور حالة الطلب لا يعني أن الشحنة لها تتبع جغرافي مباشر.",
    keywords: "متابعة حالة طلب تأكيد شحن توصيل",
  },
  {
    id: "reorder",
    category: "الطلبات",
    question: "كيف أكرر طلباً سابقاً؟",
    answer: "من تفاصيل الطلب استخدم «حفظ كقالب إعادة الطلب». بعد ذلك افتح مساحة إعادة الطلب، وطبّق القالب لمراجعة الأصناف والكميات في السلة الحالية قبل الإرسال. تُراجع الأسعار والتوفر وقت إتمام الطلب الجديد.",
    keywords: "اعادة تكرار قالب شرائي سابق",
  },
  {
    id: "quotes",
    category: "الطلبات",
    question: "هل عرض السعر هو طلب شراء مؤكد؟",
    answer: "لا. طلب عرض السعر ومسار مراجعته منفصلان عن طلب الشراء. قبول عرض السعر لا ينشئ طلب بيع تلقائياً؛ أرسل طلب الشراء من السلة بعد مراجعة بياناته.",
    keywords: "عرض سعر تسعير quote قبول",
  },
  {
    id: "addresses",
    category: "الحساب والتوصيل",
    question: "كيف أدير عناوين التوصيل؟",
    answer: "افتح «عناوين التوصيل» لإضافة عناوين حسابك أو تعديلها أو تحديد العنوان الافتراضي. أثناء إتمام الطلب اختر العنوان المناسب؛ تُحفظ لقطة عنوان التوصيل مع الطلب حتى لا يتغير المستند إذا عُدّل العنوان لاحقاً.",
    keywords: "عنوان عناوين موقع توصيل delivery",
  },
  {
    id: "company",
    category: "الحساب والتوصيل",
    question: "كيف أدير أعضاء شركتي وجهات الاتصال؟",
    answer: "تتوفر صفحات جهات اتصال الشركة وأعضاء الشركة للحسابات التي منحها النظام صلاحية الإدارة. صلاحيات العضو تحدد ما يستطيع قراءته أو تنفيذه؛ لا تنتقل صلاحيات مسؤول الشركة تلقائياً إلى كل مستخدم تابع.",
    keywords: "شركة اعضاء مستخدمين جهات اتصال صلاحيات",
  },
  {
    id: "invoices",
    category: "الفواتير والحساب",
    question: "أين أجد الفواتير وكشف الحساب؟",
    answer: "استخدم صفحة الفواتير لعرض المستندات المتاحة لحسابك، وصفحة كشف الحساب لقراءة الرصيد والحركات التي يسمح بها دورك. قد تختلف تفاصيل المبالغ المعروضة وفق سياسة الخصوصية والصلاحيات المعتمدة للحساب.",
    keywords: "فاتورة فواتير كشف حساب رصيد حساب statement",
  },
  {
    id: "sessions",
    category: "الحساب والتوصيل",
    question: "كيف أنهي جلسات حسابي على الأجهزة الأخرى؟",
    answer: "من صفحة «ملفي الشخصي» اختر «إنهاء جلسات الأجهزة الأخرى» للإبقاء على هذا الجهاز، أو «تسجيل الخروج من جميع الأجهزة» لإنهاء الجلسة الحالية وبقية الجلسات. إبطال الجلسات يمنع تجديدها، لكن رمز الوصول الصادر سابقاً قد يبقى صالحاً حتى انتهاء مدته.",
    keywords: "جلسات أجهزة تسجيل الخروج جميع الأجهزة رمز دخول",
  },
  {
    id: "profile",
    category: "الحساب والتوصيل",
    question: "أين أراجع بيانات حسابي؟",
    answer: "افتح «ملفي الشخصي» لمراجعة الاسم والبريد والصلاحيات المرتبطة بجلسة المصادقة الحالية، والوصول إلى صفحات الطلبات والدفعات والعناوين والتنبيهات. تعديل بيانات الملف التجاري غير متاح من هذه الشاشة.",
    keywords: "ملفي الشخصي ملف الحساب الاسم البريد بيانات الحساب",
  },
  {
    id: "password-change",
    category: "الحساب والتوصيل",
    question: "كيف أغيّر كلمة مرور حسابي؟",
    answer: "بعد تسجيل الدخول افتح صفحة «كلمة المرور»، أدخل كلمة مرور جديدة وأكدها ثم احفظ. تنفذ المصادقة التحديث على الحساب الحالي؛ وإذا طلب موفر المصادقة إعادة التحقق، استخدم مسار استعادة كلمة المرور.",
    keywords: "كلمة المرور تغيير تحديث تغييرها حساب أمان",
  },
  {
    id: "payment-history",
    category: "الفواتير والحساب",
    question: "أين أراجع الدفعات المسجلة؟",
    answer: "افتح صفحة «دفعاتي» لعرض حركات السداد التي أعادها دفتر حسابك المصرّح به. تُربط العملة بالفاتورة عند وجودها ضمن تفاصيل القراءة؛ وتظهر القيمة أو العملة «غير متاحة» عندما لا يثبت المصدر المرجع اللازم. الصفحة للعرض فقط ولا تسجل دفعة جديدة.",
    keywords: "دفعاتي دفعة سداد إيصال قبض مدفوعات",
  },
  {
    id: "prices",
    category: "الفواتير والحساب",
    question: "لماذا لا تظهر الأسعار أو الإجماليات؟",
    answer: "يحدد الخادم فئة السعر وصلاحية عرض المبالغ وفق الحساب والمؤسسة. قد تُخفى الأسعار والإجماليات عمداً حسب سياسة المتجر؛ عدم ظهورها لا يعني أن قيمتها صفر. تواصل مع مسؤول حساب شركتك عند الحاجة إلى مراجعة صلاحية العرض.",
    keywords: "السعر اسعار مبلغ اجمالي خصوصية tier",
  },
  {
    id: "returns-history",
    category: "الطلبات",
    question: "أين أتابع طلبات الإرجاع؟",
    answer: "افتح «مرتجعاتي» لعرض طلبات الإرجاع المرتبطة بطلبات حسابك، وحالتها، وسببها، والكميات، ورد المراجعة. تُحمّل طلبات الحساب على صفحات من 20 طلباً أصلياً، ويظهر عدد المرتجعات للصفحة الحالية فقط. يمكنك فتح الطلب الأصلي من كل سجل.",
    keywords: "مرتجعاتي إرجاع مرتجع حالة مراجعة طلبات",
  },
  {
    id: "support-case",
    category: "خدمة العملاء",
    question: "كيف أرسل شكوى أو استفساراً؟",
    answer: "افتح مركز خدمة العملاء وسجّل نوع الحالة وموضوعها وتفاصيلها. يمكنك متابعة حالة الطلب وقراءة ردود الفريق والرد على الحالة ما دامت مفتوحة للمتابعة. تظهر الحالات ضمن نطاق شركتك فقط وبحسب صلاحية الحساب.",
    keywords: "شكوى استفسار مشكلة دعم مساعدة خدمة",
  },
  {
    id: "service-status",
    category: "خدمة العملاء",
    question: "هل يمكنني رؤية الملاحظات الداخلية للفريق؟",
    answer: "لا. بوابة العميل تعرض مراسلات الحالة المخصصة للعميل وحالتها ومواعيد الاستجابة والحل المتاحة، ولا تعرض الملاحظات الداخلية أو بيانات الإسناد والتصعيد أو المعلومات المالية الداخلية.",
    keywords: "ملاحظات داخلية خصوصية موظفين",
  },
];

const actions = [
  { to: "/orders", label: "متابعة طلباتي", detail: "عرض الطلبات وحالاتها المحفوظة", icon: ClipboardList },
  { to: "/returns", label: "مرتجعاتي", detail: "متابعة طلبات الإرجاع وقراراتها", icon: RotateCcw },
  { to: "/payments", label: "دفعاتي", detail: "عرض حركات السداد المسجلة في الحساب", icon: FileText },
  { to: "/profile", label: "ملفي الشخصي", detail: "بيانات الهوية وروابط الحساب", icon: UserRound },
  { to: "/account/password", label: "كلمة المرور", detail: "تحديث كلمة مرور الحساب الحالي", icon: Lock },
  { to: "/reorder", label: "إعادة الطلب", detail: "تطبيق القوالب ومراجعة السلة", icon: ShoppingBag },
  { to: "/addresses", label: "عناوين التوصيل", detail: "إدارة عناوين الحساب", icon: MapPin },
  { to: "/invoices", label: "الفواتير", detail: "عرض مستندات الحساب المتاحة", icon: FileText },
  { to: "/quotes", label: "عروض الأسعار", detail: "متابعة طلبات التسعير", icon: Package },
  { to: "/company/members", label: "أعضاء الشركة", detail: "إدارة الأعضاء وفق صلاحيتك", icon: Users },
] as const;

function normalizeSearch(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .toLocaleLowerCase("ar");
}

function HelpCenterPage() {
  const [query, setQuery] = useState("");
  const filteredArticles = useMemo(() => {
    const normalized = normalizeSearch(query.trim());
    if (!normalized) return articles;
    return articles.filter((article) =>
      normalizeSearch([article.category, article.question, article.answer, article.keywords].join(" ")).includes(normalized),
    );
  }, [query]);

  const categories = useMemo(
    () => [...new Set(filteredArticles.map((article) => article.category))],
    [filteredArticles],
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8" dir="rtl">
      <header className="rounded-2xl border bg-card p-5 sm:p-8">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} /> العودة إلى المتجر
        </Link>
        <div className="mt-5 flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary"><BookOpen size={26} /></div>
          <div>
            <p className="text-sm font-semibold text-primary">متجر الأغبري | Aghbari Commerce</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">مركز المساعدة</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
              إجابات مرتبطة بوظائف المتجر الحالية، وروابط مباشرة إلى صفحات تنفيذ الخدمة.
            </p>
          </div>
        </div>
        <label className="mt-6 flex items-center gap-3 rounded-xl border bg-background px-4 py-3">
          <Search size={19} className="shrink-0 text-muted-foreground" />
          <span className="sr-only">ابحث في الأسئلة الشائعة</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث عن الطلبات أو الفواتير أو التوصيل أو الحساب..."
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            type="search"
            maxLength={120}
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} className="text-xs text-primary">مسح البحث</button>
          ) : null}
        </label>
      </header>

      <section className="mt-6" aria-labelledby="help-actions-heading">
        <div className="mb-3 flex items-center gap-2">
          <Headphones size={19} className="text-primary" />
          <h2 id="help-actions-heading" className="text-lg font-bold">ابدأ من الخدمة المطلوبة</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map(({ to, label, detail, icon: Icon }) => (
            <Link key={to} to={to} className="group flex min-h-24 items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-primary/5">
              <span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon size={20} /></span>
              <span className="min-w-0">
                <strong className="block text-sm">{label}</strong>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span>
              </span>
              <ArrowLeft size={15} className="mr-auto shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1" />
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="help-faq-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageCircle size={19} className="text-primary" />
            <h2 id="help-faq-heading" className="text-lg font-bold">الأسئلة الشائعة</h2>
          </div>
          <span className="text-xs text-muted-foreground">{filteredArticles.length.toLocaleString("ar-YE")} إجابة</span>
        </div>
        {filteredArticles.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 text-center" role="status">
            <p className="font-semibold">لم نعثر على إجابة مطابقة.</p>
            <p className="mt-2 text-sm text-muted-foreground">جرّب كلمات أخرى أو أرسل استفسارك إلى فريق خدمة العملاء.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {categories.map((category) => (
              <section key={category} aria-label={category}>
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{category}</h3>
                <div className="space-y-2">
                  {filteredArticles.filter((article) => article.category === category).map((article) => (
                    <details key={article.id} id={article.id} className="rounded-xl border bg-card p-4">
                      <summary className="cursor-pointer list-none font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        <span className="flex items-center justify-between gap-3">
                          <span>{article.question}</span>
                          <span className="text-primary" aria-hidden="true">＋</span>
                        </span>
                      </summary>
                      <p className="mt-3 border-t pt-3 text-sm leading-8 text-muted-foreground">{article.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8 rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-primary/10 p-3 text-primary"><MessageCircle size={22} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">لم تجد ما تبحث عنه؟</h2>
            <p className="mt-1 text-sm leading-7 text-muted-foreground">
              افتح حالة خدمة جديدة أو تابع مراسلات شركتك الحالية مع فريق الأغبري. تتطلب بوابة الحالات تسجيل الدخول وصلاحية الحساب المناسبة.
            </p>
            <a href="/service-cases" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              فتح مركز خدمة العملاء <ArrowLeft size={16} />
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
