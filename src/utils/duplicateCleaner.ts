import { Product, DuplicateProductGroup } from '../types';

export const normalizeString = (str: string): string => {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove arabic tashkeel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
};

export const findDuplicateGroups = (products: Product[]): DuplicateProductGroup[] => {
  if (!products || products.length < 2) return [];

  const barcodeMap = new Map<string, Product[]>();
  const exactMap = new Map<string, Product[]>();

  products.forEach((p) => {
    // 1. Group by code/barcode if present and not empty
    const cleanCode = (p.code || '').trim().toLowerCase();
    if (cleanCode && cleanCode !== '0' && cleanCode !== 'null' && cleanCode !== 'undefined') {
      const existing = barcodeMap.get(cleanCode) || [];
      existing.push(p);
      barcodeMap.set(cleanCode, existing);
    }

    // 2. Group by 100% exact details: name + category + unit + cost + retail + wholesale
    const normName = normalizeString(p.name);
    const normCategory = normalizeString(p.category || 'عام');
    const normUnit = normalizeString(p.unit || 'قطعة');
    const cost = Math.round((p.costPrice || 0) * 100);
    const retail = Math.round((p.retailPrice || 0) * 100);
    const wholesale = Math.round((p.wholesalePrice || 0) * 100);

    const exactKey = `${normName}__${normCategory}__${normUnit}__${cost}__${retail}__${wholesale}`;
    const existingExact = exactMap.get(exactKey) || [];
    existingExact.push(p);
    exactMap.set(exactKey, existingExact);
  });

  const processedProductIds = new Set<string>();
  const duplicateGroups: DuplicateProductGroup[] = [];

  // Helper to pick primary item (oldest or with highest stock)
  const sortAndSeparate = (items: Product[]) => {
    // Sort so primary is first: prefer item with stock > 0, then earlier createdAt
    const sorted = [...items].sort((a, b) => {
      if (b.stock !== a.stock) return b.stock - a.stock;
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });
    return {
      primaryItem: sorted[0],
      duplicateItems: sorted.slice(1),
      allProducts: sorted,
    };
  };

  // 1. Check Barcode duplicates
  barcodeMap.forEach((items, code) => {
    if (items.length > 1) {
      // Check if all items in this barcode group also match exact details
      const normFirst = normalizeString(items[0].name);
      const isAlsoExact = items.every((i) => normalizeString(i.name) === normFirst && i.retailPrice === items[0].retailPrice);
      
      const { primaryItem, duplicateItems, allProducts } = sortAndSeparate(items);
      const matchType = isAlsoExact ? 'both' : 'barcode';
      const matchLabel = isAlsoExact
        ? `تطابق تام في الباركود (${code}) وتفاصيل المادة بالكامل`
        : `تطابق في كود المادة / الباركود (${code})`;

      duplicateGroups.push({
        id: `dup_barcode_${code}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        matchType,
        matchLabel,
        matchKey: code,
        primaryItem,
        duplicateItems,
        allProducts,
      });

      items.forEach((p) => processedProductIds.add(p.id));
    }
  });

  // 2. Check 100% exact details duplicates (excluding products already grouped by barcode)
  exactMap.forEach((items, key) => {
    const unhandledItems = items.filter((p) => !processedProductIds.has(p.id));
    if (unhandledItems.length > 1) {
      const { primaryItem, duplicateItems, allProducts } = sortAndSeparate(unhandledItems);
      duplicateGroups.push({
        id: `dup_exact_${key}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        matchType: 'exact_details',
        matchLabel: `تشابه وتطابق 100% في بيانات المادة (${primaryItem.name})، التصنيف، الأسعار والوحدة`,
        matchKey: primaryItem.name,
        primaryItem,
        duplicateItems,
        allProducts,
      });
      unhandledItems.forEach((p) => processedProductIds.add(p.id));
    }
  });

  return duplicateGroups;
};
