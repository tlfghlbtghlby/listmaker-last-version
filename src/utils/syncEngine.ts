// src/utils/syncEngine.ts

// واجهة تعريفية للكيانات القابلة للمزامنة
export interface SyncableEntity {
  id: string | number;
  updatedAt?: string;
  createdAt?: string;
  date?: string;
  [key: string]: any;
}

/**
 * دالة مساعدة لاستخراج التوقيت بالملي ثانية بأمان
 */
function getTimestamp(entity: any): number {
  const ts = entity?.updatedAt || entity?.createdAt || entity?.date;
  if (!ts) return 0;
  const time = new Date(ts).getTime();
  return isNaN(time) ? 0 : time;
}

/**
 * 1. دمج الفواتير:
 * جمع فواتير الهاتف والكمبيوتر معاً في قائمة واحدة دون مسح أي فاتورة،
 * ومنع التكرار بالاعتماد على معرّف الفاتورة (id)، مع الترتيب التنازلي.
 */
export function mergeInvoices(localInvoices: any[] = [], serverInvoices: any[] = []): any[] {
  const map = new Map<string, any>();

  // إضافة فواتير السيرفر أولاً
  for (const inv of serverInvoices) {
    if (inv && inv.id !== undefined && inv.id !== null) {
      map.set(String(inv.id), inv);
    }
  }

  // إضافة فواتير الكمبيوتر المحلي (إضافة الفواتير الجديدة دون حذف القديمة)
  for (const inv of localInvoices) {
    if (inv && inv.id !== undefined && inv.id !== null) {
      map.set(String(inv.id), inv);
    }
  }

  // ترتيب الفواتير من الأحدث إلى الأقدم
  const mergedList = Array.from(map.values());
  mergedList.sort((a, b) => {
    const timeA = getTimestamp(a);
    const timeB = getTimestamp(b);
    return timeB - timeA;
  });

  return mergedList;
}

/**
 * 2. دمج المنتجات:
 * في حال وجود المادة في الطرفين، يتم فحص تاريخ آخر تعديل (updatedAt).
 * إذا كان تعديل الكمبيوتر أحدث يُعتمد، وإذا كان تعديل الهاتف أحدث يُعتمد.
 * أي مادة جديدة أضيفت في أحد الطرفين يتم إضافتها تلقائياً.
 */
export function mergeProducts(localProducts: any[] = [], serverProducts: any[] = []): any[] {
  const map = new Map<string, any>();

  // 1. تسجيل منتجات السيرفر
  for (const item of serverProducts) {
    if (item && item.id !== undefined && item.id !== null) {
      map.set(String(item.id), item);
    }
  }

  // 2. مقارنة منتجات الجهاز المحلي
  for (const localItem of localProducts) {
    if (!localItem || localItem.id === undefined || localItem.id === null) continue;

    const id = String(localItem.id);
    const serverItem = map.get(id);

    if (!serverItem) {
      // مادة جديدة أضيفت محلياً أثناء انقطاع الإنترنت -> تُعتمد
      map.set(id, localItem);
    } else {
      // المادة موجودة في الطرفين: المقارنة بالتاريخ
      const localTime = getTimestamp(localItem);
      const serverTime = getTimestamp(serverItem);

      if (localTime > serverTime) {
        // الكمبيوتر عدّلها بعد الهاتف -> نعتمد تعديل الكمبيوتر
        map.set(id, localItem);
      } else {
        // الهاتف عدّلها بعد الكمبيوتر -> نعتمد تعديل السيرفر
        map.set(id, serverItem);
      }
    }
  }

  return Array.from(map.values());
}

/**
 * 3. دمج الورديات (Shifts):
 * دمج سجلات الورديات المفتوحة والمغلقة دون تكرار مع ترتيبها زمنياً.
 */
export function mergeShifts(localShifts: any[] = [], serverShifts: any[] = []): any[] {
  const map = new Map<string, any>();

  for (const shift of serverShifts) {
    if (shift && shift.id) {
      map.set(String(shift.id), shift);
    }
  }

  for (const shift of localShifts) {
    if (shift && shift.id) {
      const existing = map.get(String(shift.id));
      if (!existing) {
        map.set(String(shift.id), shift);
      } else {
        // إذا أغلقت الوردية محلياً وكانت مفتوحة في السيرفر تُعتمد المغلقة
        if (shift.status === 'closed' && existing.status === 'active') {
          map.set(String(shift.id), shift);
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const timeA = new Date(a.startTime || 0).getTime();
    const timeB = new Date(b.startTime || 0).getTime();
    return timeB - timeA;
  });
}
