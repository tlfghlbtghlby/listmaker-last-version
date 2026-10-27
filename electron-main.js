import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'electron-preload.cjs'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
}

// 1. استدعاء قائمة الطابعات المثبتة في الويندوز للاختيار منها داخل الإعدادات لمرة واحدة
ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return [];
  return await mainWindow.webContents.getPrintersAsync();
});

// 2. دالة الطباعة اللحظية المباشرة لطابعة الفواتير (تمنع خروج الورق الفارغ غير المحدود)
const handlePrint = (event, options = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return Promise.resolve(false);

  const isA4 = options.pageSize === 'A4';
  const printOptions = {
    silent: true,            // طباعة صامتة فورية دون نوافذ
    printBackground: true,   // طباعة الرسوم والتصميم بدقة
    deviceName: options.deviceName || '', // توجيه مباشر للطابعة بالاسم
    margins: { marginType: 'default' },
  };

  if (isA4) {
    printOptions.pageSize = 'A4';
  } else {
    // تحديد عرض 72mm مع طول ديناميكي يتوقف مع نهاية الإيصال بدلاً من 297000 (29.7 سم)
    printOptions.pageSize = { width: 72000, height: options.heightMicrons || 80000 };
  }

  return new Promise((resolve) => {
    win.webContents.print(printOptions, (success, failureReason) => {
      if (!success) {
        console.warn('فشل أمر الطباعة الصامتة:', failureReason);
      }
      resolve(success);
    });
  });
};

ipcMain.handle('print-silent', handlePrint);
ipcMain.handle('print-direct', handlePrint);

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
