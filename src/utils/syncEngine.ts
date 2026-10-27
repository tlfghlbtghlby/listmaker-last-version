export interface SyncableEntity {
  id: string | number;
  updatedAt?: string;
  createdAt?: string;
  date?: string;
  [key: string]: any;
}

function getTimestamp(entity: any): number {
  const ts = entity?.updatedAt || entity?.createdAt || entity?.date;
  if (!ts) return 0;
  const time = new Date(ts).getTime();
  return isNaN(time) ? 0 : time;
}

export function mergeProducts(localProducts: any[] = [], serverProducts: any[] = []): any[] {
  const map = new Map<string, any>();

  for (const item of serverProducts) {
    if (item && item.id !== undefined && item.id !== null) {
      map.set(String(item.id), item);
    }
  }

  for (const localItem of localProducts) {
    if (!localItem || localItem.id === undefined || localItem.id === null) continue;

    const id = String(localItem.id);
    const serverItem = map.get(id);

    if (!serverItem) {
      map.set(id, localItem);
    } else {
      const localTime = getTimestamp(localItem);
      const serverTime = getTimestamp(serverItem);

      if (localTime > serverTime) {
        map.set(id, localItem);
      } else {
        map.set(id, serverItem);
      }
    }
  }

  return Array.from(map.values());
}

export function mergeInvoices(localInvoices: any[] = [], serverInvoices: any[] = []): any[] {
  const map = new Map<string, any>();

  for (const inv of serverInvoices) {
    if (inv && inv.id !== undefined && inv.id !== null) {
      map.set(String(inv.id), inv);
    }
  }

  for (const inv of localInvoices) {
    if (inv && inv.id !== undefined && inv.id !== null) {
      map.set(String(inv.id), inv);
    }
  }

  const mergedList = Array.from(map.values());
  mergedList.sort((a, b) => {
    const timeA = getTimestamp(a);
    const timeB = getTimestamp(b);
    return timeB - timeA;
  });

  return mergedList;
}

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
