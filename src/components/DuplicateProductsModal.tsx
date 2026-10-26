import React, { useState, useMemo } from 'react';
import { 
  X, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2, 
  Layers, 
  Barcode, 
  Sparkles, 
  Info, 
  ShieldCheck, 
  Check, 
  RefreshCw,
  Box,
  Copy
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { DuplicateProductGroup, Product } from '../types';
import { findDuplicateGroups } from '../utils/duplicateCleaner';

interface DuplicateProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DuplicateProductsModal: React.FC<DuplicateProductsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { products, deleteProduct, updateProduct, formatMoney } = useApp();

  const [selectedDuplicateIds, setSelectedDuplicateIds] = useState<Set<string>>(new Set());
  const [mergeStockOnClean, setMergeStockOnClean] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'barcode' | 'exact'>('all');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Group all duplicates only when modal is open
  const duplicateGroups = useMemo(() => {
    if (!isOpen) return [];
    return findDuplicateGroups(products);
  }, [products, isOpen]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    if (filterType === 'barcode') {
      return duplicateGroups.filter(g => g.matchType === 'barcode' || g.matchType === 'both');
    }
    if (filterType === 'exact') {
      return duplicateGroups.filter(g => g.matchType === 'exact_details');
    }
    return duplicateGroups;
  }, [duplicateGroups, filterType]);

  // Total duplicates that can be cleaned
  const totalDuplicateCount = useMemo(() => {
    return duplicateGroups.reduce((sum, g) => sum + g.duplicateItems.length, 0);
  }, [duplicateGroups]);

  // Toggle single item selection
  const toggleSelect = (id: string) => {
    setSelectedDuplicateIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Select all duplicate items in current filtered view
  const selectAllVisibleDuplicates = () => {
    const next = new Set<string>();
    filteredGroups.forEach(g => {
      g.duplicateItems.forEach(d => next.add(d.id));
    });
    setSelectedDuplicateIds(next);
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedDuplicateIds(new Set());
  };

  // Delete selected duplicates
  const handleDeleteSelected = async () => {
    if (selectedDuplicateIds.size === 0) return;

    const count = selectedDuplicateIds.size;
    if (!window.confirm(`هل أنت متأكد من حذف ${count} مادة مكررة محددة من المخزن؟`)) {
      return;
    }

    setIsProcessing(true);
    try {
      // If merging stock is enabled, add duplicate stocks into primary before deleting
      if (mergeStockOnClean) {
        duplicateGroups.forEach(group => {
          const duplicatesToMerge = group.duplicateItems.filter(d => selectedDuplicateIds.has(d.id));
          const totalStockToTransfer = duplicatesToMerge.reduce((acc, curr) => acc + (curr.stock || 0), 0);
          if (totalStockToTransfer > 0) {
            updateProduct(group.primaryItem.id, {
              stock: (group.primaryItem.stock || 0) + totalStockToTransfer
            });
          }
        });
      }

      // Delete the items
      selectedDuplicateIds.forEach(id => {
        deleteProduct(id);
      });

      setSelectedDuplicateIds(new Set());
      setActionNotice(`✅ تم بنجاح حذف ${count} مادة مكررة وتحديث بيانات المخزن.`);
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      alert('حدث خطأ أثناء حذف المواد المكررة: ' + (err.message || err));
    } finally {
      setIsProcessing(false);
    }
  };

  // Auto Clean ALL duplicates (keep primary, remove duplicates)
  const handleAutoCleanAll = async () => {
    if (totalDuplicateCount === 0) return;

    const confirmMsg = 
      `هل أنت متأكد من حذف كافة النسخ المكررة (${totalDuplicateCount} مادة مكررة) بضغطة واحدة؟\n\n` +
      `✓ سيتم الاحتفاظ بالمادة الأساسية الأولى لكل صنف.\n` +
      (mergeStockOnClean ? `✓ سيتم دمج وجمع رصيد المخزن في المادة الأصلية حتى لا تفقد أي بضاعة.` : '');

    if (!window.confirm(confirmMsg)) {
      return;
    }

    setIsProcessing(true);
    try {
      let deletedTotal = 0;

      duplicateGroups.forEach(group => {
        if (mergeStockOnClean) {
          const totalStockToTransfer = group.duplicateItems.reduce((acc, curr) => acc + (curr.stock || 0), 0);
          if (totalStockToTransfer > 0) {
            updateProduct(group.primaryItem.id, {
              stock: (group.primaryItem.stock || 0) + totalStockToTransfer
            });
          }
        }

        group.duplicateItems.forEach(dup => {
          deleteProduct(dup.id);
          deletedTotal++;
        });
      });

      setSelectedDuplicateIds(new Set());
      setActionNotice(`🎉 تم بنجاح تنظيف وحذف ${deletedTotal} مادة مكررة، وأصبح المخزن نقياً بنسبة 100%!`);
      setTimeout(() => setActionNotice(null), 5000);
    } catch (err: any) {
      alert('حدث خطأ أثناء تنظيف المواد المكررة: ' + (err.message || err));
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-fadeIn" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-white to-indigo-500/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                <span>أداة كشف وإلغاء المواد المكررة</span>
                {totalDuplicateCount > 0 ? (
                  <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full border border-amber-200">
                    {totalDuplicateCount} مادة مكررة
                  </span>
                ) : (
                  <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    المخزن نظيف وخالٍ من التكرار
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                فحص المواد المتطابقة في الباركود أو المتطابقة بنسبة 100% في بياناتها مع إمكانية مراجعتها وحذفها.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Notice */}
        {actionNotice && (
          <div className="p-3 bg-emerald-50 border-b border-emerald-200 text-xs font-bold text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionNotice}</span>
          </div>
        )}

        {/* Filter & Batch Actions Bar */}
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          {/* Filter Type */}
          <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                filterType === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الكل ({duplicateGroups.length} صنف مكرر)
            </button>
            <button
              type="button"
              onClick={() => setFilterType('barcode')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                filterType === 'barcode'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Barcode className="w-3.5 h-3.5" />
              <span>تطابق الباركود</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterType('exact')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                filterType === 'exact'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Copy className="w-3.5 h-3.5" />
              <span>تشابه 100% بالبيانات</span>
            </button>
          </div>

          {/* Merge Stock Toggle */}
          <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800">
            <input
              type="checkbox"
              checked={mergeStockOnClean}
              onChange={(e) => setMergeStockOnClean(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
            />
            <span>دمج رصيد المخزن في المادة الأصلية قبل الحذف (حماية من ضياع الرصيد)</span>
          </label>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {totalDuplicateCount === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h4 className="text-base font-extrabold text-slate-800">المخزن منظم وخالٍ تماماً من أي مواد مكررة</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                كافة المواد ({products.length} مادة) تمتلك رموز باركود فريدة وبيانات متميزة. لا توجد أي نسخ مكررة مطابقة في النظام.
              </p>
            </div>
          ) : (
            <>
              {/* Review Tip */}
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong>طريقة المراجعة:</strong> يتم تمييز المادة الأصلية باللون الأخضر (التي ستبقى في المخزن)، بينما تظهر النسخ المكررة الإضافية باللون البرتقالي ويمكنك حذفها فرادى أو تحديدها وحذفها معاً.
                </div>
              </div>

              {/* Group Cards */}
              <div className="space-y-4">
                {filteredGroups.map((group, groupIdx) => {
                  const isBarcodeMatch = group.matchType === 'barcode' || group.matchType === 'both';
                  const isExactMatch = group.matchType === 'exact_details' || group.matchType === 'both';

                  return (
                    <div
                      key={group.id}
                      className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs transition hover:border-slate-300"
                    >
                      {/* Group Header */}
                      <div className="p-3.5 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-[11px] font-black flex items-center justify-center">
                            {groupIdx + 1}
                          </span>
                          <div>
                            <span className="font-extrabold text-xs text-slate-900">
                              {group.matchLabel}
                            </span>
                            <span className="text-[11px] text-slate-500 block">
                              اسم المادة: <strong className="text-slate-800">{group.primaryItem.name}</strong> · إجمالي النسخ: {group.allProducts.length}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {isBarcodeMatch && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200 font-mono">
                              كود: {group.primaryItem.code || group.matchKey}
                            </span>
                          )}
                          {isExactMatch && (
                            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-bold border border-indigo-200">
                              تطابق 100% بالبيانات
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Items List in Group */}
                      <div className="divide-y divide-slate-100">
                        {/* 1. Primary Item (Keeper) */}
                        <div className="p-3.5 bg-emerald-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-extrabold flex items-center gap-1 shrink-0 shadow-2xs">
                              <Check className="w-3.5 h-3.5" />
                              المادة الأساسية (ستبقى)
                            </span>
                            <div>
                              <div className="text-xs font-black text-slate-900">
                                {group.primaryItem.name}
                              </div>
                              <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                                <span>الكود: <strong className="font-mono text-slate-700">{group.primaryItem.code || 'بدون كود'}</strong></span>
                                <span>التصنيف: <strong>{group.primaryItem.category || 'عام'}</strong></span>
                                <span>الوحدة: <strong>{group.primaryItem.unit || 'قطعة'}</strong></span>
                                <span>تاريخ الإضافة: {group.primaryItem.createdAt ? new Date(group.primaryItem.createdAt).toLocaleDateString('ar-IQ') : 'قديم'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                            <div className="text-left">
                              <span className="text-[11px] text-slate-400 block">سعر البيع:</span>
                              <span className="text-xs font-bold text-emerald-700">{formatMoney(group.primaryItem.retailPrice)}</span>
                            </div>
                            <div className="text-left bg-emerald-100/70 border border-emerald-300/80 px-2.5 py-1 rounded-lg">
                              <span className="text-[10px] text-emerald-800 block font-bold">الرصيد بالمخزن:</span>
                              <span className="text-xs font-black text-emerald-950">{group.primaryItem.stock} {group.primaryItem.unit}</span>
                            </div>
                          </div>
                        </div>

                        {/* 2. Duplicate Items (To be pruned) */}
                        {group.duplicateItems.map((dup, dupIdx) => {
                          const isSelected = selectedDuplicateIds.has(dup.id);

                          return (
                            <div
                              key={dup.id}
                              className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                                isSelected ? 'bg-rose-50/80 border-r-4 border-r-rose-600' : 'bg-white hover:bg-slate-50/70'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelect(dup.id)}
                                    className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                                  />
                                </label>
                                <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold shrink-0">
                                  نسخة مكررة #{dupIdx + 1}
                                </span>
                                <div>
                                  <div className="text-xs font-bold text-slate-800">
                                    {dup.name}
                                  </div>
                                  <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                                    <span>الكود: <strong className="font-mono text-slate-700">{dup.code || 'بدون كود'}</strong></span>
                                    <span>التصنيف: <strong>{dup.category || 'عام'}</strong></span>
                                    <span>الوحدة: <strong>{dup.unit || 'قطعة'}</strong></span>
                                    <span>تاريخ الإضافة: {dup.createdAt ? new Date(dup.createdAt).toLocaleDateString('ar-IQ') : 'لاحق'}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                                <div className="text-left">
                                  <span className="text-[11px] text-slate-400 block">سعر البيع:</span>
                                  <span className="text-xs font-bold text-slate-700">{formatMoney(dup.retailPrice)}</span>
                                </div>
                                <div className="text-left bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
                                  <span className="text-[10px] text-slate-500 block">الرصيد:</span>
                                  <span className="text-xs font-black text-slate-800">{dup.stock} {dup.unit}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(`هل تريد بالتأكيد حذف هذه النسخة المكررة (${dup.name})؟`)) {
                                      if (mergeStockOnClean && dup.stock > 0) {
                                        updateProduct(group.primaryItem.id, {
                                          stock: (group.primaryItem.stock || 0) + dup.stock
                                        });
                                      }
                                      deleteProduct(dup.id);
                                    }
                                  }}
                                  className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 border border-rose-200 text-xs font-bold transition cursor-pointer flex items-center gap-1"
                                  title="حذف هذه النسخة المكررة فقط"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>حذف</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-100/90 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            {selectedDuplicateIds.size > 0 ? (
              <div className="flex items-center gap-2">
                <span className="font-bold text-rose-700">
                  تم تحديد {selectedDuplicateIds.size} مادة مكررة
                </span>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-slate-500 hover:text-slate-800 underline text-[11px] cursor-pointer"
                >
                  إلغاء التحديد
                </button>
              </div>
            ) : totalDuplicateCount > 0 ? (
              <button
                type="button"
                onClick={selectAllVisibleDuplicates}
                className="text-indigo-700 hover:text-indigo-900 font-bold underline cursor-pointer"
              >
                تحديد كافة المواد المكررة الظاهرة ({filteredGroups.reduce((a, c) => a + c.duplicateItems.length, 0)})
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer flex-1 sm:flex-initial text-center"
            >
              إغلاق
            </button>

            {selectedDuplicateIds.size > 0 && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleDeleteSelected}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs flex-1 sm:flex-initial"
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف المحدد ({selectedDuplicateIds.size})</span>
              </button>
            )}

            {totalDuplicateCount > 0 && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleAutoCleanAll}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-amber-600/20 flex-1 sm:flex-initial active:scale-98"
              >
                {isProcessing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>تنظيف وحذف كافة المكررات بضغطة واحدة ({totalDuplicateCount})</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
