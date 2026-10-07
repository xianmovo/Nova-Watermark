/*
 * NovaWatermark 桌面外壳的 preload：
 * 页面里的导出是 a[download] + blob 链接，浏览器会直接落盘，但 Electron 的下载项
 * 没有保存路径时会一直停在临时文件里。这里把这类下载接管过来，交给主进程弹原生
 * 「另存为」并写盘，页面本身的代码保持零依赖、也可继续在浏览器里跑。
 */
const { contextBridge, ipcRenderer, webFrame } = require('electron');

/*
 * 同步问一次外壳信息：页面 <head> 里的内联脚本要靠它决定
 * 「隐藏式原生标题栏」与「云母材质」是否生效，异步拿会闪一下。
 */
let shell = { desktop: true, platform: process.platform, mica: false };
try { shell = ipcRenderer.sendSync('nova:shell-info') || shell; } catch (e) { /* 保持默认值 */ }

contextBridge.exposeInMainWorld('novaDesktop', {
  shell: shell,
  saveFile: (name, bytes) => ipcRenderer.invoke('nova:save-file', name, bytes),
  /* 页面决定好用深色还是浅色后回传，主进程据此调整标题栏按钮颜色 */
  setTheme: (theme) => { try { ipcRenderer.send('nova:set-theme', theme === 'dark' ? 'dark' : 'light'); } catch (e) { } }
});

const bootstrap = `(() => {
  if (window.__novaDownloadPatched) return;
  window.__novaDownloadPatched = true;
  const nativeClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    const name = this.getAttribute('download');
    const href = this.getAttribute('href') || '';
    if (!name || href.indexOf('blob:') !== 0 || !window.novaDesktop) {
      return nativeClick.call(this);
    }
    const fallback = () => nativeClick.call(this);
    fetch(href)
      .then((res) => res.arrayBuffer())
      .then((buf) => window.novaDesktop.saveFile(name, new Uint8Array(buf)))
      .catch(fallback);
  };
})();`;

webFrame.executeJavaScript(bootstrap).catch(() => { /* 拦截失败时退回默认下载行为 */ });
