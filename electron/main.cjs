/*
 * NovaWatermark 桌面外壳（Electron）
 *
 * 这里用本地回环 HTTP 服务托管静态页面，而不是直接 loadFile(file://)：
 * 页面运行在 http://127.0.0.1 这个安全上下文里，canvas 导出 / getImageData /
 * navigator.clipboard 等能力都不会受 file:// 同源策略影响。
 */
const { app, BrowserWindow, Menu, shell, dialog, session, ipcMain, nativeTheme } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
};

let baseUrl = null;
let server = null;
let win = null;

/*
 * 导出：浏览器里 a[download] 会直接落到下载目录，但 Electron 的下载项没有保存路径时
 * 会一直停在临时文件（%GUID%.tmp）里完不成，所以桌面端改由 preload 接管 blob 下载，
 * 主进程弹原生「另存为」再写盘（见 preload.cjs 与 registerSaveHandler）。
 * 第一张选好目录后，同一批次的后续图片沿用该目录，批量导出不会反复弹窗。
 */
let exportDir = null;
let exportDirAt = 0;
const EXPORT_BATCH_MS = 4000;

function uniquePath(dir, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let candidate = path.join(dir, name);
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, base + ' (' + index + ')' + ext);
    index += 1;
  }
  return candidate;
}

function exportFilters(name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.png') return [{ name: 'PNG 图片', extensions: ['png'] }];
  if (ext === '.jpg' || ext === '.jpeg') return [{ name: 'JPEG 图片', extensions: ['jpg', 'jpeg'] }];
  return [{ name: '所有文件', extensions: ['*'] }];
}

function registerSaveHandler() {
  ipcMain.handle('nova:save-file', async (event, rawName, bytes) => {
    const suggested = String(rawName || '').trim() || 'NovaWatermark-export';
    const now = Date.now();
    let target = null;
    if (exportDir && now - exportDirAt < EXPORT_BATCH_MS) {
      exportDirAt = now;
      target = uniquePath(exportDir, suggested);
    } else {
      const parent = win && !win.isDestroyed() ? win : null;
      const options = {
        title: '导出图片',
        buttonLabel: '保存',
        defaultPath: path.join(app.getPath('downloads'), suggested),
        filters: exportFilters(suggested),
        properties: ['createDirectory', 'showOverwriteConfirmation']
      };
      const result = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { saved: false, canceled: true };
      exportDir = path.dirname(result.filePath);
      exportDirAt = Date.now();
      target = result.filePath;
    }
    try {
      await fs.promises.writeFile(target, Buffer.from(bytes));
      return { saved: true, path: target };
    } catch (err) {
      return { saved: false, error: String((err && err.message) || err) };
    }
  });
}

/*
 * 兜底：万一有下载没被 preload 接管（例如以后新增的下载方式），
 * 也要同步给出保存路径，否则会停在 %GUID%.tmp 里永远完成不了。
 */
function attachDownloadFallback() {
  session.defaultSession.on('will-download', (event, item) => {
    if (item.getSavePath()) return;
    const suggested = item.getFilename() || 'NovaWatermark-export';
    item.setSavePath(uniquePath(app.getPath('downloads'), suggested));
  });
}

/* ------------------------------------------------------------------ *
 * Win11 外壳：隐藏式原生标题栏 + 云母（Mica）材质
 *  - titleBarStyle:'hidden' 让页面铺满到窗口顶端，系统只在右上角自绘
 *    最小化/最大化/关闭，所以没有「一条独立标题栏」的切割感；
 *  - titleBarOverlay.color 用全透明，把这几个按钮直接压在页面上；
 *  - backgroundMaterial:'mica' 由 DWM 在窗口底下画系统材质，页面把最底层
 *    底色降成半透明（见 css 里的 --veil）就能透出来。
 * ------------------------------------------------------------------ */
const CAPTION_H = 36;   // 必须和 css 里的 --titlebar-h 一致
const isWindows = process.platform === 'win32';

function windowsBuild() {
  if (!isWindows) return 0;
  try { return parseInt(String(process.getSystemVersion()).split('.')[2], 10) || 0; } catch (e) { return 0; }
}
/* 云母是 Win11（build 22000+）才有的系统材质 */
const MICA = isWindows && windowsBuild() >= 22000;

function captionOverlay(theme) {
  const dark = theme === 'dark';
  return { color: '#00000000', symbolColor: dark ? '#E9EDF7' : '#2A3550', height: CAPTION_H };
}

function applyShellTheme(theme) {
  if (!win || win.isDestroyed()) return;
  const t = theme === 'dark' ? 'dark' : 'light';
  if (isWindows) {
    try { win.setTitleBarOverlay(captionOverlay(t)); } catch (e) { /* 旧系统不支持，忽略 */ }
  }
  if (!MICA) {
    /* 没有云母时窗口底色由主进程负责，跟随页面主题避免闪白/闪黑 */
    try { win.setBackgroundColor(t === 'dark' ? '#070a11' : '#eef2fb'); } catch (e) { /* ignore */ }
  }
}

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(String(req.url || '/').split('?')[0]);
      const target = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
      if (!target.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      fs.readFile(target, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store'
        });
        res.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function createWindow() {
  const options = {
    width: 1380,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    /* 云母要透出来，窗口底色必须留空；没有云母时给个实色兜底 */
    backgroundColor: MICA ? '#00000000' : '#eef2fb',
    title: 'NovaWatermark',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };
  if (isWindows) {
    options.titleBarStyle = 'hidden';
    options.titleBarOverlay = captionOverlay('light');
    if (MICA) options.backgroundMaterial = 'mica';
  } else if (process.platform === 'darwin') {
    options.titleBarStyle = 'hiddenInset';
  }
  win = new BrowserWindow(options);
  win.on('closed', () => { win = null; });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (baseUrl && !url.startsWith(baseUrl)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  return win.loadURL(baseUrl);
}

app.whenReady().then(async () => {
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  app.setAppUserModelId('com.nova.watermark');
  /* 页面里的 prefers-color-scheme 跟随系统，这样「跟随系统」才是真的跟随 */
  nativeTheme.themeSource = 'system';
  ipcMain.on('nova:shell-info', (event) => {
    event.returnValue = { desktop: true, platform: process.platform, mica: MICA, windows: isWindows };
  });
  ipcMain.on('nova:set-theme', (event, theme) => applyShellTheme(theme));
  registerSaveHandler();
  attachDownloadFallback();
  server = await startServer();
  baseUrl = 'http://127.0.0.1:' + server.address().port + '/';
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (server) { try { server.close(); } catch (e) { /* ignore */ } server = null; }
});
