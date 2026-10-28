import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Invoice } from '../types';
import { 
  X, 
  Printer, 
  Check, 
  FileText, 
  Receipt, 
  FileDown, 
  Bluetooth, 
  RefreshCw, 
  Info, 
  ArrowDownAZ,
  PackageMinus,
  Sparkles
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { PartialReturnModal } from './PartialReturnModal';
import { ModernInvoiceHeader } from './ModernInvoiceHeader';

interface InvoicePrintModalProps {
  invoice: Invoice | null;
  onClose: () => void;
}

// ختم تجاري على شكل نجمة مسننة
const StarburstSeal: React.FC<{ text: string }> = ({ text }) => (
  <div className="relative flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 select-none shrink-0">
    <svg viewBox="0 0 100 100" className="w-full h-full fill-none stroke-black stroke-[2]">
      <polygon points="50,2 62,18 82,10 83,31 99,38 89,55 99,71 83,78 82,98 62,91 50,106 38,91 18,98 17,78 1,71 11,55 1,38 17,31 18,10 38,18" />
    </svg>
    <span className="absolute font-black text-xs sm:text-sm text-black" style={{ letterSpacing: 'normal' }}>{text}</span>
  </div>
);

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({ invoice, onClose }) => {
  const { settings, hasPermission } = useApp();
  const [activeTemplate, setActiveTemplate] = useState<'classic' | 'modern'>(
    settings.invoiceTemplate || 'modern'
  );

  useEffect(() => {
    if (settings.invoiceTemplate) {
      setActiveTemplate(settings.invoiceTemplate);
    }
  }, [settings.invoiceTemplate]);

  const [printLayout, setPrintLayout] = useState<'a4' | 'a5' | 'thermal80' | 'thermal58'>(
    settings.printFormat === 'thermal58'
      ? 'thermal58'
      : settings.printFormat === 'thermal' || settings.printFormat === 'thermal80'
      ? 'thermal80'
      : settings.printFormat === 'a5'
      ? 'a5'
      : 'a4'
  );
  const [sortByAlphabet, setSortByAlphabet] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);
  const [isPartialReturnOpen, setIsPartialReturnOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleBeforePrint = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
    };
  }, []);

  if (!invoice) return null;

  const isThermal = printLayout === 'thermal80' || printLayout === 'thermal58';
  const is58mm = printLayout === 'thermal58';

  const dateObj = new Date(invoice.date);
  const arabicDays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const dayName = arabicDays[dateObj.getDay()];

  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const dateFormatted = `${year}/${month}/${day}`;

  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const seconds = String(dateObj.getSeconds()).padStart(2, '0');
  const timeFormatted = `${hours}:${minutes}:${seconds}`;

  const invoiceTotal = invoice.total;
  const previousDebt = invoice.previousDebt || 0;
  const grandTotal = invoiceTotal + previousDebt;
  const paid = invoice.paidAmount;
  const totalRemainingDebt = Math.max(0, grandTotal - paid);
  const currencyLabel = settings.currency || 'د.ع';

  const displayedItems = sortByAlphabet
    ? [...invoice.items].sort((a, b) => {
        const nameA = a.name || a.productName || '';
        const nameB = b.name || b.productName || '';
        return nameA.localeCompare(nameB, 'ar');
      })
    : invoice.items;

  const generateInvoicePDF = async (): Promise<{ blob: Blob; fileName: string; dataUrl: string } | null> => {
    const element = document.getElementById('printable-invoice');
    if (!element) return null;

    const dataUrl = await toPng(element, {
      quality: 1,
      pixelRatio: 2.5,
      backgroundColor: '#ffffff',
      skipFonts: true,
      style: {
        letterSpacing: 'normal',
        wordSpacing: 'normal',
        fontFamily: "'Cairo', 'Tajawal', Tahoma, Arial, sans-serif",
      },
    });

    const img = new Image();
    img.src = dataUrl;
    await new Promise((resolve) => {
      img.onload = resolve;
    });

    const aspect = img.naturalHeight / (img.naturalWidth || 1);
    let pdf: jsPDF;
    const fileName = `قائمة_${invoice.invoiceNumber}.pdf`;

    if (printLayout === 'thermal58') {
      const imgWidth = 48;
      const imgHeight = imgWidth * aspect;
      pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [58, imgHeight + 4]
      });
      pdf.addImage(dataUrl, 'PNG', 5, 2, imgWidth, imgHeight);
    } else if (printLayout === 'thermal80') {
      const imgWidth = 72;
      const imgHeight = imgWidth * aspect;
      pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [80, imgHeight + 4]
      });
      pdf.addImage(dataUrl, 'PNG', 4, 2, imgWidth, imgHeight);
    } else if (printLayout === 'a5') {
      pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a5'
      });
      const pdfWidth = 148;
      const pdfHeight = 210;
      const imgWidth = pdfWidth - 8;
      const imgHeight = imgWidth * aspect;
      pdf.addImage(dataUrl, 'PNG', 4, 4, imgWidth, Math.min(imgHeight, pdfHeight - 8));
    } else {
      pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      const pdfWidth = 210;
      const pdfHeight = 297;
      const imgWidth = pdfWidth - 12;
      const imgHeight = imgWidth * aspect;
      pdf.addImage(dataUrl, 'PNG', 6, 6, imgWidth, Math.min(imgHeight, pdfHeight - 12));
    }

    const blob = pdf.output('blob');
    return { blob, fileName, dataUrl };
  };

  // دالة الطباعة المتوافقة مع أندرويد والويندوز والمتصفح
  const handlePrint = async () => {
    // 1. بيئة Electron لويندوز
    if ((window as any).electronAPI?.printInvoice) {
      try {
        (window as any).electronAPI.printInvoice();
        return;
      } catch (e) {
        console.warn('Electron print fallback', e);
      }
    }

    const printElement = document.getElementById('printable-invoice');
    if (!printElement) return;

    // 2. استخدام iframe مخفي لتشغيل الطباعة المباشرة على أندرويد والويب
    try {
      const oldIframe = document.getElementById('print-iframe-helper');
      if (oldIframe) oldIframe.remove();

      const iframe = document.createElement('iframe');
      iframe.id = 'print-iframe-helper';
      iframe.style.position = 'fixed';
      iframe.style.top = '-9999px';
      iframe.style.left = '-9999px';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
            <head>
              <meta charset="utf-8" />
              <title>قائمة ${invoice.invoiceNumber}</title>
              <style>
                @page {
                  size: ${printLayout === 'a4' ? 'A4 portrait' : printLayout === 'a5' ? 'A5 portrait' : printLayout === 'thermal58' ? '58mm auto' : '80mm auto'};
                  margin: ${isThermal ? '1mm' : '4mm'};
                }
                body {
                  margin: 0;
                  padding: ${isThermal ? '2px' : '8px'};
                  direction: rtl;
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Tahoma, Arial, sans-serif;
                  background: #fff;
                  color: #000;
                }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #000; padding: 4px; }
                .no-print { display: none !important; }
                img { max-width: 100%; }
              </style>
            </head>
            <body>
              ${printElement.innerHTML}
            </body>
          </html>
        `);
        doc.close();

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch {
            window.print();
          }
          setTimeout(() => {
            iframe.remove();
          }, 4000);
        }, 350);
        return;
      }
    } catch (e) {
      console.warn('Iframe printing failed, using fallback', e);
    }

    // 3. احتياطي مباشر
    window.scrollTo(0, 0);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  // دالة حفظ ملف الـ PDF
  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    setPdfNotice('جاري إنشاء ملف PDF وتجهيزه للتحميل...');
    try {
      const result = await generateInvoicePDF();
      if (!result) return;

      const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent || '');

      // إذا كان جهاز محمول، فتح مربع الطباعة/الحفظ كـ PDF مباشرة لضمان الحفظ في مجلد التنزيلات
      if (isMobile) {
        handlePrint();
        setPdfNotice('اختر "حفظ بتنسيق PDF" من أعلى شاشة الطباعة');
        setTimeout(() => setPdfNotice(null), 5000);
        return;
      }

      // أجهزة الكمبيوتر
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setPdfNotice('تم تحميل ملف PDF بنجاح');
      setTimeout(() => setPdfNotice(null), 3000);
    } catch (err: any) {
      console.error('Error downloading PDF:', err);
      setPdfNotice('حدث خطأ أثناء تنزيل الملف');
      setTimeout(() => setPdfNotice(null), 4000);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleShareWhatsApp = async () => {
    setIsGeneratingPDF(true);
    setPdfNotice(null);
    try {
      let summaryText = `📋 *فاتورة مبيعات: ${settings.storeName}*\n`;
      summaryText += `رقم القائمة: ${invoice.invoiceNumber}\n`;
      summaryText += `التاريخ: ${dayName} ${dateFormatted}\n`;
      summaryText += `حضرة السيد: ${invoice.customerName}\n`;
      summaryText += `المبلغ المطلوب: ${invoice.total.toLocaleString()} ${currencyLabel}\n`;
      if (totalRemainingDebt > 0) {
        summaryText += `مجموع الديون بذمة العميل: ${totalRemainingDebt.toLocaleString()} ${currencyLabel}\n`;
      }
      summaryText += `\nالمفكر المحاسبي`;

      let targetPhone = invoice.customerPhone ? invoice.customerPhone.replace(/[^0-9]/g, '') : '';
      if (targetPhone) {
        if (targetPhone.startsWith('00964')) {
          targetPhone = targetPhone.substring(2);
        } else if (targetPhone.startsWith('07') && targetPhone.length === 11) {
          targetPhone = '964' + targetPhone.substring(1);
        } else if (targetPhone.startsWith('7') && targetPhone.length === 10) {
          targetPhone = '964' + targetPhone;
        }
      }
      const whatsappUrl = targetPhone
        ? `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(summaryText)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(summaryText)}`;

      const link = document.createElement('a');
      link.href = whatsappUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setIsCopied(true);
      setPdfNotice('تم فتح الواتساب بنجاح');
      setTimeout(() => {
        setIsCopied(false);
        setPdfNotice(null);
      }, 3000);
    } catch (err: any) {
      console.error('WhatsApp share error:', err);
      setPdfNotice('تعذر فتح الواتساب');
      setTimeout(() => setPdfNotice(null), 3000);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleBluetoothPrint = async () => {
    try {
      if ('bluetooth' in navigator) {
        await (navigator as any).bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
        });
      } else {
        handlePrint();
      }
    } catch (e) {
      handlePrint();
    }
  };

  return (
    <div className="print-modal-overlay fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <style dangerouslySetInnerHTML={{
        __html: `
          @media print {
            @page {
              size: ${printLayout === 'a4' ? 'A4 portrait' : printLayout === 'a5' ? 'A5 portrait' : printLayout === 'thermal58' ? '58mm auto' : '80mm auto'};
              margin: ${isThermal ? '1mm 1mm 1mm 1mm' : printLayout === 'a5' ? '2mm 4mm 4mm 4mm' : '2mm 5mm 5mm 5mm'} !important;
            }
            ${printLayout === 'thermal58' ? '#printable-invoice { width: 48mm !important; max-width: 48mm !important; padding: 0 !important; font-size: 10px !important; }' : ''}
            ${printLayout === 'thermal80' ? '#printable-invoice { width: 72mm !important; max-width: 72mm !important; padding: 0 !important; font-size: 11px !important; }' : ''}
            ${printLayout === 'a5' ? '#printable-invoice { width: 100% !important; max-width: 100% !important; }' : ''}
            ${printLayout === 'a4' ? '#printable-invoice { width: 100% !important; max-width: 100% !important; }' : ''}
          }
        `
      }} />

      <div className="print-modal-card bg-white rounded-2xl border border-slate-300 shadow-2xl max-w-4xl w-full max-h-[96vh] flex flex-col overflow-hidden">
        
        {/* شريط التحكم العلوي */}
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2.5 no-print">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-700">تنسيق الطباعة:</span>
              <div className="flex items-center bg-slate-200 p-0.5 rounded-lg text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setPrintLayout('a4')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition cursor-pointer ${
                    printLayout === 'a4'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>A4</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPrintLayout('a5')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition cursor-pointer ${
                    printLayout === 'a5'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>A5</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPrintLayout('thermal80')}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md transition cursor-pointer ${
                    printLayout === 'thermal80'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>80mm</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPrintLayout('thermal58')}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md transition cursor-pointer ${
                    printLayout === 'thermal58'
                      ? 'bg-white text-emerald-800 shadow-xs ring-1 ring-emerald-500/40'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>58mm</span>
                </button>
              </div>
            </div>

            {/* قالب الفاتورة: كلاسيكي أو عصري ملون */}
            <div className="flex items-center gap-1.5 border-r border-slate-300 pr-2.5 sm:mr-1">
              <span className="text-xs font-bold text-slate-700">شكل القائمة:</span>
              <div className="flex items-center bg-slate-200 p-0.5 rounded-lg text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActiveTemplate('classic')}
                  className={`px-2 py-1 rounded-md transition cursor-pointer ${
                    activeTemplate === 'classic'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="التصميم التقليدي الكلاسيكي ذو الأختام النجمية"
                >
                  كلاسيكي
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTemplate('modern')}
                  className={`px-2 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                    activeTemplate === 'modern'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="التصميم العصري الملون المطابق للنموذج التجاري"
                >
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  <span>عصري ملون</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 border-r border-slate-300 pr-2.5 sm:mr-1">
              <label 
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition select-none shadow-2xs ${
                  sortByAlphabet
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-1 ring-emerald-500/30'
                    : 'bg-white border-slate-300 hover:border-slate-400 text-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={sortByAlphabet}
                  onChange={(e) => setSortByAlphabet(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                />
                <ArrowDownAZ className={`w-4 h-4 ${sortByAlphabet ? 'text-emerald-600' : 'text-slate-500'}`} />
                <span>ترتيب أبجدي (أ - ي)</span>
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handlePrint}
              disabled={isGeneratingPDF}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-black rounded-lg shadow-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              {isGeneratingPDF ? (
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
              <span>طباعة القائمة</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={isGeneratingPDF}
              className="px-3.5 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
            >
              {isGeneratingPDF ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-700" />
              ) : (
                <FileDown className="w-3.5 h-3.5 text-emerald-700" />
              )}
              <span>حفظ PDF</span>
            </button>

            <button
              type="button"
              onClick={handleBluetoothPrint}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
            >
              <Bluetooth className="w-3.5 h-3.5 text-amber-600" />
              <span>بلوتوث</span>
            </button>

            <button
              type="button"
              onClick={handleShareWhatsApp}
              disabled={isGeneratingPDF}
              className="px-3.5 py-1.5 text-xs font-bold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-400 rounded-lg flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              {isGeneratingPDF ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
              ) : isCopied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : null}
              <span>واتساب</span>
            </button>

            {/* زر استرجاع جزئي للقائمة */}
            {hasPermission('canReturnInvoice') && invoice.status !== 'returned' && (
              <button
                type="button"
                onClick={() => setIsPartialReturnOpen(true)}
                className="px-3.5 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                title="استرجاع جزئي لمواد محددة من هذه القائمة مع ذكر السبب"
              >
                <PackageMinus className="w-3.5 h-3.5 text-indigo-600" />
                <span>استرجاع جزئي</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {pdfNotice && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-xs font-bold text-emerald-800 flex items-center justify-between no-print animate-fadeIn">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{pdfNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setPdfNotice(null)}
              className="text-emerald-700 hover:text-emerald-900 text-[11px] underline cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        )}

        <div 
          ref={scrollContainerRef}
          className="print-invoice-scroll-area flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-200/80 flex justify-center print:p-0 print:m-0 print:bg-transparent print:overflow-visible print:block"
        >
          <div
            id="printable-invoice"
            dir="rtl"
            style={{ letterSpacing: 'normal' }}
            className={`bg-white shadow-xl text-black mx-auto transition-all print:p-0 print:m-0 print:border-none print:shadow-none print:rounded-none print:w-full print:max-w-none ${
              is58mm
                ? 'w-[230px] p-2 rounded-lg border border-slate-400 font-mono text-[10px]'
                : printLayout === 'thermal80'
                ? 'w-[320px] p-4 rounded-lg border border-slate-400 font-mono text-xs'
                : printLayout === 'a5'
                ? 'w-full max-w-[640px] p-4 sm:p-6 rounded-lg border border-slate-400 font-sans text-xs'
                : 'w-full max-w-[820px] p-5 sm:p-8 rounded-lg border border-slate-400 font-sans text-xs'
            }`}
          >

            {/* A4 and A5 Full Sheet Invoice */}
            {!isThermal ? (
              <div className="space-y-2.5 text-black leading-tight">
                {/* Header Box: Modern vs Classic */}
                {activeTemplate === 'modern' ? (
                  <ModernInvoiceHeader
                    settings={settings}
                    invoiceNumber={invoice.invoiceNumber}
                    isThermal={false}
                  />
                ) : (
                  <div className="border border-black rounded-md p-2.5 sm:p-3 relative flex flex-col items-center justify-center text-center">
                    <div className="absolute right-2.5 top-2">
                      <StarburstSeal 
                        text={settings.headerRightSealText || (settings.enableWholesale ? "جملة" : "تجزئة")} 
                      />
                    </div>
                    <div className="absolute left-2.5 top-2">
                      <StarburstSeal 
                        text={settings.headerLeftSealText || "مفرد"} 
                      />
                    </div>
                    <h1 className="text-xl sm:text-2xl font-black text-black">
                      {settings.storeName || 'المحل'}
                    </h1>
                    <div className="text-xs sm:text-sm font-bold text-black mt-1">
                      {settings.managerLabel || 'بإدارة'}: {settings.ownerName || settings.storeName} · {settings.businessSubtitle || 'تجارة عامة'}
                    </div>
                    {(settings.address || settings.phone) && (
                      <div className="text-[11px] font-semibold text-black mt-1 pt-1 border-t border-dotted border-black/40 w-full text-center">
                        {settings.address && <span>{settings.address}&nbsp;&nbsp;&nbsp;&nbsp;</span>}
                        {settings.phone && <span>هاتف: {settings.phone}</span>}
                      </div>
                    )}
                  </div>
                )}

                {/* Metadata Bar */}
                <div className="border border-black rounded-md px-3 py-1.5 flex items-center justify-between text-xs font-bold text-black flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    <span>رقم القائمة:</span>
                    <span className="font-mono text-sm underline">{invoice.invoiceNumber}</span>
                    {invoice.status === 'returned' && (
                      <span className="px-1.5 py-0.5 rounded bg-black text-white text-[10px] font-black mr-1">
                        مرتجعة بالكامل
                      </span>
                    )}
                    {(invoice.isPartiallyReturned || invoice.status === 'partially_returned') && (
                      <span className="px-1.5 py-0.5 rounded border border-black text-black text-[10px] font-black mr-1">
                        مرتجعة جزئياً
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span>التاريخ:</span>
                    <span>{dayName}</span>
                    <span className="font-mono">{dateFormatted}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span>السيد:</span>
                    <span className="font-bold underline">{invoice.customerName}</span>
                  </div>
                  {invoice.salesRepName && (invoice.showRepOnInvoice ?? true) && (
                    <div className="flex items-center gap-1.5 border-r border-black/40 pr-2">
                      <span>المندوب:</span>
                      <span className="font-bold underline">{invoice.salesRepName}</span>
                    </div>
                  )}
                </div>

                {/* Items Table */}
                <div className="border border-black rounded-md overflow-hidden">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-black text-black font-black">
                        <th className="py-1 px-2 border-l border-black text-center w-8">ت</th>
                        <th className="py-1 px-2 border-l border-black">اسم المادة</th>
                        <th className="py-1 px-2 border-l border-black text-center w-16">العدد</th>
                        <th className="py-1 px-2 border-l border-black text-center w-24">السعر</th>
                        <th className="py-1 px-2 text-center w-28">المبلغ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedItems.map((item, index) => {
                        const returnedQty = item.returnedQuantity || 0;
                        const netQty = Math.max(0, item.quantity - returnedQty);
                        return (
                          <tr key={index} className="border-b border-black/40 font-bold">
                            <td className="py-1 px-2 border-l border-black text-center font-mono">{index + 1}</td>
                            <td className="py-1 px-2 border-l border-black">
                              <div>{item.name || item.productName}</div>
                              {returnedQty > 0 && (
                                <div className="text-[10px] text-red-600 font-semibold print:text-black">
                                  [مسترجع: {returnedQty} {item.unit || 'قطعة'}]
                                </div>
                              )}
                            </td>
                            <td className="py-1 px-2 border-l border-black text-center font-mono">
                              {returnedQty > 0 ? (
                                <span>{netQty} <span className="text-[9px] text-slate-500 font-normal">({item.quantity})</span></span>
                              ) : (
                                item.isWeighted ? `${item.quantity} كغم` : item.quantity
                              )}
                            </td>
                            <td className="py-1 px-2 border-l border-black text-center font-mono">{item.unitPrice.toLocaleString()}</td>
                            <td className="py-1 px-2 text-center font-mono">{Math.round(netQty * item.unitPrice).toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Returned Items Box with Reasons */}
                {invoice.returnedItems && invoice.returnedItems.length > 0 && (
                  <div className="border border-black rounded-md p-2 bg-slate-50/70 text-xs">
                    <div className="font-black border-b border-black/30 pb-1 mb-1 flex items-center justify-between">
                      <span>سجل تفاصيل المواد المسترجعة والسبب:</span>
                      <span className="font-mono text-[11px]">
                        إجمالي المرتجع: {invoice.totalReturnedAmount?.toLocaleString()} {currencyLabel}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {invoice.returnedItems.map((ret, rIdx) => (
                        <div key={rIdx} className="flex items-center justify-between text-[11px] font-bold">
                          <div>
                            <span>{rIdx + 1}. {ret.productName}</span> ({ret.quantity} {ret.unit || 'قطعة'})
                            <span className="text-slate-700 mr-2 font-semibold">
                              السبب: <span className="underline">{ret.reason}</span>
                            </span>
                            {ret.notes && <span className="text-slate-500 mr-1 text-[10px]">({ret.notes})</span>}
                          </div>
                          <span className="font-mono text-red-600 print:text-black">
                            -{ret.refundAmount.toLocaleString()} {currencyLabel}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Summary Table */}
                <div className="flex justify-between items-start gap-3 pt-1">
                  <div className="text-[11px] text-slate-700 flex-1">
                    {settings.invoiceFooterNote && (
                      <p className="border border-slate-300 rounded p-2 bg-slate-50 font-bold">
                        {settings.invoiceFooterNote}
                      </p>
                    )}
                  </div>

                  <div className="w-64 border border-black rounded-md overflow-hidden shrink-0">
                    <table className="w-full text-right border-collapse text-xs font-bold">
                      <tbody>
                        <tr className="border-b border-black">
                          <td className="py-1 px-2 border-l border-black bg-slate-100">مجموع القائمة</td>
                          <td className="py-1 px-2 font-mono text-left">{invoiceTotal.toLocaleString()} {currencyLabel}</td>
                        </tr>
                        {invoice.totalReturnedAmount && invoice.totalReturnedAmount > 0 ? (
                          <tr className="border-b border-black bg-slate-50 text-red-700 print:text-black">
                            <td className="py-1 px-2 border-l border-black">المسترجع</td>
                            <td className="py-1 px-2 font-mono text-left">-{invoice.totalReturnedAmount.toLocaleString()} {currencyLabel}</td>
                          </tr>
                        ) : null}
                        {previousDebt > 0 && (
                          <tr className="border-b border-black">
                            <td className="py-1 px-2 border-l border-black bg-slate-100">حساب سابق</td>
                            <td className="py-1 px-2 font-mono text-left">{previousDebt.toLocaleString()} {currencyLabel}</td>
                          </tr>
                        )}
                        <tr className="border-b border-black bg-slate-50 font-black">
                          <td className="py-1 px-2 border-l border-black">المجموع الكلي</td>
                          <td className="py-1 px-2 font-mono text-left text-sm">{grandTotal.toLocaleString()} {currencyLabel}</td>
                        </tr>
                        <tr className="border-b border-black">
                          <td className="py-1 px-2 border-l border-black bg-slate-100">الواصل</td>
                          <td className="py-1 px-2 font-mono text-left text-emerald-700">{paid.toLocaleString()} {currencyLabel}</td>
                        </tr>
                        <tr className="bg-slate-100 font-black">
                          <td className="py-1 px-2 border-l border-black">الباقي</td>
                          <td className="py-1 px-2 font-mono text-left text-rose-700">{totalRemainingDebt.toLocaleString()} {currencyLabel}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Footer Signatures */}
                <div className="flex justify-between pt-4 px-4 text-xs font-bold">
                  <div>توقيع المستلم: .....................</div>
                  <div>توقيع البائع: .....................</div>
                </div>

                {/* العلامة المائية الرسمية في الزاويتين السفليتين */}
                <div className="pt-3 mt-2 border-t border-slate-300 print:border-black/30 flex items-center justify-between px-2 text-[10px] text-slate-500 select-none">
                  {/* الزاوية السفلية اليمنى */}
                  <div className="flex items-center gap-2 opacity-75 print:opacity-40">
                    <img 
                      src="/assets/aistudio/1792973910260_3946b0af.jpg" 
                      alt="شعار المفكر" 
                      className="w-6 h-6 rounded-full object-cover border border-slate-400 print:border-black shrink-0"
                    />
                    <div className="text-right leading-tight">
                      <div className="font-bold text-[10px] text-slate-800 print:text-black">برنامج المفكر المحاسبي</div>
                      <div className="text-[8px] text-slate-500 print:text-black">المفكر سمارت • نظام معتمد</div>
                    </div>
                  </div>

                  {/* نص توثيق وسطي خفيف */}
                  <div className="text-[8px] font-mono text-slate-400 print:text-black/60 text-center hidden sm:block">
                    AL-MUFAKIR SMART POS SYSTEM
                  </div>

                  {/* الزاوية السفلية اليسرى */}
                  <div className="flex items-center gap-2 opacity-75 print:opacity-40" dir="ltr">
                    <img 
                      src="/assets/aistudio/1792973910260_3946b0af.jpg" 
                      alt="Al-Mufakir Smart" 
                      className="w-6 h-6 rounded-full object-cover border border-slate-400 print:border-black shrink-0"
                    />
                    <div className="text-left leading-tight">
                      <div className="font-bold text-[10px] text-slate-800 print:text-black">Al-Mufakir Smart</div>
                      <div className="text-[8px] text-slate-500 print:text-black">POS System • Verified</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Thermal Roll Format (58mm / 80mm) */
              <div className="space-y-2 text-black font-mono leading-tight">
                {/* Header: Modern vs Classic for Thermal */}
                {activeTemplate === 'modern' ? (
                  <ModernInvoiceHeader
                    settings={settings}
                    invoiceNumber={invoice.invoiceNumber}
                    isThermal={true}
                  />
                ) : (
                  <div className="text-center border-b border-black pb-2">
                    <h1 className={`font-black ${is58mm ? 'text-sm' : 'text-base'}`}>
                      {settings.storeName || 'المحل'}
                    </h1>
                    <p className="text-[10px] mt-0.5">{settings.businessSubtitle || 'وصل مبيعات'}</p>
                    {settings.phone && <p className="text-[10px] mt-0.5">هاتف: {settings.phone}</p>}
                  </div>
                )}

                <div className="text-[10px] border-b border-dashed border-black pb-1.5 space-y-0.5">
                  <div className="flex justify-between">
                    <span>رقم القائمة:</span>
                    <span className="font-bold">{invoice.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>التاريخ:</span>
                    <span>{dateFormatted} {timeFormatted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>العميل:</span>
                    <span className="font-bold">{invoice.customerName}</span>
                  </div>
                  {invoice.salesRepName && (invoice.showRepOnInvoice ?? true) && (
                    <div className="flex justify-between">
                      <span>المندوب:</span>
                      <span className="font-bold">{invoice.salesRepName}</span>
                    </div>
                  )}
                </div>

                <table className="w-full text-right text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-black font-black">
                      <th className="py-1">المادة</th>
                      <th className="py-1 text-center w-8">ع</th>
                      <th className="py-1 text-left w-14">المجموع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedItems.map((item, index) => {
                      const returnedQty = item.returnedQuantity || 0;
                      const netQty = Math.max(0, item.quantity - returnedQty);
                      return (
                        <tr key={index} className="border-b border-dotted border-black/50">
                          <td className="py-0.5 leading-tight">
                            <div>{item.name || item.productName}</div>
                            {returnedQty > 0 && (
                              <div className="text-[8px] text-red-700 font-bold print:text-black">
                                (مسترجع: {returnedQty})
                              </div>
                            )}
                          </td>
                          <td className="py-0.5 text-center font-bold">
                            {returnedQty > 0 ? `${netQty}` : (item.isWeighted ? `${item.quantity} كغم` : item.quantity)}
                          </td>
                          <td className="py-0.5 text-left font-bold">{Math.round(netQty * item.unitPrice).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Returned Items in Thermal */}
                {invoice.returnedItems && invoice.returnedItems.length > 0 && (
                  <div className="border-t border-dashed border-black pt-1 pb-1 text-[9px] space-y-0.5">
                    <div className="font-black">المواد المسترجعة:</div>
                    {invoice.returnedItems.map((ret, rIdx) => (
                      <div key={rIdx} className="flex justify-between">
                        <span>{ret.productName} ({ret.quantity}) - {ret.reason}</span>
                        <span className="font-bold">-{ret.refundAmount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t border-black pt-1.5 space-y-1 text-[11px] font-bold">
                  <div className="flex justify-between">
                    <span>مجموع القائمة:</span>
                    <span>{invoiceTotal.toLocaleString()} {currencyLabel}</span>
                  </div>
                  {invoice.totalReturnedAmount && invoice.totalReturnedAmount > 0 ? (
                    <div className="flex justify-between text-red-700 print:text-black">
                      <span>المسترجع:</span>
                      <span>-{invoice.totalReturnedAmount.toLocaleString()} {currencyLabel}</span>
                    </div>
                  ) : null}
                  {previousDebt > 0 && (
                    <div className="flex justify-between">
                      <span>حساب سابق:</span>
                      <span>{previousDebt.toLocaleString()} {currencyLabel}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs font-black border-t border-dotted border-black pt-1">
                    <span>الإجمالي:</span>
                    <span>{grandTotal.toLocaleString()} {currencyLabel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>الواصل:</span>
                    <span>{paid.toLocaleString()} {currencyLabel}</span>
                  </div>
                  <div className="flex justify-between border-t border-black pt-1 font-black">
                    <span>المتبقي:</span>
                    <span>{totalRemainingDebt.toLocaleString()} {currencyLabel}</span>
                  </div>
                </div>

                {settings.invoiceFooterNote && (
                  <div className="text-center text-[9px] pt-2 border-t border-dotted border-black">
                    {settings.invoiceFooterNote}
                  </div>
                )}
                
                <div className="text-center text-[9px] text-slate-600 pt-1">
                  شكراً لزيارتكم
                </div>

                {/* علامة مائية في الزاويتين السفليتين للإيصال الحراري */}
                <div className="pt-2 mt-1 border-t border-dashed border-black/40 flex items-center justify-between text-[8px] text-slate-700 select-none opacity-85 print:opacity-40">
                  <div className="flex items-center gap-1">
                    <img 
                      src="/assets/aistudio/1792973910260_3946b0af.jpg" 
                      alt="المفكر" 
                      className="w-4 h-4 rounded-full object-cover border border-black/70 shrink-0"
                    />
                    <span className="font-bold text-[8px]">المفكر المحاسبي</span>
                  </div>

                  <div className="flex items-center gap-1" dir="ltr">
                    <span className="font-bold text-[8px]">Al-Mufakir</span>
                    <img 
                      src="/assets/aistudio/1792973910260_3946b0af.jpg" 
                      alt="Smart" 
                      className="w-4 h-4 rounded-full object-cover border border-black/70 shrink-0"
                    />
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>

      {/* نافذة الاسترجاع الجزئي للقائمة المفتوحة */}
      <PartialReturnModal
        invoice={invoice}
        isOpen={isPartialReturnOpen}
        onClose={() => setIsPartialReturnOpen(false)}
        onSuccess={() => {
          setIsPartialReturnOpen(false);
          onClose();
        }}
      />

    </div>
  );
};

export default InvoicePrintModal;
