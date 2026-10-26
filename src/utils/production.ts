// src/utils/production.ts

// Productionで入力対象外となる項目名
export const PRODUCTION_EXCLUDED_NAMES =
  new Set<string>([
    "ConfigURL",
    "Export Time",
    "Model",
  ]);

// Productionの入力対象項目か判定する純粋関数
export const isProductionInputItem = (
  item: {
    name: string;
  }
): boolean => {
  return !PRODUCTION_EXCLUDED_NAMES.has(
    item.name
  );
};