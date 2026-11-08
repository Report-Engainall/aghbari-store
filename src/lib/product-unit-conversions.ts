import { supabase } from "@/lib/supabase";

export type ProductAlternateUnit = {
  unit_name: string;
  base_units_per_unit: number;
};

export type ProductUnitOptions = {
  base_unit: string;
  units: ProductAlternateUnit[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseUnitOptions(value: unknown): ProductUnitOptions {
  if (!isRecord(value) || typeof value.base_unit !== "string" ||
      !value.base_unit.trim() || value.base_unit.trim().length > 40 ||
      !Array.isArray(value.units) || value.units.length > 20) {
    throw new Error("أعاد الخادم بيانات وحدات المنتج غير مكتملة.");
  }
  const baseUnit = value.base_unit as string;
  const seen = new Set<string>();
  const units = value.units.map((candidate) => {
    if (!isRecord(candidate) || typeof candidate.unit_name !== "string" ||
        candidate.unit_name.trim() !== candidate.unit_name ||
        candidate.unit_name.length < 1 || candidate.unit_name.length > 40 ||
        !Number.isSafeInteger(candidate.base_units_per_unit) ||
        Number(candidate.base_units_per_unit) < 2 || Number(candidate.base_units_per_unit) > 1000000) {
      throw new Error("يوجد تعريف وحدة بديلة أو معامل تحويل غير صالح.");
    }
    const key = candidate.unit_name.toLocaleLowerCase("ar");
    if (key === baseUnit.toLocaleLowerCase("ar") || seen.has(key)) {
      throw new Error("أسماء الوحدات البديلة يجب أن تكون فريدة ومختلفة عن الوحدة الأساسية.");
    }
    seen.add(key);
    return {
      unit_name: candidate.unit_name,
      base_units_per_unit: Number(candidate.base_units_per_unit),
    };
  });
  return { base_unit: baseUnit, units };
}

export async function fetchProductUnitOptions(productId: string): Promise<ProductUnitOptions> {
  if (!UUID.test(productId)) throw new Error("معرّف المنتج غير صالح.");
  const { data, error } = await supabase.rpc("get_product_unit_conversions", {
    p_product_id: productId,
  });
  if (error) throw new Error(error.message || "تعذر تحميل وحدات المنتج.");
  return parseUnitOptions(data);
}

export async function saveProductUnitOptions(
  productId: string,
  units: readonly ProductAlternateUnit[],
): Promise<ProductUnitOptions> {
  if (!UUID.test(productId)) throw new Error("معرّف المنتج غير صالح.");
  if (units.length > 20) throw new Error("يسمح بحد أقصى 20 وحدة بديلة للصنف.");
  const seen = new Set<string>();
  const normalized = units.map((unit) => {
    const name = unit.unit_name.trim();
    if (!name || name.length > 40 ||
        !Number.isSafeInteger(unit.base_units_per_unit) ||
        unit.base_units_per_unit < 2 || unit.base_units_per_unit > 1000000) {
      throw new Error("أدخل اسم وحدة من حرف إلى 40 حرفًا ومعامل تحويل صحيحًا من 2 إلى مليون.");
    }
    const key = name.toLocaleLowerCase("ar");
    if (seen.has(key)) throw new Error("لا تكرر اسم الوحدة البديلة.");
    seen.add(key);
    return { unit_name: name, base_units_per_unit: unit.base_units_per_unit };
  });
  const { data, error } = await supabase.rpc("save_product_unit_conversions", {
    p_product_id: productId,
    p_units: normalized,
  });
  if (error) throw new Error(error.message || "تعذر حفظ وحدات المنتج البديلة.");
  if (!isRecord(data) || data.product_id !== productId || data.changed === undefined) {
    throw new Error("لم يؤكد الخادم حفظ وحدات المنتج.");
  }
  return parseUnitOptions({ base_unit: data.base_unit, units: data.units });
}
