import { useEffect, useState } from "react";
import { Plus, Save, Trash2, RefreshCw, Package } from "lucide-react";
import {
  fetchProductUnitOptions,
  saveProductUnitOptions,
  type ProductAlternateUnit,
} from "@/lib/product-unit-conversions";

type DraftUnit = { unit_name: string; base_units_per_unit: string };

export function ProductUnitConversionsEditor({ productId }: { productId: string }) {
  const [baseUnit, setBaseUnit] = useState("");
  const [units, setUnits] = useState<DraftUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await fetchProductUnitOptions(productId);
      setBaseUnit(result.base_unit);
      setUnits(result.units.map((unit) => ({
        unit_name: unit.unit_name,
        base_units_per_unit: String(unit.base_units_per_unit),
      })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل وحدات المنتج.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void fetchProductUnitOptions(productId).then((result) => {
      if (!active) return;
      setBaseUnit(result.base_unit);
      setUnits(result.units.map((unit) => ({
        unit_name: unit.unit_name,
        base_units_per_unit: String(unit.base_units_per_unit),
      })));
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "تعذر تحميل وحدات المنتج.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [productId]);

  function updateUnit(index: number, patch: Partial<DraftUnit>) {
    setUnits((current) => current.map((unit, position) =>
      position === index ? { ...unit, ...patch } : unit,
    ));
    setNotice("");
    setError("");
  }

  async function save() {
    if (saving || loading) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const normalized: ProductAlternateUnit[] = units.map((unit) => {
        const factor = Number(unit.base_units_per_unit);
        if (!Number.isSafeInteger(factor)) {
          throw new Error("معامل التحويل يجب أن يكون عددًا صحيحًا.");
        }
        return { unit_name: unit.unit_name, base_units_per_unit: factor };
      });
      const saved = await saveProductUnitOptions(productId, normalized);
      setBaseUnit(saved.base_unit);
      setUnits(saved.units.map((unit) => ({
        unit_name: unit.unit_name,
        base_units_per_unit: String(unit.base_units_per_unit),
      })));
      setNotice("تم حفظ وحدات التحويل وربطها بالوحدة الأساسية.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ وحدات المنتج.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel" style={{ marginTop: 14, padding: 12 }} aria-label="وحدات المنتج البديلة">
      <div className="panel-head">
        <div>
          <h3 style={{ margin: 0 }}>الوحدات البديلة ومعامل التحويل</h3>
          <p className="text-muted" style={{ marginTop: 4 }}>
            الوحدة الأساسية: <strong>{baseUnit || "—"}</strong>. معامل التحويل يحدد عدد وحدات الأساس داخل كل عبوة/كرتون.
          </p>
        </div>
        <Package size={20} />
      </div>
      {loading ? <p role="status">جار تحميل تعريفات الوحدات…</p> : (
        <>
          {units.length === 0 ? <p className="text-muted">لا توجد وحدات بديلة معرفة لهذا الصنف.</p> : (
            <div style={{ display: "grid", gap: 8 }}>
              {units.map((unit, index) => (
                <div key={index} className="form-grid" style={{ alignItems: "end" }}>
                  <label>الوحدة البديلة
                    <input
                      value={unit.unit_name}
                      maxLength={40}
                      onChange={(event) => updateUnit(index, { unit_name: event.target.value })}
                      disabled={saving}
                      placeholder="كرتون، عبوة، صندوق…"
                    />
                  </label>
                  <label>عدد وحدات الأساس داخلها
                    <input
                      type="number"
                      min={2}
                      max={1000000}
                      step={1}
                      value={unit.base_units_per_unit}
                      onChange={(event) => updateUnit(index, { base_units_per_unit: event.target.value })}
                      disabled={saving}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn outline"
                    aria-label={"حذف الوحدة البديلة " + (unit.unit_name || (index + 1))}
                    onClick={() => setUnits((current) => current.filter((_, position) => position !== index))}
                    disabled={saving}
                  ><Trash2 size={15} /> حذف</button>
                </div>
              ))}
            </div>
          )}
          <div className="toolbar-actions" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn outline"
              onClick={() => { setUnits((current) => current.length >= 20 ? current : [...current, { unit_name: "", base_units_per_unit: "2" }]); setNotice(""); }}
              disabled={saving || units.length >= 20}
            ><Plus size={15} /> إضافة وحدة</button>
            <button type="button" className="btn primary" onClick={() => void save()} disabled={saving || units.length > 20}>
              <Save size={15} /> {saving ? "جار الحفظ…" : "حفظ الوحدات"}
            </button>
            <button type="button" className="btn outline" onClick={() => void load()} disabled={saving || loading}>
              <RefreshCw size={15} /> إعادة تحميل
            </button>
          </div>
          <p className="text-muted" style={{ marginTop: 8 }}>
            مثال: إذا كانت الوحدة الأساسية «حبة»، ومعامل الكرتون 12، فإن طلب كرتونين يحوّل إلى 24 حبة قبل فحص سياسة الطلب والمخزون والتسعير.
          </p>
          {error && <p className="form-error" role="alert">{error}</p>}
          {notice && <p className="data-status success" role="status">{notice}</p>}
        </>
      )}
      {!loading && error && units.length === 0 && (
        <button type="button" className="btn outline" onClick={() => void load()} disabled={saving}>إعادة المحاولة</button>
      )}
    </section>
  );
}
