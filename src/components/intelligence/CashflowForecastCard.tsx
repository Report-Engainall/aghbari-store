import type { CashflowForecast } from "@/lib/intelligence/cashflow-forecast";
import { EvidenceReferences, EvidenceStatusLabel, EvidenceWarnings, formatEvidenceNumber, IntelligenceStatePanel, type IntelligenceViewState } from "./shared";

export interface CashflowForecastCardProps {
  forecast?: CashflowForecast | null;
  state?: IntelligenceViewState;
  onRetry?: () => void;
}

type CashflowForecastPoint = CashflowForecast["points"][number];

const horizons = [7, 30, 90] as const;
const money = (value: number | null, currency: string) =>
  value === null ? "غير متاح" : formatEvidenceNumber(value) + " " + currency;

function selectCurrencyPoints(
  forecast: CashflowForecast,
  currency: string,
): CashflowForecastPoint[] {
  return horizons
    .map((horizon) => forecast.points.find((point) => point.currency === currency && point.horizonDays === horizon))
    .filter((point): point is CashflowForecastPoint => point !== undefined);
}

function CashflowForecastRows({
  points,
  currency,
}: {
  points: CashflowForecastPoint[];
  currency: string;
}) {
  return (
    <tbody>
      {points.map((point) => (
        <tr key={point.currency + ":" + point.horizonDays} className="border-b last:border-0">
          <td className="p-2">{point.horizonDays} يومًا</td>
          <td className="p-2">{money(point.openingBalance, currency)}</td>
          <td className="p-2">{money(point.knownInflows, currency)}</td>
          <td className="p-2">{money(point.knownOutflows, currency)}</td>
          <td className="p-2 font-semibold">{money(point.projectedBalance, currency)}</td>
          <td className="p-2"><EvidenceStatusLabel status={point.status} /></td>
        </tr>
      ))}
    </tbody>
  );
}

function CashflowForecastTable({
  points,
  currency,
}: {
  points: CashflowForecastPoint[];
  currency: string;
}) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead>
          <tr className="border-b text-right text-xs text-muted-foreground">
            <th className="p-2">المدة</th>
            <th className="p-2">الرصيد الافتتاحي</th>
            <th className="p-2">التدفقات الداخلة</th>
            <th className="p-2">التدفقات الخارجة</th>
            <th className="p-2">الرصيد المتوقع</th>
            <th className="p-2">الحالة</th>
          </tr>
        </thead>
        <CashflowForecastRows points={points} currency={currency} />
      </table>
    </div>
  );
}

function CashflowForecastPointEvidence({ point }: { point: CashflowForecastPoint }) {
  return (
    <div className="mt-2 text-xs text-muted-foreground">
      <p>
        {point.horizonDays} يومًا · اكتمال الجدول: {point.scheduleComplete ? "مكتمل" : "غير مكتمل"} · المعادلة: {point.formulaId}@{point.formulaVersion}
      </p>
      <p>
        مراجع الإثبات: <EvidenceReferences ids={point.evidenceIds} /> · إصدارات المعادلات المصدرية: {point.formulaVersions.join("، ") || "غير محدد"}
      </p>
      <EvidenceWarnings warnings={point.warnings} />
    </div>
  );
}

function CashflowForecastEvidence({ points }: { points: CashflowForecastPoint[] }) {
  return (
    <>
      {points.map((point) => (
        <CashflowForecastPointEvidence
          key={point.currency + ":" + point.horizonDays + ":proof"}
          point={point}
        />
      ))}
    </>
  );
}

function CashflowCurrencyPanel({
  currency,
  points,
}: {
  currency: string;
  points: CashflowForecastPoint[];
}) {
  return (
    <article aria-label={currency} className="rounded-xl border bg-card p-4 text-card-foreground">
      <h4 className="font-semibold">{currency}</h4>
      <CashflowForecastTable points={points} currency={currency} />
      <CashflowForecastEvidence points={points} />
    </article>
  );
}

function CashflowForecastData({ forecast }: { forecast: CashflowForecast }) {
  const currencies = [...new Set(forecast.points.map((point) => point.currency))];
  return (
    <section dir="rtl" className="space-y-3" aria-label="توقع التدفق النقدي">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">التدفق النقدي المجدول</h3>
        <span className="text-xs text-muted-foreground">الاحتساب حتى {forecast.asOf}</span>
      </header>
      <p className="text-xs text-muted-foreground">التدفقات الداخلة من أرصدة فواتير العملاء بعد الدفعات المسجلة. التدفقات الخارجة لا تُدرج إلا من التزامات إيصالات موردين مفوترة بالكامل، ومطابقة، وذات تاريخ استحقاق موثق في مستند محفوظ، وبعد ترحيل الدفعات المرتبطة. أي إيصال مفتوح غير محسوم يجعل الجدول «بحاجة إلى مراجعة»؛ ولا يتحول المصدر المفقود إلى صفر. الرصيد الافتتاحي النقدي/المصرفي يظل غير متاح حتى توفير رصيد افتتاحي أو كشف موثق ومطابقة معتمدة، ولذلك لا يُنشأ رصيد متوقع بمجرد جمع الالتزامات.</p>
      {currencies.map((currency) => (
        <CashflowCurrencyPanel
          key={currency}
          currency={currency}
          points={selectCurrencyPoints(forecast, currency)}
        />
      ))}
      <EvidenceWarnings warnings={forecast.warnings} />
    </section>
  );
}

export function CashflowForecastCard({ forecast, state = "ready", onRetry }: CashflowForecastCardProps) {
  const effectiveState = state === "ready" && !forecast ? "unavailable" : state;
  if (effectiveState !== "ready") {
    return <IntelligenceStatePanel state={effectiveState} onRetry={onRetry} emptyMessage="لا توجد توقعات تدفق نقدي للفترة المحددة." />;
  }
  if (!forecast || forecast.points.length === 0) {
    return <IntelligenceStatePanel state="empty" emptyMessage="لا توجد توقعات تدفق نقدي للفترة المحددة." />;
  }

  return <CashflowForecastData forecast={forecast} />;
}
