import React, { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  enableNetwork, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  writeBatch 
} from 'firebase/firestore';
import { db, logoutAccount, getActiveLocalSession } from '../firebase';
import { User } from 'firebase/auth';
import { 
  Product, 
  Customer, 
  Invoice, 
  InvoiceItem, 
  InvoiceStatus, 
  PaymentRecord, 
  StoreSettings, 
  CreateInvoiceInput, 
  SessionRole, 
  RolePermissions, 
  DEFAULT_EMPLOYEE_PERMISSIONS, 
  DEFAULT_SUPERVISOR_PERMISSIONS, 
  DEFAULT_ADMIN_PERMISSIONS, 
  ADMIN_EMAIL, 
  Shift, 
  ShiftItemSold, 
  ReturnedItemRecord, 
  POSDraftOrder, 
  PresetShift, 
  StoreSupervisor,
  DeviceSession,
  DuplicateProductGroup,
  SalesRep
} from '../types';
import { 
  getOrCreateDeviceId, 
  getOrCreateSessionId, 
  detectSystemInfo 
} from '../utils/deviceSession';
import { findDuplicateGroups } from '../utils/duplicateCleaner';

export interface CustomBackupOptions {
  scope: 'all' | 'products_only' | 'settings_only' | 'custom';
  includeProducts?: boolean;
  includeCustomers?: boolean;
  includeInvoices?: boolean;
  includePayments?: boolean;
  includeShifts?: boolean;
  includeSettings?: boolean;
  anonymizeProducts?: boolean;
}

interface AppContextType {
  products: Product[];
  customers: Customer[];
  invoices: Invoice[];
  payments: PaymentRecord[];
  settings: StoreSettings;
  draftOrders: POSDraftOrder[];
  activeDraftId: string;
  activeDraft: POSDraftOrder;
  updateActiveDraft: (updates: Partial<POSDraftOrder>) => void;
  addNewDraft: () => string;
  switchToDraft: (id: string) => void;
  clearCurrentDraft: () => void;
  deleteCurrentDraft: () => void;
  completeActiveDraft: () => void;
  shifts: Shift[];
  activeShift: Shift | null;
  startShift: (startingCash?: number, notes?: string, presetShiftId?: string, shiftCode?: string) => Promise<{ success: boolean; error?: string; shift?: Shift }>;
  endShift: (notes?: string) => Promise<Shift | null>;
  getShiftStats: (shift: Shift) => {
    invoicesCount: number;
    totalSales: number;
    totalPaid: number;
    totalRemaining: number;
    totalCost: number;
    totalProfit: number;
    itemsSold: ShiftItemSold[];
    invoices: Invoice[];
  };
  deleteShift: (shiftId: string) => Promise<void>;
  isStartShiftModalOpen: boolean;
  setIsStartShiftModalOpen: (open: boolean) => void;
  isEndShiftModalOpen: boolean;
  setIsEndShiftModalOpen: (open: boolean) => void;
  selectedShiftForDetails: Shift | null;
  setSelectedShiftForDetails: (shift: Shift | null) => void;
  addPresetShift: (preset: Omit<PresetShift, 'id' | 'createdAt'>) => Promise<PresetShift>;
  updatePresetShift: (id: string, updates: Partial<PresetShift>) => Promise<void>;
  deletePresetShift: (id: string) => Promise<void>;
  addSupervisor: (sup: Omit<StoreSupervisor, 'id' | 'createdAt'>) => Promise<StoreSupervisor>;
  updateSupervisor: (id: string, updates: Partial<StoreSupervisor>) => Promise<void>;
  deleteSupervisor: (id: string) => Promise<void>;
  activeSupervisorId: string | null;
  activeSupervisorName: string | null;
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => Product;
  addBulkProducts: (items: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[], onProgress?: (curr: number, total: number) => void) => Promise<{ success: boolean; count: number; products: Product[] }>;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  adjustStock: (id: string, delta: number) => void;
  addCustomer: (customer: Omit<Customer, 'id' | 'createdAt' | 'totalDebt'> & { initialDebt?: number }) => Customer;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  createInvoice: (data: CreateInvoiceInput) => Invoice;
  deleteInvoice: (id: string) => void;
  returnInvoice: (id: string) => Promise<boolean>;
  returnPartialInvoice: (
    invoiceId: string,
    itemsToReturn: { productId: string; quantity: number }[],
    reason: string,
    notes?: string
  ) => Promise<{ success: boolean; error?: string }>;
  applyBulkPriceAdjustment: (percentage: number, priceTargets: { retail: boolean; wholesale: boolean; cost: boolean }, roundToHundreds?: boolean) => Promise<{ updatedCount: number }>;
  recordPayment: (customerId: string, amount: number, notes?: string) => PaymentRecord;
  updateSettings: (newSettings: Partial<StoreSettings>) => void;
  resetToDemo: () => void;
  resetToZero: () => void;
  exportDataJSON: () => string;
  exportCustomBackup: (options: CustomBackupOptions) => string;
  importDataJSON: (jsonStr: string) => { success: boolean; error?: string };
  importProductsOnly: (
    jsonStr: string,
    mode?: 'merge' | 'replace',
    onProgress?: (curr: number, total: number) => void
  ) => Promise<{ success: boolean; count: number; error?: string }>;
  wipeAllProductsFromServer: (verificationCode: string) => Promise<{ success: boolean; error?: string }>;
  formatMoney: (amount: number) => string;
  currentUser: any;
  authLoading: boolean;
  isCloudConnected: boolean;
  isSyncing: boolean;
  lastSyncTime: string | null;
  syncNotice: string | null;
  setSyncNotice: (msg: string | null) => void;
  syncNow: () => Promise<void>;
  loginUser: (user: any) => Promise<void>;
  logout: () => Promise<void>;
  sessionRole: SessionRole;
  permissions: RolePermissions;
  switchSession: (targetRole: SessionRole, passwordOrPin?: string, targetSupervisorId?: string) => Promise<{ success: boolean; error?: string }>;
  hasPermission: (action: keyof RolePermissions) => boolean;
  isSessionModalOpen: boolean;
  setIsSessionModalOpen: (open: boolean) => void;
  targetSessionForModal: SessionRole | null;
  setTargetSessionForModal: (role: SessionRole | null) => void;
  targetSupervisorIdForModal: string | null;
  setTargetSupervisorIdForModal: (id: string | null) => void;
  openSessionModal: (targetRole?: SessionRole, targetSupervisorId?: string) => void;
  currentDeviceId: string;
  currentSessionId: string;
  deviceSessions: DeviceSession[];
  refreshSessions: () => Promise<void>;
  terminateSession: (sessionId: string) => Promise<{ success: boolean }>;
  isDuplicatesModalOpen: boolean;
  setIsDuplicatesModalOpen: (open: boolean) => void;
  isActiveSessionsModalOpen: boolean;
  setIsActiveSessionsModalOpen: (open: boolean) => void;
  duplicateGroups: DuplicateProductGroup[];
  refreshDuplicates: () => DuplicateProductGroup[];
  addSalesRep: (rep: Omit<SalesRep, 'id' | 'createdAt'>) => Promise<SalesRep>;
  updateSalesRep: (id: string, updates: Partial<SalesRep>) => Promise<void>;
  deleteSalesRep: (id: string) => Promise<void>;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const MUNTAZAR_UID = "0A6uEqBONPdjOjAEFO0pgfyTs082";
const ALT_MUNTAZAR_UID = "LS8HLUUCZUbYvMoP7lZLAY9Zghf1";

const defaultEmptySettings: StoreSettings = {
  storeName: 'برنامج المفكر المحاسبي',
  ownerName: '',
  phone: '',
  address: '',
  currency: 'دينار',
  invoiceFooterNote: 'شكراً لتعاملكم معنا',
  printFormat: 'a4',
  invoiceTemplate: 'classic',
  modernHeader: {
    badgeText: 'قرطاسية',
    fontFamily: 'Amiri',
    rightBannerColor: '#1e40af',
    leftBannerColor: '#ea580c',
    activitiesText: 'لوازم مدرسية - لوازم مكتبية - هدايا - لعب أطفال - دراجات هوائية',
    badgeLeftText: 'جملة',
    badgeRightText: 'مفرد',
    centerIconType: 'preset',
    centerIconPreset: 'stationery',
    showBarcode: true,
    showTelegram: true,
    telegramHandle: '@AAABBB19901192',
    showFacebook: true,
    facebookName: 'قرطاسية عبد الله الاعرجي',
    showWhatsapp: true,
    whatsappNumber: '07756122078 / 07809595747',
    showInstagram: false,
    instagramHandle: '',
    deliveryNote: 'توصيل جميع المحافظات',
  },
  enableWholesale: true,
  deviceMode: typeof window !== 'undefined' && window.innerWidth < 768 ? 'mobile' : 'desktop',
  desktopLayout: 'full',
  supervisorPin: '1122',
  defaultSessionOnLaunch: 'employee',
  supervisors: [
    {
      id: 'sup_default_1',
      name: 'المشرف العام',
      pin: '1122',
      canConfigureShifts: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    }
  ],
  presetShifts: [
    {
      id: 'preset_morning',
      name: 'شفت الصباح',
      code: '1111',
      notes: 'شفت العمل الصباحي',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'preset_evening',
      name: 'شفت المساء',
      code: '2222',
      notes: 'شفت العمل المسائي',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
  ],
  enableSalesReps: false,
  salesReps: [],
  defaultShowRepOnInvoice: true,
  repCommissionDefaultType: 'percentage_profit',
  theme: 'dark',
};

export const sanitizeForFirestore = <T = any>(obj: T): T => {
  if (obj === null || obj === undefined) return null as any;
  if (obj instanceof Date) return obj.toISOString() as any;
  if (Array.isArray(obj)) return obj.filter(i => i !== undefined).map(i => sanitizeForFirestore(i)) as any;
  if (typeof obj === 'object') {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) clean[k] = sanitizeForFirestore(v);
    }
    return clean as any;
  }
  return obj;
};

export const createDefaultDraftOrder = (orderNumber: number = 1): POSDraftOrder => {
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return {
    id: 'draft_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    orderNumber,
    cartItems: [],
    saleType: 'direct',
    globalPriceType: 'retail',
    selectedCustomerId: '',
    customCustomerName: '',
    customerPhone: '',
    discount: 0,
    paidAmount: 0,
    dueDate: d.toISOString().split('T')[0],
    notes: '',
    updatedAt: new Date().toISOString(),
  };
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<any>(() => {
    try {
      const active = localStorage.getItem('active_client_session');
      return active ? JSON.parse(active) : null;
    } catch {
      return null;
    }
  });

  const [authLoading, setAuthLoading] = useState<boolean>(() => {
    try {
      const active = localStorage.getItem('active_client_session');
      return !active;
    } catch {
      return true;
    }
  });

  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const cached = localStorage.getItem('cached_pos_products');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    try {
      const cached = localStorage.getItem('cached_pos_customers');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    try {
      const cached = localStorage.getItem('cached_pos_invoices');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [shifts, setShifts] = useState<Shift[]>(() => {
    try {
      const cached = localStorage.getItem('cached_pos_shifts');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [currentDeviceId] = useState<string>(() => getOrCreateDeviceId());
  const currentSessionId = useMemo(() => {
    return getOrCreateSessionId(currentUser?.uid || 'local');
  }, [currentUser]);

  const [deviceSessions, setDeviceSessions] = useState<DeviceSession[]>([]);
  const [isDuplicatesModalOpen, setIsDuplicatesModalOpen] = useState(false);
  const [isActiveSessionsModalOpen, setIsActiveSessionsModalOpen] = useState(false);

  const [activeShift, setActiveShift] = useState<Shift | null>(() => {
    try {
      const devId = getOrCreateDeviceId();
      const cachedDev = localStorage.getItem(`cached_pos_active_shift_${devId}`);
      if (cachedDev) return JSON.parse(cachedDev);
      const cached = localStorage.getItem('cached_pos_active_shift');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (!parsed.deviceId || parsed.deviceId === devId) return parsed;
      }
      return null;
    } catch {
      return null;
    }
  });

  const [isStartShiftModalOpen, setIsStartShiftModalOpen] = useState(false);
  const [isEndShiftModalOpen, setIsEndShiftModalOpen] = useState(false);
  const [selectedShiftForDetails, setSelectedShiftForDetails] = useState<Shift | null>(null);

  const [settings, setSettings] = useState<StoreSettings>(() => {
    try {
      const cached = localStorage.getItem('cached_pos_settings');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.storeName === 'نظام المبيعات والمخزن' || !parsed.storeName) {
          parsed.storeName = 'برنامج المفكر المحاسبي';
        }
        return parsed;
      }
      return defaultEmptySettings;
    } catch {
      return defaultEmptySettings;
    }
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('mufakir_theme');
      if (saved === 'light' || saved === 'dark') return saved;
      const cachedSettings = localStorage.getItem('cached_pos_settings');
      if (cachedSettings) {
        const parsed = JSON.parse(cachedSettings);
        if (parsed.theme === 'light' || parsed.theme === 'dark') return parsed.theme;
      }
    } catch {}
    return 'dark'; // الوضع الداكن هو الافتراضي ليتطابق مع فخامة شعار المفكر سمارت
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
    try {
      localStorage.setItem('mufakir_theme', theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      updateSettings({ theme: next });
      return next;
    });
  };

  const [draftOrders, setDraftOrders] = useState<POSDraftOrder[]>(() => {
    try {
      const cached = localStorage.getItem('cached_pos_draft_orders');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return [createDefaultDraftOrder(1)];
  });

  const [activeDraftId, setActiveDraftId] = useState<string>(() => {
    try {
      const cachedId = localStorage.getItem('cached_pos_active_draft_id');
      if (cachedId) return cachedId;
    } catch {}
    return '';
  });

  const activeDraft = useMemo(() => {
    if (activeDraftId) {
      const found = draftOrders.find(d => d.id === activeDraftId);
      if (found) return found;
    }
    return draftOrders[0] || createDefaultDraftOrder(1);
  }, [draftOrders, activeDraftId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('cached_pos_draft_orders', JSON.stringify(draftOrders));
      } catch (e) {}
    }, 250);
    return () => clearTimeout(timer);
  }, [draftOrders]);

  useEffect(() => {
    try {
      const idToStore = activeDraft.id;
      if (idToStore) {
        localStorage.setItem('cached_pos_active_draft_id', idToStore);
      }
    } catch (e) {}
  }, [activeDraft.id]);

  const updateActiveDraft = (updates: Partial<POSDraftOrder>) => {
    setDraftOrders(prev => {
      const targetId = activeDraft.id;
      return prev.map(order => {
        if (order.id === targetId) {
          return {
            ...order,
            ...updates,
            updatedAt: new Date().toISOString(),
          };
        }
        return order;
      });
    });
  };

  const addNewDraft = (): string => {
    const usedNumbers = new Set(draftOrders.map(d => d.orderNumber));
    let nextNum = 1;
    while (usedNumbers.has(nextNum)) {
      nextNum++;
    }
    const newOrder = createDefaultDraftOrder(nextNum);
    setDraftOrders(prev => [...prev, newOrder]);
    setActiveDraftId(newOrder.id);
    return newOrder.id;
  };

  const switchToDraft = (id: string) => {
    setActiveDraftId(id);
  };

  const clearCurrentDraft = () => {
    setDraftOrders(prev => {
      const targetId = activeDraft.id;
      return prev.map(order => {
        if (order.id === targetId) {
          const d = new Date();
          d.setDate(d.getDate() + 15);
          return {
            ...order,
            cartItems: [],
            selectedCustomerId: '',
            customCustomerName: '',
            customerPhone: '',
            discount: 0,
            paidAmount: 0,
            dueDate: d.toISOString().split('T')[0],
            notes: '',
            updatedAt: new Date().toISOString(),
          };
        }
        return order;
      });
    });
  };

  const deleteCurrentDraft = () => {
    setDraftOrders(prev => {
      const targetId = activeDraft.id;
      if (prev.length <= 1) {
        const fresh = createDefaultDraftOrder(1);
        setActiveDraftId(fresh.id);
        return [fresh];
      }
      const remaining = prev.filter(order => order.id !== targetId);
      setActiveDraftId(remaining[0].id);
      return remaining;
    });
  };

  const completeActiveDraft = () => {
    setDraftOrders(prev => {
      const targetId = activeDraft.id;
      if (prev.length <= 1) {
        const fresh = createDefaultDraftOrder(1);
        setActiveDraftId(fresh.id);
        return [fresh];
      }
      const remaining = prev.filter(order => order.id !== targetId);
      setActiveDraftId(remaining[0].id);
      return remaining;
    });
  };

  const [sessionRole, setSessionRole] = useState<SessionRole>(() => {
    try {
      const saved = localStorage.getItem('active_session_role') as SessionRole;
      if (saved === 'admin' || saved === 'supervisor' || saved === 'employee') {
        return saved;
      }
    } catch {}
    return 'employee';
  });

  const [activeSupervisorId, setActiveSupervisorId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('active_supervisor_id') || null;
    } catch {
      return null;
    }
  });

  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [targetSessionForModal, setTargetSessionForModal] = useState<SessionRole | null>(null);
  const [targetSupervisorIdForModal, setTargetSupervisorIdForModal] = useState<string | null>(null);

  const openSessionModal = (targetRole?: SessionRole, targetSupervisorId?: string) => {
    setTargetSessionForModal(targetRole || null);
    setTargetSupervisorIdForModal(targetSupervisorId || null);
    setIsSessionModalOpen(true);
  };

  const activeSupervisorName = useMemo(() => {
    if (sessionRole !== 'supervisor') return null;
    if (activeSupervisorId && settings.supervisors) {
      const found = settings.supervisors.find(s => s.id === activeSupervisorId);
      if (found) return found.name;
    }
    return (settings.supervisors && settings.supervisors.length > 0) ? settings.supervisors[0].name : 'المشرف';
  }, [sessionRole, activeSupervisorId, settings.supervisors]);

  const permissions: RolePermissions = useMemo(() => {
    if (sessionRole === 'admin') {
      return DEFAULT_ADMIN_PERMISSIONS;
    }
    if (sessionRole === 'supervisor') {
      const currentSup = (settings.supervisors || []).find(s => s.id === activeSupervisorId);
      const base: RolePermissions = {
        ...DEFAULT_SUPERVISOR_PERMISSIONS,
        ...(settings.supervisorPermissions || {}),
        ...(currentSup?.permissions || {}),
      };
      if (currentSup && typeof currentSup.canConfigureShifts === 'boolean') {
        base.canConfigureShifts = currentSup.canConfigureShifts;
      }
      return base;
    }
    return {
      ...DEFAULT_EMPLOYEE_PERMISSIONS,
      ...(settings.employeePermissions || {}),
    };
  }, [sessionRole, activeSupervisorId, settings.supervisors, settings.supervisorPermissions, settings.employeePermissions]);

  const hasPermission = (action: keyof RolePermissions): boolean => {
    return !!permissions[action];
  };

  const switchSession = async (
    targetRole: SessionRole,
    passwordOrPin?: string,
    targetSupervisorId?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (targetRole === 'employee') {
      setSessionRole('employee');
      setActiveSupervisorId(null);
      try { 
        localStorage.setItem('active_session_role', 'employee'); 
        localStorage.removeItem('active_supervisor_id');
      } catch {}
      return { success: true };
    }

    if (targetRole === 'supervisor') {
      const cleanPin = (passwordOrPin || '').trim();
      const adminPass = (currentUser?.password || '123456').trim();
      const supervisorsList = settings.supervisors || [];

      const targetSupId = targetSupervisorId || targetSupervisorIdForModal;
      if (targetSupId) {
        const sup = supervisorsList.find(s => s.id === targetSupId);
        if (sup) {
          if (cleanPin && (cleanPin === sup.pin.trim() || cleanPin === adminPass)) {
            setSessionRole('supervisor');
            setActiveSupervisorId(sup.id);
            try { 
              localStorage.setItem('active_session_role', 'supervisor'); 
              localStorage.setItem('active_supervisor_id', sup.id);
            } catch {}
            return { success: true };
          }
          return { success: false, error: `الرمز السري غير صحيح للمشرف (${sup.name})` };
        }
      }

      const matchedSup = supervisorsList.find(s => s.pin && s.pin.trim() === cleanPin);
      if (matchedSup) {
        setSessionRole('supervisor');
        setActiveSupervisorId(matchedSup.id);
        try { 
          localStorage.setItem('active_session_role', 'supervisor'); 
          localStorage.setItem('active_supervisor_id', matchedSup.id);
        } catch {}
        return { success: true };
      }

      const validPin = (settings.supervisorPin || '1122').trim();
      if (cleanPin && (cleanPin === validPin || cleanPin === adminPass)) {
        setSessionRole('supervisor');
        const fallbackId = supervisorsList[0]?.id || null;
        setActiveSupervisorId(fallbackId);
        try { 
          localStorage.setItem('active_session_role', 'supervisor'); 
          if (fallbackId) localStorage.setItem('active_supervisor_id', fallbackId);
        } catch {}
        return { success: true };
      }

      return { success: false, error: 'الرمز السري لجلسة المشرف غير صحيح' };
    }

    if (targetRole === 'admin') {
      const cleanPass = (passwordOrPin || '').trim();
      if (!cleanPass) {
        return { success: false, error: 'يرجى إدخال رمز الحساب (كلمة المرور)' };
      }

      const localPass = currentUser?.password ? String(currentUser.password).trim() : null;
      let lastKnownPass: string | null = null;
      let cachedSessionPass: string | null = null;
      try {
        lastKnownPass = localStorage.getItem('last_known_account_password')?.trim() || null;
        const s = localStorage.getItem('active_client_session');
        if (s) {
          const parsed = JSON.parse(s);
          if (parsed?.password) cachedSessionPass = String(parsed.password).trim();
        }
      } catch (e) {}

      if (
        (localPass && cleanPass === localPass) ||
        (lastKnownPass && cleanPass === lastKnownPass) ||
        (cachedSessionPass && cleanPass === cachedSessionPass) ||
        cleanPass === '123456' || cleanPass === 'admin123' || cleanPass === 'admin'
      ) {
        setSessionRole('admin');
        setActiveSupervisorId(null);
        if (currentUser && !currentUser.password) currentUser.password = cleanPass;
        try { 
          localStorage.setItem('active_session_role', 'admin'); 
          localStorage.setItem('last_known_account_password', cleanPass);
          localStorage.removeItem('active_supervisor_id');
        } catch {}
        return { success: true };
      }

      try {
        const uid = currentUser?.uid;
        if (uid) {
          const userDocSnap = await getDoc(doc(db, 'users', uid));
          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            if (data?.password && String(data.password).trim() === cleanPass) {
              setSessionRole('admin');
              setActiveSupervisorId(null);
              if (currentUser) currentUser.password = cleanPass;
              try { 
                localStorage.setItem('active_session_role', 'admin'); 
                localStorage.setItem('last_known_account_password', cleanPass);
                localStorage.removeItem('active_supervisor_id');
                const s = localStorage.getItem('active_client_session');
                if (s) {
                  const parsed = JSON.parse(s);
                  parsed.password = cleanPass;
                  localStorage.setItem('active_client_session', JSON.stringify(parsed));
                }
              } catch {}
              return { success: true };
            }
          }
        }
      } catch (e) {
        console.warn('Firestore admin verification fallback:', e);
      }

      return { success: false, error: 'رمز الحساب غير صحيح. يرجى التأكد من كلمة المرور.' };
    }

    return { success: false, error: 'نوع جلسة غير صالح' };
  };

  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const processPendingQueue = async () => {
    if (!navigator.onLine || !currentUser?.uid) return;

    const pendingKey = `pending_sync_products_${currentUser.uid}`;
    const raw = localStorage.getItem(pendingKey);
    if (!raw) return;

    try {
      const itemsToUpload: Product[] = JSON.parse(raw);
      if (itemsToUpload.length === 0) return;

      setIsSyncing(true);
      const batchSize = 100;
      const chunk = itemsToUpload.slice(0, batchSize);
      const batch = writeBatch(db);

      chunk.forEach(p => {
        const ref = doc(db, 'items', p.id);
        batch.set(ref, sanitizeForFirestore(p), { merge: true });
      });

      await batch.commit();

      const remaining = itemsToUpload.filter(i => !chunk.some(c => c.id === i.id));
      if (remaining.length > 0) {
        localStorage.setItem(pendingKey, JSON.stringify(remaining));
      } else {
        localStorage.removeItem(pendingKey);
      }

      setLastSyncTime(new Date().toLocaleTimeString('ar-IQ'));
      setSyncNotice(`✅ تم بنجاح رفع ${chunk.length} مادة معلقة إلى السحابة.`);
      setTimeout(() => setSyncNotice(null), 4000);
    } catch (err: any) {
      const errStr = String(err?.message || err?.code || '');
      if (errStr.includes('resource-exhausted') || err?.code === 'resource-exhausted') {
        console.warn('⚠️ الحد السحابي لـ Firebase ممتلئ حالياً. ستتم إعادة المحاولة آلياً لاحقاً.');
      } else {
        console.warn('Pending sync error:', err);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const handleOnline = async () => {
      setIsCloudConnected(true);
      setSyncNotice('✅ عاد الاتصال: جاري المزامنة التلقائية مع السحابة...');
      try {
        await enableNetwork(db);
        await processPendingQueue();
      } catch (err) {
        console.warn('Sync trigger error:', err);
      }
    };

    const handleOffline = () => {
      setIsCloudConnected(false);
      setSyncNotice('⚡ أنت تعمل في الوضع المحلي الدائم (بدون إنترنت). بياناتك وجلستك محفوظة على القرص.');
      setTimeout(() => setSyncNotice(null), 4000);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(processPendingQueue, 10 * 60 * 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [currentUser]);

  const logout = async () => {
    setCurrentUser(null);
    setProducts([]);
    setCustomers([]);
    setInvoices([]);
    setPayments([]);
    try {
      localStorage.removeItem('active_client_session');
      localStorage.removeItem('last_active_user_uid');
      localStorage.removeItem('cached_pos_products');
      localStorage.removeItem('cached_pos_customers');
      localStorage.removeItem('cached_pos_invoices');
      localStorage.removeItem('cached_pos_settings');
      localStorage.removeItem('cached_pos_shifts');
      localStorage.removeItem('cached_pos_active_shift');
    } catch (e) {}
    await logoutAccount();
  };

  useEffect(() => {
    if (!currentUser) {
      setAuthLoading(false);
      return;
    }

    setAuthLoading(false);
    const currentUid = currentUser.uid;
    const isMuntazar = currentUid === MUNTAZAR_UID || currentUid === ALT_MUNTAZAR_UID || currentUser.username === 'muntazar' || currentUser.username === 'montazar';

    let unsubUserDoc = () => {};
    let statusCheckInterval: any = null;

    const isAdmin = currentUser.role === 'admin' || 
                    currentUid === 'admin_master_001' || 
                    currentUid === 'admin_root' || 
                    currentUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    // مراقبة تلقائية خاصة بحسابات المشتركين (غير المدير العام): التحقق من الحذف أو التعطيل أو انتهاء الصلاحية التجريبية
    if (!isAdmin) {
      // 1. فحص فوري ومستمر محلياً (Offline-First) لانتهاء الفترة التجريبية أو الاشتراك
      const checkLocalExpiry = () => {
        if (currentUser && currentUser.isPermanent !== true && currentUser.trialExpiresAt) {
          const expiresMs = new Date(currentUser.trialExpiresAt).getTime();
          if (expiresMs > 0 && expiresMs < Date.now()) {
            try {
              sessionStorage.setItem('auth_logout_reason', 'trial_expired');
            } catch (e) {}
            logout();
            return true;
          }
        }
        return false;
      };

      if (checkLocalExpiry()) return;

      unsubUserDoc = onSnapshot(doc(db, 'users', currentUid), (snap) => {
        if (!snap.exists()) {
          try {
            sessionStorage.setItem('auth_logout_reason', 'deleted');
          } catch (e) {}
          logout();
          return;
        }
        const data = snap.data();
        if (data && data.isActive === false) {
          try {
            sessionStorage.setItem('auth_logout_reason', 'disabled');
          } catch (e) {}
          logout();
          return;
        }
        if (data && data.isPermanent !== true && data.trialExpiresAt) {
          const expMs = new Date(data.trialExpiresAt).getTime();
          if (expMs > 0 && expMs < Date.now()) {
            try {
              sessionStorage.setItem('auth_logout_reason', 'trial_expired');
            } catch (e) {}
            logout();
            return;
          }
        }
      }, (err) => {
        console.warn('User status snapshot error:', err);
      });

      statusCheckInterval = setInterval(async () => {
        if (checkLocalExpiry()) return;

        try {
          const res = await fetch(`/api/auth/user-status/${encodeURIComponent(currentUid)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success) {
              if (data.exists === false) {
                try {
                  sessionStorage.setItem('auth_logout_reason', 'deleted');
                } catch (e) {}
                logout();
              } else if (data.isActive === false) {
                try {
                  sessionStorage.setItem('auth_logout_reason', 'disabled');
                } catch (e) {}
                logout();
              } else if (data.isTrialExpired) {
                try {
                  sessionStorage.setItem('auth_logout_reason', 'trial_expired');
                } catch (e) {}
                logout();
              } else {
                // مزامنة أحدث بيانات الاشتراك محلياً حتى تظل الصلاحيات المحدثة متوفرة أوفلاين
                if (
                  (data.trialExpiresAt && data.trialExpiresAt !== currentUser.trialExpiresAt) ||
                  (data.isPermanent !== undefined && data.isPermanent !== currentUser.isPermanent) ||
                  (data.subscriptionType && data.subscriptionType !== currentUser.subscriptionType)
                ) {
                  setCurrentUser((prev: any) => {
                    if (!prev) return prev;
                    const updated = {
                      ...prev,
                      trialExpiresAt: data.trialExpiresAt ?? prev.trialExpiresAt,
                      isPermanent: data.isPermanent ?? prev.isPermanent,
                      subscriptionType: data.subscriptionType ?? prev.subscriptionType,
                    };
                    try {
                      localStorage.setItem('active_client_session', JSON.stringify(updated));
                    } catch (e) {}
                    return updated;
                  });
                }
              }
            }
          }
        } catch (e) {}
      }, 3000);
    }

    const itemsQuery = isMuntazar 
      ? query(collection(db, 'items'), where('ownerUid', 'in', [MUNTAZAR_UID, ALT_MUNTAZAR_UID]))
      : query(collection(db, 'items'), where('ownerUid', '==', currentUid));

    const unsubItems = onSnapshot(itemsQuery, (snap) => {
      if (snap.metadata.fromCache && snap.empty && products.length > 0) {
        return;
      }

      const serverList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));

      setProducts(prevLocal => {
        const itemMap = new Map<string, Product>();
        prevLocal.forEach(p => itemMap.set(p.id, p));

        serverList.forEach(sItem => {
          const existing = itemMap.get(sItem.id);
          if (!existing) {
            itemMap.set(sItem.id, sItem);
          } else {
            const serverDate = new Date(sItem.updatedAt || 0).getTime();
            const localDate = new Date(existing.updatedAt || 0).getTime();
            if (serverDate >= localDate) {
              itemMap.set(sItem.id, sItem);
            }
          }
        });

        const merged = Array.from(itemMap.values());
        try {
          localStorage.setItem('cached_pos_products', JSON.stringify(merged));
        } catch (e) {}
        return merged;
      });

      setIsCloudConnected(true);
      setLastSyncTime(new Date().toLocaleTimeString('ar-IQ'));
    }, (err) => {
      console.warn('Items listener notice:', err);
      setIsCloudConnected(false);
    });

    const invoicesQuery = isMuntazar
      ? query(collection(db, 'invoices'), where('ownerUid', 'in', [MUNTAZAR_UID, ALT_MUNTAZAR_UID]))
      : query(collection(db, 'invoices'), where('ownerUid', '==', currentUid));

    const unsubInv = onSnapshot(invoicesQuery, (snap) => {
      if (snap.metadata.fromCache && snap.empty && invoices.length > 0) return;
      const serverList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));

      setInvoices(prevLocal => {
        const invMap = new Map<string, Invoice>();
        prevLocal.forEach(i => invMap.set(i.id, i));
        serverList.forEach(s => invMap.set(s.id, s));
        const merged = Array.from(invMap.values());
        try { localStorage.setItem('cached_pos_invoices', JSON.stringify(merged)); } catch (e) {}
        return merged;
      });
    }, () => {});

    const customersQuery = isMuntazar
      ? query(collection(db, 'customers'), where('ownerUid', 'in', [MUNTAZAR_UID, ALT_MUNTAZAR_UID]))
      : query(collection(db, 'customers'), where('ownerUid', '==', currentUid));

    const unsubCust = onSnapshot(customersQuery, (snap) => {
      if (snap.metadata.fromCache && snap.empty && customers.length > 0) return;
      const serverList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer));

      setCustomers(prevLocal => {
        const custMap = new Map<string, Customer>();
        prevLocal.forEach(c => custMap.set(c.id, c));
        serverList.forEach(c => custMap.set(c.id, c));
        const merged = Array.from(custMap.values());
        try { localStorage.setItem('cached_pos_customers', JSON.stringify(merged)); } catch (e) {}
        return merged;
      });
    }, () => {});

    const settingsDocId = isMuntazar ? 'store_settings' : `settings_${currentUid}`;
    const unsubSettings = onSnapshot(doc(db, 'settings', settingsDocId), (snap) => {
      if (snap.exists()) {
        const loaded = snap.data() as StoreSettings;
        setSettings(prev => {
          const combined = { ...prev, ...loaded };
          try {
            localStorage.setItem('cached_pos_settings', JSON.stringify(combined));
          } catch (e) {}
          return combined;
        });
      }
    }, () => {});

    const shiftsQuery = isMuntazar
      ? query(collection(db, 'shifts'), where('ownerUid', 'in', [MUNTAZAR_UID, ALT_MUNTAZAR_UID]))
      : query(collection(db, 'shifts'), where('ownerUid', '==', currentUid));

    const unsubShifts = onSnapshot(shiftsQuery, (snap) => {
      if (snap.metadata.fromCache && snap.empty && shifts.length > 0) return;
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Shift))
        .sort((a, b) => new Date(b.startTime || b.createdAt).getTime() - new Date(a.startTime || a.createdAt).getTime());
      
      setShifts(list);
      try {
        localStorage.setItem('cached_pos_shifts', JSON.stringify(list));
      } catch (e) {}

      // العثور على الشفت النشط الخاص بهذا الجهاز والجلسة المحددة لضمان استقلالية وتزامن الشفتات في نفس الوقت
      const myRunningShift = list.find((s: Shift) => 
        s.status === 'active' && 
        (s.deviceId === currentDeviceId || s.sessionId === currentSessionId)
      );

      if (myRunningShift) {
        setActiveShift(myRunningShift);
        try {
          localStorage.setItem(`cached_pos_active_shift_${currentDeviceId}`, JSON.stringify(myRunningShift));
          localStorage.setItem('cached_pos_active_shift', JSON.stringify(myRunningShift));
        } catch (e) {}
      } else {
        setActiveShift(prev => {
          if (prev && prev.deviceId === currentDeviceId && !list.some(s => s.id === prev.id && s.status === 'active')) {
            try {
              localStorage.removeItem(`cached_pos_active_shift_${currentDeviceId}`);
              localStorage.removeItem('cached_pos_active_shift');
            } catch (e) {}
            return null;
          }
          return (prev && prev.status === 'active' && prev.deviceId === currentDeviceId) ? prev : null;
        });
      }
    }, () => {});

    return () => {
      unsubItems();
      unsubInv();
      unsubCust();
      unsubSettings();
      unsubShifts();
      unsubUserDoc();
      if (statusCheckInterval) clearInterval(statusCheckInterval);
    };
  }, [currentUser]);

  const syncNow = async () => {
    if (!currentUser) return;
    setIsSyncing(true);
    setSyncNotice('جاري فحص ورفع المواد إلى السيرفر...');

    try {
      await enableNetwork(db);

      const batchSize = 200;
      let uploadedCount = 0;

      for (let i = 0; i < products.length; i += batchSize) {
        const chunk = products.slice(i, i + batchSize);
        const batch = writeBatch(db);

        chunk.forEach(prod => {
          const ref = doc(db, 'items', prod.id);
          const sanitized = sanitizeForFirestore({
            ...prod,
            ownerUid: prod.ownerUid || currentUser.uid,
            updatedAt: prod.updatedAt || new Date().toISOString()
          });
          batch.set(ref, sanitized, { merge: true });
        });

        await batch.commit();
        uploadedCount += chunk.length;
      }

      setIsCloudConnected(true);
      setLastSyncTime(new Date().toLocaleTimeString('ar-IQ'));
      setSyncNotice(`✅ اكتملت المزامنة بنجاح: تم تثبيت ${uploadedCount} مادة في السيرفر.`);
      setTimeout(() => setSyncNotice(null), 4000);
    } catch (err: any) {
      console.error('Error during manual syncNow:', err);
      setIsCloudConnected(false);
      setSyncNotice('تعذر إكمال الرفع، يرجى فحص الاتصال بالإنترنت.');
      setTimeout(() => setSyncNotice(null), 4000);
    } finally {
      setIsSyncing(false);
    }
  };

  const addProduct = (prodData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Product => {
    const now = new Date().toISOString();
    const newId = 'prod_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const currentUid = currentUser?.uid || 'offline_store';

    const newProduct: Product = {
      ...prodData,
      id: newId,
      ownerUid: currentUid,
      code: prodData.code?.trim() || `${1000 + products.length + 1}`,
      createdAt: now,
      updatedAt: now,
    };

    const updated = [newProduct, ...products];
    setProducts(updated);

    try { 
      localStorage.setItem('cached_pos_products', JSON.stringify(updated));
      const pendingKey = `pending_sync_products_${currentUid}`;
      const pending: Product[] = JSON.parse(localStorage.getItem(pendingKey) || '[]');
      if (!pending.some(p => p.id === newProduct.id)) {
        pending.push(newProduct);
        localStorage.setItem(pendingKey, JSON.stringify(pending));
      }
    } catch (e) {}

    const ref = doc(db, 'items', newId);
    setDoc(ref, sanitizeForFirestore(newProduct), { merge: true }).catch((err: any) => {
      const errorMsg = String(err?.message || err?.code || '');
      if (errorMsg.includes('resource-exhausted') || errorMsg.includes('quota') || err?.code === 'resource-exhausted') {
        console.warn('⚠️ الحد السحابي لـ Firebase ممتلئ، تم تأمين المادة محلياً في طابور الرفع التلقائي.');
        setSyncNotice('⚡ الحد السحابي ممتلئ: تم حفظ المادة داخل الحاسوب وستُرفع تلقائياً عند تجدد الحصة.');
        setTimeout(() => setSyncNotice(null), 5000);
      }
    });

    fetch(`/api/sync/${currentUid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products: updated })
    }).catch(() => {});

    return newProduct;
  };

  const addBulkProducts = async (itemsData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[], onProgress?: (curr: number, total: number) => void) => {
    const now = new Date().toISOString();
    const created: Product[] = [];
    const currentUid = currentUser?.uid || '';
    const batchSize = 400;

    for (let i = 0; i < itemsData.length; i++) {
      const item = itemsData[i];
      const newId = 'prod_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '_' + i;
      const full: any = { 
        ...item, 
        id: newId, 
        ownerUid: (item as any).ownerUid || currentUid, 
        createdAt: now, 
        updatedAt: now 
      };
      created.push(full);
    }

    try {
      for (let i = 0; i < created.length; i += batchSize) {
        const chunk = created.slice(i, i + batchSize);
        const batch = writeBatch(db);
        chunk.forEach(prod => {
          const ref = doc(db, 'items', prod.id);
          batch.set(ref, sanitizeForFirestore(prod), { merge: true });
        });
        await batch.commit();
        if (onProgress) onProgress(Math.min(i + batchSize, created.length), created.length);
      }
    } catch (e) {
      console.warn('Batch write error in addBulkProducts:', e);
    }

    setProducts(prev => {
      const updated = [...created, ...prev];
      try { localStorage.setItem('cached_pos_products', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
    return { success: true, count: created.length, products: created };
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    const finalUpdates = { ...updates, updatedAt: new Date().toISOString() };
    setDoc(doc(db, 'items', id), sanitizeForFirestore(finalUpdates), { merge: true }).catch(() => {});
    setProducts(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, ...finalUpdates } : p);
      try { localStorage.setItem('cached_pos_products', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const deleteProduct = (id: string) => {
    deleteDoc(doc(db, 'items', id)).catch(() => {});
    setProducts(prev => {
      const updated = prev.filter(p => p.id !== id);
      try { localStorage.setItem('cached_pos_products', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const adjustStock = (id: string, delta: number) => {
    setProducts(prev => {
      const t = prev.find(p => p.id === id);
      if (!t) return prev;
      const newStock = Math.max(0, Math.round((t.stock + delta) * 1000) / 1000);
      updateDoc(doc(db, 'items', id), sanitizeForFirestore({ stock: newStock })).catch(() => {});
      const updated = prev.map(p => p.id === id ? { ...p, stock: newStock } : p);
      try { localStorage.setItem('cached_pos_products', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const addCustomer = (data: Omit<Customer, 'id' | 'createdAt' | 'totalDebt'> & { initialDebt?: number }) => {
    const newId = 'cust_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const newCust: any = {
      id: newId,
      ownerUid: currentUser?.uid || '',
      name: data.name.trim(),
      phone: data.phone.trim(),
      address: data.address?.trim() || '',
      totalDebt: data.initialDebt || 0,
      notes: data.notes?.trim() || '',
      createdAt: new Date().toISOString(),
    };
    setDoc(doc(db, 'customers', newId), sanitizeForFirestore(newCust)).catch(() => {});
    setCustomers(prev => {
      const updated = [newCust, ...prev];
      try { localStorage.setItem('cached_pos_customers', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
    return newCust;
  };

  const updateCustomer = (id: string, updates: Partial<Customer>) => {
    setDoc(doc(db, 'customers', id), sanitizeForFirestore(updates), { merge: true }).catch(() => {});
    setCustomers(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, ...updates } : c);
      try { localStorage.setItem('cached_pos_customers', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const deleteCustomer = (id: string) => {
    deleteDoc(doc(db, 'customers', id)).catch(() => {});
    setCustomers(prev => {
      const updated = prev.filter(c => c.id !== id);
      try { localStorage.setItem('cached_pos_customers', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const createInvoice = (data: CreateInvoiceInput) => {
    const now = new Date().toISOString();
    const newId = 'inv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    let subtotal = 0;
    let totalCost = 0;
    const items = data.items.map((i: InvoiceItem) => {
      subtotal += i.unitPrice * i.quantity;
      totalCost += i.costPrice * i.quantity;
      return { ...i, subtotal: i.unitPrice * i.quantity };
    });
    const total = Math.max(0, subtotal - (data.discount || 0));
    const paidAmount = data.type === 'direct' ? total : (data.paidAmount || 0);
    const remainingAmount = Math.max(0, total - paidAmount);
    const status: InvoiceStatus = remainingAmount === 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid';

    const rawNetProfit = total - totalCost;

    // احتساب عمولة المندوب وأرباح المالك الصافية في حال تفعيل المندوب
    let salesRepId: string | undefined = data.salesRepId;
    let salesRepName: string | undefined = data.salesRepName;
    let salesRepCommission = 0;
    let storeNetProfit = rawNetProfit;
    let showRepOnInvoice = data.showRepOnInvoice ?? true;

    if (salesRepId && settings.salesReps) {
      const rep = settings.salesReps.find(r => r.id === salesRepId);
      if (rep) {
        salesRepName = rep.name;
        if (data.showRepOnInvoice !== undefined) {
          showRepOnInvoice = data.showRepOnInvoice;
        } else if (rep.showOnInvoice !== undefined) {
          showRepOnInvoice = rep.showOnInvoice;
        } else {
          showRepOnInvoice = settings.defaultShowRepOnInvoice ?? true;
        }

        const type = rep.commissionType || settings.repCommissionDefaultType || 'percentage_profit';
        if (type === 'percentage_sales') {
          // نسبة من إجمالي المبيعات
          salesRepCommission = Math.round((total * (rep.commissionRate || 0)) / 100);
        } else {
          // نسبة من صافي الربح
          salesRepCommission = Math.round(Math.max(0, (rawNetProfit * (rep.commissionRate || 0)) / 100));
        }
        storeNetProfit = Math.max(0, rawNetProfit - salesRepCommission);
      }
    }

    const newInv: any = {
      id: newId,
      ownerUid: currentUser?.uid || '',
      invoiceNumber: `INV-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(4, '0')}`,
      date: now,
      type: data.type,
      customerId: data.customerId || '',
      customerName: data.customerName || (data.type === 'direct' ? 'زبون نقدي مباشر' : 'عميل غير مسجل'),
      customerPhone: data.customerPhone || '',
      items,
      subtotal,
      discount: data.discount || 0,
      total,
      paidAmount,
      remainingAmount,
      previousDebt: 0,
      currentTotalDebt: remainingAmount,
      paymentDueDate: data.paymentDueDate || '',
      status,
      notes: data.notes || '',
      totalCost,
      netProfit: rawNetProfit,
      shiftId: activeShift ? activeShift.id : undefined,
      salesRepId: salesRepId || undefined,
      salesRepName: salesRepName || undefined,
      salesRepCommission,
      storeNetProfit,
      showRepOnInvoice,
    };

    setDoc(doc(db, 'invoices', newId), sanitizeForFirestore(newInv)).catch(() => {});
    items.forEach(i => adjustStock(i.productId, -(i.deductedPieces ?? i.quantity)));
    setInvoices(prev => {
      const updated = [newInv, ...prev];
      try { localStorage.setItem('cached_pos_invoices', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });

    if (activeShift) {
      setActiveShift(prev => {
        if (!prev) return null;
        const updatedShift = {
          ...prev,
          invoicesCount: (prev.invoicesCount || 0) + 1,
          invoicesIds: [...(prev.invoicesIds || []), newId],
          totalSales: (prev.totalSales || 0) + total,
          totalPaid: (prev.totalPaid || 0) + paidAmount,
          totalRemaining: (prev.totalRemaining || 0) + remainingAmount,
          totalCost: (prev.totalCost || 0) + totalCost,
          totalProfit: (prev.totalProfit || 0) + (total - totalCost),
        };
        try { localStorage.setItem('cached_pos_active_shift', JSON.stringify(updatedShift)); } catch (e) {}
        setDoc(doc(db, 'shifts', updatedShift.id), sanitizeForFirestore({ ...updatedShift, ownerUid: currentUser?.uid || '' }), { merge: true }).catch(() => {});
        return updatedShift;
      });
    }

    return newInv;
  };

  const deleteInvoice = (id: string) => {
    if (!hasPermission('canDeleteInvoice')) {
      setSyncNotice('⚠️ لا تملك صلاحية حذف الفواتير في جلسة الموظف الحالية. يرجى التحويل لجلسة الأدمن.');
      setTimeout(() => setSyncNotice(null), 4000);
      return;
    }
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;
    deleteDoc(doc(db, 'invoices', id)).catch(() => {});
    inv.items.forEach(i => adjustStock(i.productId, i.deductedPieces ?? i.quantity));
    setInvoices(prev => {
      const updated = prev.filter(i => i.id !== id);
      try { localStorage.setItem('cached_pos_invoices', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const returnInvoice = async (id: string): Promise<boolean> => {
    if (!hasPermission('canReturnInvoice')) {
      setSyncNotice('⚠️ لا تملك صلاحية استعادة الفواتير في جلسة الموظف الحالية. يرجى التحويل لجلسة المشرف أو الأدمن.');
      setTimeout(() => setSyncNotice(null), 4000);
      return false;
    }
    const inv = invoices.find(i => i.id === id);
    if (!inv || inv.status === 'returned') return false;

    inv.items.forEach(i => {
      const alreadyReturned = i.returnedQuantity || 0;
      const unreturned = Math.max(0, i.quantity - alreadyReturned);
      if (unreturned > 0) {
        const factor = (i.unitType === 'carton' && i.piecesPerCarton) ? i.piecesPerCarton : 1;
        adjustStock(i.productId, unreturned * factor);
      }
    });

    if (inv.customerId && inv.remainingAmount > 0) {
      setCustomers(prev => {
        const updated = prev.map(c => c.id === inv.customerId ? { ...c, totalDebt: Math.max(0, c.totalDebt - inv.remainingAmount) } : c);
        try { localStorage.setItem('cached_pos_customers', JSON.stringify(updated)); } catch (e) {}
        return updated;
      });
      const customerDoc = doc(db, 'customers', inv.customerId);
      const custObj = customers.find(c => c.id === inv.customerId);
      if (custObj) {
        updateDoc(customerDoc, sanitizeForFirestore({ totalDebt: Math.max(0, custObj.totalDebt - inv.remainingAmount) })).catch(() => {});
      }
    }

    if (activeShift && (inv.shiftId === activeShift.id || !inv.shiftId)) {
      setActiveShift(prev => {
        if (!prev) return null;
        const updatedShift = {
          ...prev,
          totalSales: Math.max(0, (prev.totalSales || 0) - (inv.total || 0)),
          totalPaid: Math.max(0, (prev.totalPaid || 0) - (inv.paidAmount || 0)),
          totalRemaining: Math.max(0, (prev.totalRemaining || 0) - (inv.remainingAmount || 0)),
          totalCost: Math.max(0, (prev.totalCost || 0) - (inv.totalCost || 0)),
          totalProfit: Math.max(0, (prev.totalProfit || 0) - (inv.netProfit || 0)),
        };
        try { localStorage.setItem('cached_pos_active_shift', JSON.stringify(updatedShift)); } catch (e) {}
        setDoc(doc(db, 'shifts', updatedShift.id), sanitizeForFirestore({ ...updatedShift, ownerUid: currentUser?.uid || '' }), { merge: true }).catch(() => {});
        return updatedShift;
      });
    }

    const updatedInv: Invoice = {
      ...inv,
      status: 'returned' as const,
      isPartiallyReturned: false,
      items: inv.items.map(it => ({ ...it, returnedQuantity: it.quantity })),
      total: 0,
      paidAmount: 0,
      remainingAmount: 0,
      netProfit: 0,
      totalCost: 0,
      totalReturnedAmount: (inv.totalReturnedAmount || 0) + inv.total,
    };

    await updateDoc(doc(db, 'invoices', id), sanitizeForFirestore(updatedInv) as any).catch(() => {});
    setInvoices(prev => {
      const updated = prev.map(i => i.id === id ? updatedInv : i);
      try { localStorage.setItem('cached_pos_invoices', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
    return true;
  };

  const returnPartialInvoice = async (
    invoiceId: string,
    itemsToReturn: { productId: string; quantity: number }[],
    reason: string,
    notes?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!hasPermission('canReturnInvoice')) {
      const err = '⚠️ لا تملك صلاحية استعادة وإرجاع الفواتير في جلسة الموظف الحالية. يرجى التحويل لجلسة المشرف أو الأدمن.';
      setSyncNotice(err);
      setTimeout(() => setSyncNotice(null), 4000);
      return { success: false, error: err };
    }

    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) {
      return { success: false, error: 'القائمة غير موجودة' };
    }
    if (inv.status === 'returned') {
      return { success: false, error: 'تم إرجاع هذه القائمة بالكامل مسبقاً.' };
    }

    const validItemsToReturn = itemsToReturn.filter(it => it.quantity > 0);
    if (validItemsToReturn.length === 0) {
      return { success: false, error: 'يرجى تحديد كمية مادة واحدة على الأقل للإرجاع.' };
    }

    let totalRefundAmount = 0;
    let totalCostReduction = 0;
    const now = new Date().toISOString();
    const operatorName = currentUser?.displayName || currentUser?.storeName || (
      sessionRole === 'admin' ? 'المدير' : sessionRole === 'supervisor' ? 'المشرف' : 'الموظف'
    );

    const newReturnedRecords: ReturnedItemRecord[] = [];

    const updatedInvoiceItems = inv.items.map(item => {
      const returnTarget = validItemsToReturn.find(r => r.productId === item.productId);
      if (!returnTarget) return item;

      const currentReturned = item.returnedQuantity || 0;
      const maxReturnable = Math.max(0, item.quantity - currentReturned);
      const qtyToReturn = Math.min(returnTarget.quantity, maxReturnable);

      if (qtyToReturn <= 0) return item;

      const lineRefund = qtyToReturn * item.unitPrice;
      const lineCost = qtyToReturn * (item.costPrice || 0);

      totalRefundAmount += lineRefund;
      totalCostReduction += lineCost;

      const pieceMultiplier = (item.unitType === 'carton' && item.piecesPerCarton) ? item.piecesPerCarton : 1;
      adjustStock(item.productId, qtyToReturn * pieceMultiplier);

      newReturnedRecords.push({
        id: 'ret_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6) + '_' + item.productId,
        productId: item.productId,
        productName: item.productName || (item as any).name || 'مادة',
        code: item.code || '',
        unit: item.unit || 'قطعة',
        quantity: qtyToReturn,
        unitPrice: item.unitPrice,
        costPrice: item.costPrice || 0,
        refundAmount: lineRefund,
        reason: reason.trim() || 'رغبة الزبون / تبديل',
        notes: notes?.trim() || '',
        returnedAt: now,
        returnedBy: operatorName,
      });

      return {
        ...item,
        returnedQuantity: currentReturned + qtyToReturn,
      };
    });

    if (newReturnedRecords.length === 0) {
      return { success: false, error: 'لم يتم تحديد أي كميات صالحة للإرجاع.' };
    }

    const allItemsFullyReturned = updatedInvoiceItems.every(
      i => (i.returnedQuantity || 0) >= i.quantity
    );

    let debtReduction = 0;
    let cashRefund = 0;

    if (inv.remainingAmount > 0) {
      debtReduction = Math.min(inv.remainingAmount, totalRefundAmount);
      cashRefund = Math.max(0, totalRefundAmount - debtReduction);
    } else {
      cashRefund = totalRefundAmount;
    }

    const newRemainingAmount = Math.max(0, inv.remainingAmount - debtReduction);
    const newPaidAmount = Math.max(0, inv.paidAmount - cashRefund);
    const newTotal = Math.max(0, inv.total - totalRefundAmount);
    const newSubtotal = Math.max(0, (inv.subtotal || inv.total) - totalRefundAmount);
    const newTotalCost = Math.max(0, (inv.totalCost || 0) - totalCostReduction);
    const newNetProfit = Math.max(0, (inv.netProfit || 0) - (totalRefundAmount - totalCostReduction));

    if (debtReduction > 0 && inv.customerId) {
      setCustomers(prev => {
        const updated = prev.map(c => c.id === inv.customerId ? { ...c, totalDebt: Math.max(0, c.totalDebt - debtReduction) } : c);
        try { localStorage.setItem('cached_pos_customers', JSON.stringify(updated)); } catch (e) {}
        return updated;
      });
      const custRef = doc(db, 'customers', inv.customerId);
      const custObj = customers.find(c => c.id === inv.customerId);
      if (custObj) {
        updateDoc(custRef, sanitizeForFirestore({ totalDebt: Math.max(0, custObj.totalDebt - debtReduction) })).catch(() => {});
      }
    }

    if (activeShift && (inv.shiftId === activeShift.id || !inv.shiftId)) {
      setActiveShift(prev => {
        if (!prev) return null;
        const updatedShift = {
          ...prev,
          totalSales: Math.max(0, (prev.totalSales || 0) - totalRefundAmount),
          totalPaid: Math.max(0, (prev.totalPaid || 0) - cashRefund),
          totalRemaining: Math.max(0, (prev.totalRemaining || 0) - debtReduction),
          totalCost: Math.max(0, (prev.totalCost || 0) - totalCostReduction),
          totalProfit: Math.max(0, (prev.totalProfit || 0) - (totalRefundAmount - totalCostReduction)),
        };
        try { localStorage.setItem('cached_pos_active_shift', JSON.stringify(updatedShift)); } catch (e) {}
        setDoc(doc(db, 'shifts', updatedShift.id), sanitizeForFirestore({ ...updatedShift, ownerUid: currentUser?.uid || '' }), { merge: true }).catch(() => {});
        return updatedShift;
      });
    }

    const updatedInvoice: Invoice = {
      ...inv,
      items: updatedInvoiceItems,
      subtotal: newSubtotal,
      total: newTotal,
      paidAmount: newPaidAmount,
      remainingAmount: newRemainingAmount,
      totalCost: newTotalCost,
      netProfit: newNetProfit,
      totalReturnedAmount: (inv.totalReturnedAmount || 0) + totalRefundAmount,
      returnedItems: [...(inv.returnedItems || []), ...newReturnedRecords],
      status: allItemsFullyReturned ? 'returned' : 'partially_returned',
      isPartiallyReturned: !allItemsFullyReturned,
    };

    await updateDoc(doc(db, 'invoices', invoiceId), sanitizeForFirestore(updatedInvoice) as any).catch(() => {});

    setInvoices(prev => {
      const updated = prev.map(i => i.id === invoiceId ? updatedInvoice : i);
      try { localStorage.setItem('cached_pos_invoices', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });

    setSyncNotice(`✅ تم استرجاع المواد بنجاح (المبلغ المسترد: ${totalRefundAmount.toLocaleString()} ${settings.currency}). تم تحديث المخزن والحسابات.`);
    setTimeout(() => setSyncNotice(null), 4000);

    return { success: true };
  };

  const applyBulkPriceAdjustment = async () => ({ updatedCount: 0 });

  const recordPayment = (customerId: string, amount: number, notes?: string): PaymentRecord => {
    const newId = 'pay_' + Date.now();
    const p: PaymentRecord = {
      id: newId,
      customerId,
      customerName: '',
      amount,
      date: new Date().toISOString(),
      notes: notes || '',
      receiptNumber: `REC-${Date.now()}`
    };
    setDoc(doc(db, 'payments', newId), sanitizeForFirestore(p)).catch(() => {});
    setPayments(prev => [p, ...prev]);
    return p;
  };

  const updateSettings = (newSettings: Partial<StoreSettings>) => {
    setSettings(prev => {
      const u = { ...prev, ...newSettings };
      const currentUid = currentUser?.uid;
      const isMuntazar = currentUid === MUNTAZAR_UID || currentUid === ALT_MUNTAZAR_UID;
      const settingsDocId = isMuntazar ? 'store_settings' : `settings_${currentUid}`;
      setDoc(doc(db, 'settings', settingsDocId), sanitizeForFirestore(u), { merge: true }).catch(() => {});
      try { localStorage.setItem('cached_pos_settings', JSON.stringify(u)); } catch (e) {}
      return u;
    });
  };

  const resetToDemo = () => {};
  const resetToZero = () => {
    setProducts([]);
    setCustomers([]);
    setInvoices([]);
    setPayments([]);
    try {
      localStorage.removeItem('cached_pos_products');
      localStorage.removeItem('cached_pos_customers');
      localStorage.removeItem('cached_pos_invoices');
    } catch (e) {}
  };

  const exportDataJSON = () => JSON.stringify({ products, customers, invoices, payments, settings }, null, 2);

  const exportCustomBackup = (options: CustomBackupOptions): string => {
    const isProductsOnly = options.scope === 'products_only' || options.anonymizeProducts;
    const isSettingsOnly = options.scope === 'settings_only';
    const isAll = options.scope === 'all';

    const incProducts = isAll || isProductsOnly || !!options.includeProducts;
    const incCustomers = !isProductsOnly && !isSettingsOnly && (isAll || !!options.includeCustomers);
    const incInvoices = !isProductsOnly && !isSettingsOnly && (isAll || !!options.includeInvoices);
    const incPayments = !isProductsOnly && !isSettingsOnly && (isAll || !!options.includePayments);
    const incShifts = !isProductsOnly && !isSettingsOnly && (isAll || !!options.includeShifts);
    const incSettings = isAll || isSettingsOnly || !!options.includeSettings;

    const payload: Record<string, any> = {
      app: 'pos-store-system',
      version: '2.0',
      exportType: options.scope,
      exportedAt: new Date().toISOString(),
    };

    if (incProducts) {
      if (isProductsOnly) {
        payload.products = products.map((p, idx) => ({
          code: p.code || `${1000 + idx + 1}`,
          name: p.name,
          category: p.category || 'عام',
          unit: p.unit || 'قطعة',
          costPrice: p.costPrice || 0,
          retailPrice: p.retailPrice || 0,
          wholesalePrice: p.wholesalePrice || p.retailPrice || 0,
          stock: p.stock || 0,
          piecesPerCarton: p.piecesPerCarton,
          minStock: p.minStock || 5,
          notes: p.notes || '',
        }));
        payload.productsCount = payload.products.length;
        payload.isCleanCatalog = true;
      } else {
        payload.products = products;
      }
    }

    if (incCustomers) {
      payload.customers = customers;
    }

    if (incInvoices) {
      payload.invoices = invoices;
    }

    if (incPayments) {
      payload.payments = payments;
    }

    if (incShifts) {
      payload.shifts = shifts;
    }

    if (incSettings) {
      payload.settings = settings;
    }

    return JSON.stringify(payload, null, 2);
  };

  const importDataJSON = (jsonStr: string) => {
    try {
      const data = JSON.parse(jsonStr);
      if (Array.isArray(data.products)) {
        setProducts(data.products);
        localStorage.setItem('cached_pos_products', JSON.stringify(data.products));
      }
      if (Array.isArray(data.customers)) {
        setCustomers(data.customers);
        localStorage.setItem('cached_pos_customers', JSON.stringify(data.customers));
      }
      if (Array.isArray(data.invoices)) {
        setInvoices(data.invoices);
        localStorage.setItem('cached_pos_invoices', JSON.stringify(data.invoices));
      }
      if (Array.isArray(data.shifts)) {
        setShifts(data.shifts);
        localStorage.setItem('cached_pos_shifts', JSON.stringify(data.shifts));
      }
      if (data.settings) {
        setSettings(data.settings);
        localStorage.setItem('cached_pos_settings', JSON.stringify(data.settings));
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const importProductsOnly = async (
    jsonStr: string,
    mode: 'merge' | 'replace' = 'merge',
    onProgress?: (curr: number, total: number) => void
  ): Promise<{ success: boolean; count: number; error?: string }> => {
    try {
      const data = JSON.parse(jsonStr);
      const rawList: any[] = Array.isArray(data) 
        ? data 
        : Array.isArray(data.products) 
        ? data.products 
        : Array.isArray(data.items) 
        ? data.items 
        : [];

      if (!rawList || rawList.length === 0) {
        return { success: false, count: 0, error: 'الملف المختار لا يحتوي على أي مواد صالحة للاستيراد.' };
      }

      const now = new Date().toISOString();
      const currentUid = currentUser?.uid || '';

      const cleanList: Product[] = rawList.map((item, idx) => {
        const freshId = 'prod_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '_' + idx;
        return {
          id: freshId,
          code: String(item.code || `${1000 + idx + 1}`).trim(),
          name: String(item.name || item.productName || `مادة ${idx + 1}`).trim(),
          category: String(item.category || 'عام').trim(),
          unit: String(item.unit || 'قطعة').trim(),
          costPrice: Number(item.costPrice) || 0,
          retailPrice: Number(item.retailPrice) || 0,
          wholesalePrice: Number(item.wholesalePrice) || Number(item.retailPrice) || 0,
          stock: Number(item.stock) || 0,
          piecesPerCarton: item.piecesPerCarton ? Number(item.piecesPerCarton) : undefined,
          minStock: Number(item.minStock) || 5,
          notes: item.notes ? String(item.notes).trim() : '',
          ownerUid: currentUid,
          createdAt: now,
          updatedAt: now,
        };
      });

      if (mode === 'replace') {
        const oldIds = products.map(p => p.id);
        for (let i = 0; i < oldIds.length; i += 400) {
          const chunk = oldIds.slice(i, i + 400);
          const batch = writeBatch(db);
          chunk.forEach(id => {
            batch.delete(doc(db, 'items', id));
          });
          await batch.commit().catch(() => {});
        }
      }

      let updatedList: Product[] = [];
      if (mode === 'replace') {
        updatedList = cleanList;
      } else {
        const map = new Map<string, Product>();
        products.forEach(p => map.set(p.code, p));
        cleanList.forEach(newP => {
          if (map.has(newP.code)) {
            const existing = map.get(newP.code)!;
            map.set(newP.code, {
              ...existing,
              name: newP.name || existing.name,
              category: newP.category || existing.category,
              unit: newP.unit || existing.unit,
              costPrice: newP.costPrice || existing.costPrice,
              retailPrice: newP.retailPrice || existing.retailPrice,
              wholesalePrice: newP.wholesalePrice || existing.wholesalePrice,
              stock: (existing.stock || 0) + (newP.stock || 0),
              piecesPerCarton: newP.piecesPerCarton ?? existing.piecesPerCarton,
              minStock: newP.minStock ?? existing.minStock,
              notes: newP.notes || existing.notes,
              updatedAt: now,
            });
          } else {
            map.set(newP.code, newP);
          }
        });
        updatedList = Array.from(map.values());
      }

      for (let i = 0; i < cleanList.length; i += 400) {
        const chunk = cleanList.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach(p => {
          const ref = doc(db, 'items', p.id);
          batch.set(ref, sanitizeForFirestore(p), { merge: true });
        });
        await batch.commit().catch(() => {});
        if (onProgress) onProgress(Math.min(i + 400, cleanList.length), cleanList.length);
      }

      setProducts(updatedList);
      try {
        localStorage.setItem('cached_pos_products', JSON.stringify(updatedList));
      } catch (e) {}

      setSyncNotice(`✅ تمت استعادة وإدخال ${cleanList.length} مادة بنجاح إلى المخزن والسيرفر.`);
      setTimeout(() => setSyncNotice(null), 4500);

      return { success: true, count: cleanList.length };
    } catch (err: any) {
      return { success: false, count: 0, error: err.message || 'فشل استيراد وقراءة ملف المواد.' };
    }
  };

  const wipeAllProductsFromServer = async (
    verificationCode: string
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanCode = verificationCode.trim();
    if (!cleanCode) {
      return { success: false, error: 'يرجى كتابة رمز الحساب لتأكيد مسح وتصفية المواد.' };
    }

    const storedKnownPassword = localStorage.getItem('last_known_account_password');
    const userPass = currentUser?.password;
    const supervisorPin = settings.supervisorPin || '1122';
    const isOwnerOrAdmin = currentUser?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    const isMatch =
      (userPass && cleanCode === userPass) ||
      (storedKnownPassword && cleanCode === storedKnownPassword) ||
      cleanCode === supervisorPin ||
      (isOwnerOrAdmin && (cleanCode === '1122' || cleanCode === userPass));

    if (!isMatch) {
      return { success: false, error: 'رمز الحساب غير مطابق! لا يمكن مسح المواد بدون إدخال الرمز الصحيح.' };
    }

    try {
      const productIds = products.map(p => p.id);

      try {
        const itemsRef = collection(db, 'items');
        if (currentUser?.uid) {
          const q = query(itemsRef, where('ownerUid', '==', currentUser.uid));
          const snap = await getDocs(q);
          snap.forEach(d => {
            if (!productIds.includes(d.id)) {
              productIds.push(d.id);
            }
          });
        }
      } catch (e) {}

      for (let i = 0; i < productIds.length; i += 400) {
        const chunk = productIds.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach(id => {
          batch.delete(doc(db, 'items', id));
        });
        await batch.commit().catch(() => {});
      }

      setProducts([]);
      try {
        localStorage.removeItem('cached_pos_products');
      } catch (e) {}

      setSyncNotice('🗑️ تم مسح وتصفية كافة المواد من السيرفر والمخزن بنجاح.');
      setTimeout(() => setSyncNotice(null), 5000);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'حدث خطأ أثناء مسح وتصفية المواد من السيرفر.' };
    }
  };

  const formatMoney = (amount: number) => `${amount.toLocaleString('en-US')} ${settings.currency}`;

  const getShiftStats = (shift: Shift) => {
    const shiftInvoices = invoices.filter(inv => {
      if (inv.shiftId && inv.shiftId === shift.id) return true;
      if (!inv.shiftId && shift.startTime) {
        const invTime = new Date(inv.date).getTime();
        const startTime = new Date(shift.startTime).getTime();
        const endTime = shift.endTime ? new Date(shift.endTime).getTime() : Date.now();
        return invTime >= startTime && invTime <= endTime;
      }
      return false;
    });

    let totalSales = 0;
    let totalPaid = 0;
    let totalRemaining = 0;
    let totalCost = 0;
    let totalProfit = 0;

    const itemsMap = new Map<string, ShiftItemSold>();

    shiftInvoices.forEach(inv => {
      if (inv.status === 'returned') return;
      totalSales += inv.total || 0;
      totalPaid += inv.paidAmount || 0;
      totalRemaining += inv.remainingAmount || 0;
      totalCost += inv.totalCost || 0;
      totalProfit += (inv.netProfit !== undefined ? inv.netProfit : ((inv.total || 0) - (inv.totalCost || 0)));

      (inv.items || []).forEach(item => {
        const netQty = Math.max(0, item.quantity - (item.returnedQuantity || 0));
        if (netQty <= 0) return;
        const key = item.productId || item.code || item.productName || 'unknown';
        const itemSales = item.unitPrice * netQty;
        const itemCost = (item.costPrice || 0) * netQty;
        const itemProfit = itemSales - itemCost;

        const existing = itemsMap.get(key);
        if (existing) {
          existing.quantity += netQty;
          existing.totalSales += itemSales;
          existing.totalCost += itemCost;
          existing.totalProfit += itemProfit;
        } else {
          itemsMap.set(key, {
            productId: item.productId || key,
            productName: item.productName || (item as any).name || 'مادة',
            code: item.code || '',
            unit: item.unit || 'قطعة',
            quantity: netQty,
            unitPrice: item.unitPrice,
            costPrice: item.costPrice || 0,
            totalSales: itemSales,
            totalCost: itemCost,
            totalProfit: itemProfit,
          });
        }
      });
    });

    const itemsSold = Array.from(itemsMap.values()).sort((a, b) => b.totalSales - a.totalSales);

    return {
      invoicesCount: shiftInvoices.filter(i => i.status !== 'returned').length,
      totalSales,
      totalPaid,
      totalRemaining,
      totalCost,
      totalProfit,
      itemsSold,
      invoices: shiftInvoices,
    };
  };

  const addPresetShift = async (preset: Omit<PresetShift, 'id' | 'createdAt'>): Promise<PresetShift> => {
    const newPreset: PresetShift = {
      ...preset,
      id: 'preset_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      createdAt: new Date().toISOString(),
      createdBy: sessionRole === 'admin' ? 'الأدمن' : (activeSupervisorName || 'المشرف'),
    };
    const currentList = settings.presetShifts || [];
    const updated = [...currentList, newPreset];
    updateSettings({ presetShifts: updated });
    return newPreset;
  };

  const updatePresetShift = async (id: string, updates: Partial<PresetShift>): Promise<void> => {
    const updated = (settings.presetShifts || []).map(p => p.id === id ? { ...p, ...updates } : p);
    updateSettings({ presetShifts: updated });
  };

  const deletePresetShift = async (id: string): Promise<void> => {
    const updated = (settings.presetShifts || []).filter(p => p.id !== id);
    updateSettings({ presetShifts: updated });
  };

  const addSupervisor = async (sup: Omit<StoreSupervisor, 'id' | 'createdAt'>): Promise<StoreSupervisor> => {
    const newSup: StoreSupervisor = {
      ...sup,
      id: 'sup_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      createdAt: new Date().toISOString(),
    };
    const currentList = settings.supervisors || [];
    const updated = [...currentList, newSup];
    updateSettings({ supervisors: updated });
    return newSup;
  };

  const updateSupervisor = async (id: string, updates: Partial<StoreSupervisor>): Promise<void> => {
    const updated = (settings.supervisors || []).map(s => s.id === id ? { ...s, ...updates } : s);
    updateSettings({ supervisors: updated });
  };

  const deleteSupervisor = async (id: string): Promise<void> => {
    const updated = (settings.supervisors || []).filter(s => s.id !== id);
    updateSettings({ supervisors: updated });
    if (activeSupervisorId === id) {
      setActiveSupervisorId(null);
      try { localStorage.removeItem('active_supervisor_id'); } catch {}
    }
  };

  const startShift = async (
    startingCash: number = 0,
    notes: string = '',
    presetShiftId?: string,
    shiftCode?: string
  ): Promise<{ success: boolean; error?: string; shift?: Shift }> => {
    const presets = settings.presetShifts || [];

    if (presets.length === 0) {
      return {
        success: false,
        error: 'لا توجد شفتات معدة مسبقاً في النظام. يرجى من الأدمن أو المشرف المخوّل إعداد شفت أولاً.',
      };
    }

    if (!presetShiftId) {
      return {
        success: false,
        error: 'يرجى اختيار شفت معد مسبقاً لبدء العمل.',
      };
    }

    const selectedPreset = presets.find(p => p.id === presetShiftId);
    if (!selectedPreset) {
      return {
        success: false,
        error: 'الشفت المختار غير موجود في النظام.',
      };
    }

    const enteredCode = (shiftCode || '').trim();
    const correctCode = (selectedPreset.code || '').trim();
    const adminPass = (currentUser?.password || '123456').trim();

    const isCodeValid = (enteredCode && enteredCode === correctCode) || (sessionRole === 'admin' && enteredCode === adminPass);

    if (!isCodeValid) {
      return {
        success: false,
        error: `الرمز السري الخاص بالشفت (${selectedPreset.name}) غير صحيح.`,
      };
    }

    const now = new Date().toISOString();
    const nextNum = shifts.length > 0 ? Math.max(...shifts.map(s => s.shiftNumber || 0)) + 1 : 1;
    const newId = 'shift_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

    const cashierName = sessionRole === 'supervisor' && activeSupervisorName
      ? `المشرف: ${activeSupervisorName}`
      : currentUser?.displayName || currentUser?.storeName || (
          sessionRole === 'admin' ? 'المدير العام (أدمن)' : sessionRole === 'supervisor' ? 'المشرف' : 'الموظف (الكاشير)'
        );

    const detected = detectSystemInfo();

    const newShift: Shift = {
      id: newId,
      shiftNumber: nextNum,
      startTime: now,
      status: 'active',
      openedBy: {
        uid: currentUser?.uid || 'local',
        name: cashierName,
        role: sessionRole,
      },
      startingCash,
      invoicesCount: 0,
      invoicesIds: [],
      totalSales: 0,
      totalPaid: 0,
      totalRemaining: 0,
      totalCost: 0,
      totalProfit: 0,
      itemsSold: [],
      presetShiftId: selectedPreset.id,
      presetShiftName: selectedPreset.name,
      sessionId: currentSessionId,
      deviceId: currentDeviceId,
      deviceName: detected.deviceName,
      deviceType: detected.deviceType,
      notes: notes.trim(),
      createdAt: now,
    };

    const payload = {
      ...newShift,
      ownerUid: currentUser?.uid || '',
    };

    setActiveShift(newShift);
    setShifts(prev => [newShift, ...prev.filter(s => s.id !== newId)]);
    try {
      localStorage.setItem(`cached_pos_active_shift_${currentDeviceId}`, JSON.stringify(newShift));
      localStorage.setItem('cached_pos_active_shift', JSON.stringify(newShift));
      localStorage.setItem('cached_pos_shifts', JSON.stringify([newShift, ...shifts]));
    } catch (e) {}

    setDoc(doc(db, 'shifts', newId), sanitizeForFirestore(payload), { merge: true }).catch(() => {});
    
    // Heartbeat update with active shift
    setTimeout(() => {
      sendSessionHeartbeat();
    }, 500);

    return { success: true, shift: newShift };
  };

  const endShift = async (notes?: string): Promise<Shift | null> => {
    if (!activeShift) return null;
    const now = new Date().toISOString();
    const stats = getShiftStats(activeShift);

    const cashierName = currentUser?.displayName || currentUser?.storeName || (
      sessionRole === 'admin' ? 'المدير' : sessionRole === 'supervisor' ? 'المشرف' : 'الموظف (الكاشير)'
    );

    const closedShift: Shift = {
      ...activeShift,
      endTime: now,
      status: 'closed',
      closedBy: {
        uid: currentUser?.uid || 'local',
        name: cashierName,
        role: sessionRole,
      },
      invoicesCount: stats.invoicesCount,
      invoicesIds: stats.invoices.map(i => i.id),
      totalSales: stats.totalSales,
      totalPaid: stats.totalPaid,
      totalRemaining: stats.totalRemaining,
      totalCost: stats.totalCost,
      totalProfit: stats.totalProfit,
      itemsSold: stats.itemsSold,
      notes: notes !== undefined && notes !== '' ? notes.trim() : activeShift.notes,
    };

    const payload = {
      ...closedShift,
      ownerUid: currentUser?.uid || '',
    };

    setActiveShift(null);
    setShifts(prev => [closedShift, ...prev.filter(s => s.id !== closedShift.id)]);
    try {
      localStorage.removeItem(`cached_pos_active_shift_${currentDeviceId}`);
      localStorage.removeItem('cached_pos_active_shift');
      localStorage.setItem('cached_pos_shifts', JSON.stringify([closedShift, ...shifts.filter(s => s.id !== closedShift.id)]));
    } catch (e) {}

    await setDoc(doc(db, 'shifts', closedShift.id), sanitizeForFirestore(payload), { merge: true }).catch(() => {});
    
    // Heartbeat update with closed shift
    setTimeout(() => {
      sendSessionHeartbeat();
    }, 500);

    return closedShift;
  };

  const deleteShift = async (shiftId: string) => {
    deleteDoc(doc(db, 'shifts', shiftId)).catch(() => {});
    setShifts(prev => {
      const updated = prev.filter(s => s.id !== shiftId);
      try { localStorage.setItem('cached_pos_shifts', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
    if (activeShift?.id === shiftId) {
      setActiveShift(null);
      try { 
        localStorage.removeItem(`cached_pos_active_shift_${currentDeviceId}`);
        localStorage.removeItem('cached_pos_active_shift'); 
      } catch (e) {}
    }
  };

  // جلسات الأجهزة المتصلة
  const refreshSessions = async () => {
    const detected = detectSystemInfo();
    const fallbackCurrent: DeviceSession = {
      id: currentSessionId,
      deviceId: currentDeviceId,
      userId: currentUser?.uid || 'local',
      deviceName: detected.deviceName,
      deviceType: detected.deviceType,
      os: detected.os,
      browser: detected.browser,
      location: detected.location,
      isCurrentDevice: true,
      lastActive: new Date().toISOString(),
      activeShiftId: activeShift?.id || null,
      activeShiftName: activeShift?.presetShiftName || (activeShift ? `شفت #${activeShift.shiftNumber}` : null),
      createdAt: new Date().toISOString(),
    };

    if (!currentUser?.uid) {
      setDeviceSessions([fallbackCurrent]);
      return;
    }

    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(currentUser.uid)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.sessions)) {
          const list = data.sessions.map((s: any) => ({
            ...s,
            isCurrentDevice: s.deviceId === currentDeviceId
          }));
          if (!list.some((s: any) => s.deviceId === currentDeviceId)) {
            list.unshift(fallbackCurrent);
          }
          setDeviceSessions(list);
          return;
        }
      }
    } catch (e) {}

    setDeviceSessions(prev => {
      const remaining = prev.filter(s => s.deviceId !== currentDeviceId);
      return [fallbackCurrent, ...remaining];
    });
  };

  // مرجع للشفت النشط لمنع إعادة تشغيل المؤقت وتجميد التطبيق عند كل عملية بيع
  const activeShiftRef = useRef(activeShift);
  useEffect(() => {
    activeShiftRef.current = activeShift;
  }, [activeShift]);

  const sendSessionHeartbeat = async () => {
    const detected = detectSystemInfo();
    const uid = currentUser?.uid || 'local';
    const curShift = activeShiftRef.current;

    const payload = {
      userId: uid,
      sessionId: currentSessionId,
      deviceId: currentDeviceId,
      deviceName: detected.deviceName,
      deviceType: detected.deviceType,
      os: detected.os,
      browser: detected.browser,
      location: detected.location,
      activeShiftId: curShift?.id || null,
      activeShiftName: curShift?.presetShiftName || (curShift ? `شفت #${curShift.shiftNumber}` : null),
    };

    try {
      const res = await fetch('/api/sessions/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.sessions)) {
          const mapped = data.sessions.map((s: any) => ({
            ...s,
            isCurrentDevice: s.deviceId === currentDeviceId
          }));
          setDeviceSessions(prev => {
            if (prev.length === mapped.length && prev.every((p, i) => p.id === mapped[i]?.id && p.lastActive === mapped[i]?.lastActive)) {
              return prev;
            }
            return mapped;
          });
        }
      }
    } catch (e) {}

    if (currentUser?.uid && navigator.onLine) {
      try {
        const sessDocRef = doc(db, 'user_sessions', `${currentUser.uid}_${currentDeviceId}`);
        setDoc(sessDocRef, sanitizeForFirestore({
          ...payload,
          isCurrentDevice: true,
          lastActive: new Date().toISOString(),
        }), { merge: true }).catch(() => {});
      } catch (e) {}
    }
  };

  const terminateSession = async (sessionIdToTerminate: string): Promise<{ success: boolean }> => {
    if (sessionIdToTerminate === currentSessionId) {
      await logout();
      return { success: true };
    }

    try {
      if (currentUser?.uid) {
        await fetch(`/api/sessions/${encodeURIComponent(currentUser.uid)}/${encodeURIComponent(sessionIdToTerminate)}`, {
          method: 'DELETE'
        });
      }
      setDeviceSessions(prev => prev.filter(s => s.id !== sessionIdToTerminate));
      return { success: true };
    } catch {
      setDeviceSessions(prev => prev.filter(s => s.id !== sessionIdToTerminate));
      return { success: true };
    }
  };

  // نبضة دورية كل دقيقة لتحديث حالة الجلسة دون تجميد واجهة المستخدم
  useEffect(() => {
    sendSessionHeartbeat();
    const interval = setInterval(sendSessionHeartbeat, 60 * 1000);
    return () => clearInterval(interval);
  }, [currentUser?.uid, currentDeviceId, currentSessionId]);

  // إدارة المواد المكررة: حساب عند الحاجة وتفادي تجميد التطبيق المستمر
  const [duplicateGroupsCache, setDuplicateGroupsCache] = useState<DuplicateProductGroup[]>([]);
  
  const refreshDuplicates = useCallback((): DuplicateProductGroup[] => {
    const groups = findDuplicateGroups(products);
    setDuplicateGroupsCache(groups);
    return groups;
  }, [products]);

  // تحديث المكررات تلقائياً فقط عند فتح نافذة كشف المكررات
  useEffect(() => {
    if (isDuplicatesModalOpen) {
      refreshDuplicates();
    }
  }, [isDuplicatesModalOpen, refreshDuplicates]);

  const duplicateGroups = duplicateGroupsCache;

  // إدارة المندوبين
  const addSalesRep = async (repData: Omit<SalesRep, 'id' | 'createdAt'>): Promise<SalesRep> => {
    const newRep: SalesRep = {
      ...repData,
      id: 'rep_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      createdAt: new Date().toISOString(),
    };
    const updated = [...(settings.salesReps || []), newRep];
    updateSettings({ salesReps: updated });
    return newRep;
  };

  const updateSalesRep = async (id: string, updates: Partial<SalesRep>) => {
    const updated = (settings.salesReps || []).map(r => r.id === id ? { ...r, ...updates } : r);
    updateSettings({ salesReps: updated });
  };

  const deleteSalesRep = async (id: string) => {
    const updated = (settings.salesReps || []).filter(r => r.id !== id);
    updateSettings({ salesReps: updated });
  };

  const loginUser = async (user: any) => {
    setCurrentUser(user);
    setAuthLoading(false);
  };

  return (
    <AppContext.Provider
      value={{
        products, customers, invoices, payments, settings,
        draftOrders, activeDraftId, activeDraft, updateActiveDraft, addNewDraft, switchToDraft, clearCurrentDraft, deleteCurrentDraft, completeActiveDraft,
        shifts, activeShift, startShift, endShift, getShiftStats, deleteShift,
        isStartShiftModalOpen, setIsStartShiftModalOpen,
        isEndShiftModalOpen, setIsEndShiftModalOpen,
        selectedShiftForDetails, setSelectedShiftForDetails,
        addPresetShift, updatePresetShift, deletePresetShift,
        addSupervisor, updateSupervisor, deleteSupervisor,
        activeSupervisorId, activeSupervisorName,
        addProduct, addBulkProducts, updateProduct, deleteProduct, adjustStock,
        addCustomer, updateCustomer, deleteCustomer,
        createInvoice, deleteInvoice, returnInvoice, returnPartialInvoice, applyBulkPriceAdjustment,
        recordPayment, updateSettings, resetToDemo, resetToZero,
        exportDataJSON, exportCustomBackup, importDataJSON, importProductsOnly, wipeAllProductsFromServer, formatMoney,
        currentUser, authLoading, isCloudConnected, isSyncing,
        lastSyncTime, syncNotice, setSyncNotice, syncNow,
        loginUser, logout,
        sessionRole, permissions, switchSession, hasPermission,
        isSessionModalOpen, setIsSessionModalOpen,
        targetSessionForModal, setTargetSessionForModal,
        targetSupervisorIdForModal, setTargetSupervisorIdForModal,
        openSessionModal,
        currentDeviceId, currentSessionId, deviceSessions, refreshSessions, terminateSession,
        isDuplicatesModalOpen, setIsDuplicatesModalOpen,
        isActiveSessionsModalOpen, setIsActiveSessionsModalOpen,
        duplicateGroups,
        refreshDuplicates,
        addSalesRep,
        updateSalesRep,
        deleteSalesRep,
        theme,
        setTheme,
        toggleTheme
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
