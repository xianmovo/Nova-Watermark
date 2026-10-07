/* NovaWatermark - 界面交互与应用逻辑 */
(function () {
  'use strict';
  var NW = window.NW;
  var LS_KEY = 'novawatermark.state.v2';
  var PREVIEW_EDGE = 1500;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function clampf(v, a, b) { return v < a ? a : v > b ? b : v; }

  var els = {
    fileInput: $('#fileInput'), thumbs: $('#thumbs'), presets: $('#presets'),
    preview: $('#preview'), wrap: $('#canvasWrap'), empty: $('#empty'),
    busy: $('#busy'), statName: $('#statName'), statMeta: $('#statMeta'),
    statSize: $('#statSize'), statTip: $('#statTip'), chips: $('#metaChips'),
    toasts: $('#toasts'), dropZone: $('#dropZone'),
    themeSwatch: $('#themeSwatch'), themeText: $('#themeText'),
    themeBtn: $('#themeBtn'), themeIcon: $('#themeIcon'), upHint: $('#upHint'),
    linePresets: $('#linePresets'), wlines: $('#wlines'), logoInfo: $('#logoInfo')
  };

  var LINE_KEYS = ['l1', 'l2', 'l3', 'l4'];
  var LINE_DEFS = NW.LINE_DEFS || [];
  var TAB_KEY = 'novawatermark.tab';

  var state = loadState();
  var items = [];
  var current = 0;
  var lastScene = null;
  var queued = false;
  var activeLine = null;

  function loadState() {
    var d = NW.DEFAULT_STATE, st = {};
    for (var k in d) st[k] = d[k];
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        for (var k2 in saved) if (k2 in d) st[k2] = saved[k2];
      }
    } catch (e) { }
    st.offsetX = 0;
    st.offsetY = 0;
    return st;
  }

  function saveState() {
    try {
      var o = {};
      for (var k in state) if (k !== 'offsetX' && k !== 'offsetY') o[k] = state[k];
      localStorage.setItem(LS_KEY, JSON.stringify(o));
    } catch (e) { }
  }

  function fmt(v, kind) {
    if (typeof v === 'boolean') return v ? '开' : '关';
    var n = Number(v);
    if (kind === 'pct') return Math.round(n * 100) + '%';
    if (kind === 'pct1') return (n * 100).toFixed(1) + '%';
    if (kind === 'num2') return n.toFixed(2);
    if (kind === 'deg') return Math.round(n) + '\u00b0';
    return String(v);
  }

  /* 同一个 data-bind 可能同时出现在「预设样式」和「高级模式」两处，改一处要同步另一处 */
  function mirrorBind(key, except) {
    var v = state[key];
    $$('[data-bind="' + key + '"]').forEach(function (o) {
      if (o === except) return;
      if (o.type === 'checkbox') o.checked = !!v;
      else if (o.tagName !== 'SELECT') o.value = v;
    });
  }

  function paintRanges() {
    $$('[data-bind]').forEach(function (el) {
      if (el.type !== 'range') return;
      var min = Number(el.min), max = Number(el.max), v = Number(el.value);
      var p = max > min ? (v - min) / (max - min) : 0;
      el.style.setProperty('--fill', (clampf(p, 0, 1) * 100).toFixed(2) + '%');
    });
  }

  function updateOuts() {
    $$('[data-out]').forEach(function (el) {
      el.textContent = fmt(state[el.dataset.out], el.dataset.fmt);
    });
    paintRanges();
    if (els.upHint) {
      els.upHint.textContent = (state.outFormat === 'png' ? 'PNG' : 'JPEG') + ' \u00b7 ' +
        (state.longEdge ? '\u957f\u8fb9 ' + state.longEdge + 'px' : '\u539f\u59cb\u5c3a\u5bf8');
    }
  }

  function syncUI() {
    $$('[data-bind]').forEach(function (el) {
      var k = el.dataset.bind, v = state[k];
      if (v === undefined) return;
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v;
    });
    updateOuts();
    markPreset(state.preset);
    syncGroups();
    syncLines();
  }

  function syncGroups() {
    $$('[data-bind-group]').forEach(function (g) {
      var v = state[g.dataset.bindGroup];
      $$('.pill', g).forEach(function (p) {
        p.classList.toggle('active', p.dataset.value === v);
      });
    });
  }

  function bindTabs() {
    var tabs = $$('.tab');
    if (!tabs.length) return;
    var panes = $$('.tab-pane');
    function show(name) {
      tabs.forEach(function (t) {
        var on = t.dataset.tab === name;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      panes.forEach(function (p) { p.classList.toggle('active', p.dataset.pane === name); });
      try { localStorage.setItem(TAB_KEY, name); } catch (e) { }
    }
    tabs.forEach(function (t) {
      t.addEventListener('click', function () { show(t.dataset.tab); });
    });
    var saved = null;
    try { saved = localStorage.getItem(TAB_KEY); } catch (e) { }
    show(saved === 'advanced' ? 'advanced' : 'simple');
  }

  /* 「预设样式」页里的水印内容：4 行固定槽位，每行 = 开关（是否显示拍摄信息）+ 自定义文字 */
  function lineOn(n) { return state['lineOn' + n] !== false; }
  function lineText(n) { var v = state['lineText' + n]; return v == null ? '' : String(v); }

  /* 由「每行开关 + 自定义文字」推出真正参与渲染的 l1..l4 */
  function lineJoin(tpl, text) {
    var parts = [];
    if (tpl) parts.push(tpl);
    if (text) parts.push(text);
    return parts.join(' \u00b7 ');
  }

  function applyLineState() {
    LINE_DEFS.forEach(function (d, i) {
      var n = i + 1;
      state[d.key] = lineJoin(lineOn(n) ? d.tpl : '', lineText(n).trim());
    });
  }

  function syncLines() {
    $$('[data-line-switch]').forEach(function (b) {
      var on = lineOn(b.dataset.lineSwitch);
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $$('[data-line-text]').forEach(function (el) {
      if (document.activeElement === el) return;
      var v = lineText(el.dataset.lineText);
      if (el.value !== v) el.value = v;
    });
    syncLineTemplate();
  }

  function syncLineTemplate() {
    var host = els.linePresets;
    if (!host) return;
    $$('[data-line-preset]', host).forEach(function (b) {
      var on = String(b.dataset.on || '');
      var same = LINE_DEFS.every(function (d, i) {
        var n = i + 1;
        var wantOn = on.charAt(i) === '1';
        var wantText = String(b.dataset['t' + n] || '').trim();
        /* 高级模式里改过行，胶囊就不再高亮 */
        return lineOn(n) === wantOn && lineText(n).trim() === wantText &&
          state[d.key] === lineJoin(wantOn ? d.tpl : '', wantText);
      });
      b.classList.toggle('active', same);
    });
  }

  /* 简易页改完后，把结果同步到「高级模式」的逐行输入框 */
  function mirrorLines() { LINE_DEFS.forEach(function (d) { mirrorBind(d.key, null); }); }

  function bindLines() {
    $$('[data-line-switch]').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = b.dataset.lineSwitch;
        state['lineOn' + n] = !lineOn(n);
        applyLineState(); mirrorLines(); syncLines(); saveState(); scheduleRender();
      });
    });
    $$('[data-line-text]').forEach(function (el) {
      el.addEventListener('input', function () {
        state['lineText' + el.dataset.lineText] = el.value;
        applyLineState(); mirrorLines(); syncLineTemplate(); saveState(); scheduleRender();
      });
      el.addEventListener('blur', syncLines);
    });
    var host = els.linePresets;
    if (!host) return;
    $$('[data-line-preset]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var on = String(b.dataset.on || '');
        LINE_DEFS.forEach(function (d, i) {
          var n = i + 1;
          state['lineOn' + n] = on.charAt(i) === '1';
          state['lineText' + n] = b.dataset['t' + n] || '';
        });
        applyLineState(); mirrorLines(); syncLines(); saveState(); scheduleRender();
      });
    });
  }

  function bindGroups() {
    $$('[data-bind-group]').forEach(function (g) {
      var key = g.dataset.bindGroup;
      $$('.pill', g).forEach(function (p) {
        p.addEventListener('click', function () {
          state[key] = p.dataset.value;
          saveState();
          syncUI();
          refreshPresetArt();
          scheduleRender();
        });
      });
    });
  }

  function bindControls() {
    $$('[data-bind]').forEach(function (el) {
      el.addEventListener('input', function () {
        if (el.type === 'checkbox') state[el.dataset.bind] = el.checked;
        else if (el.type === 'range' || el.type === 'number') state[el.dataset.bind] = Number(el.value);
        else if (el.tagName === 'SELECT' && el.dataset.type === 'number') state[el.dataset.bind] = Number(el.value);
        else state[el.dataset.bind] = el.value;
        if (el.dataset.bind === 'note') updateChips(items[current]);
        mirrorBind(el.dataset.bind, el);
        if (LINE_KEYS.indexOf(el.dataset.bind) >= 0) syncLineTemplate();
        updateOuts();
        saveState();
        scheduleRender();
      });
    });
    $$('[data-bind^="l"]').forEach(function (el) {
      el.addEventListener('focus', function () { activeLine = el; });
    });
  }

  /* ---------- 厂商 Logo ---------- */

  var LOGO_LABEL = (function () {
    var map = {};
    ((NW.LOGOS && NW.LOGOS.RULES) || []).forEach(function (r) {
      (r.files || []).forEach(function (f) { if (!map[f]) map[f] = r.id; });
    });
    return map;
  })();

  function logoLabel(file) {
    var id = LOGO_LABEL[file];
    if (!id) return String(file).replace(/\.png$/i, '');
    return id.split('-').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
  }

  /* 每个图片项只尝试预载一次 Logo，加载完成后重绘预览 */
  var logoTried = {};
  function ensureLogos(it) {
    if (!it || !NW.LOGOS || !it.logos || !it.logos.length) return;
    var key = it.logos.join(',');
    if (logoTried[key]) return;
    var missing = false;
    for (var i = 0; i < it.logos.length; i++) if (!NW.LOGOS.ready(it.logos[i])) missing = true;
    if (!missing) return;
    logoTried[key] = true;
    NW.LOGOS.load(it.logos).then(function () { scheduleRender(); });
  }

  /* 「高级模式」里显示当前机型的识别结果 */
  var logoInfoKey = null;
  function updateLogoInfo(it) {
    var host = els.logoInfo;
    if (!host) return;
    var key = it ? it.name + '|' + (it.logos || []).join(',') : '';
    if (key === logoInfoKey) return;
    logoInfoKey = key;
    host.innerHTML = '';
    var files = (it && it.logos) || [];
    if (!files.length) {
      var d = document.createElement('span');
      d.className = 'dim';
      d.textContent = it ? '未识别到厂商（EXIF 缺少可匹配的机型）' : '载入图片后显示';
      host.appendChild(d);
      return;
    }
    files.forEach(function (f) {
      if (NW.LOGO_DATA && NW.LOGO_DATA[f]) {
        var img = document.createElement('img');
        img.src = NW.LOGO_DATA[f];
        img.alt = logoLabel(f);
        img.title = logoLabel(f);
        host.appendChild(img);
      }
      var s = document.createElement('span');
      s.className = 'logo-name';
      s.textContent = logoLabel(f) + (NW.LOGO_DATA && NW.LOGO_DATA[f] ? '' : '（素材缺失）');
      host.appendChild(s);
    });
  }

  function buildMeta(it, st) {
    return {
      themeColor: it.theme.color,
      logos: (st.showLogo === false || !it.logos) ? [] : it.logos,
      placeholders: NW.Exif.placeholders(it.exif, {
        file: it.name, width: it.bitmap.width, height: it.bitmap.height,
        note: st.note, beautify: st.beautify
      })
    };
  }

  function fmtSize(n) {
    if (!n) return '';
    if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
    if (n > 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }

  function toast(msg, kind) {
    var d = document.createElement('div');
    d.className = 'toast ' + (kind || '');
    d.textContent = msg;
    els.toasts.appendChild(d);
    setTimeout(function () {
      d.style.transition = 'opacity .3s';
      d.style.opacity = '0';
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 320);
    }, 2800);
  }
  function lumOf(hex) {
    var s = String(hex || '#000').replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var v = parseInt(s, 16);
    if (isNaN(v)) return 0.5;
    return (0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255;
  }

  function findPreset(id) {
    for (var i = 0; i < NW.PRESETS.length; i++) if (NW.PRESETS[i].id === id) return NW.PRESETS[i];
    return null;
  }

  function buildPresets() {
    els.presets.innerHTML = '';
    NW.PRESETS.forEach(function (p) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'preset';
      card.dataset.preset = p.id;
      card.title = p.desc;
      card.innerHTML = '<div class="preset-mini"><div class="preset-bg"></div><div class="preset-art">' +
        '<div class="preset-shot"></div><div class="preset-lines"><i></i><i></i><i></i></div></div></div>' +
        '<div class="preset-name"></div>';
      $('.preset-name', card).textContent = p.name;
      card.addEventListener('click', function () { applyPreset(p.id); });
      els.presets.appendChild(card);
    });
    refreshPresetArt();
  }

  function markPreset(id) {
    $$('.preset', els.presets).forEach(function (c) {
      c.classList.toggle('active', c.dataset.preset === id);
    });
  }

  function refreshPresetArt() {
    var it = items[current];
    var url = it ? it.url : '';
    var imgLum = it ? it.theme.luminance : 0.42;
    $$('.preset', els.presets).forEach(function (card) {
      var p = findPreset(card.dataset.preset);
      if (!p) return;
      var st = p.patch;
      var bg = $('.preset-bg', card), art = $('.preset-art', card);
      var shot = $('.preset-shot', card), lines = $('.preset-lines', card);
      var bars = $$('i', lines);

      bg.style.cssText = 'position:absolute;inset:-8px;';
      if (st.bgType === 'blur' && url) {
        bg.style.backgroundImage = 'url("' + url + '")';
        bg.style.backgroundSize = 'cover';
        bg.style.backgroundPosition = 'center';
        bg.style.filter = 'blur(' + (2.5 + st.blurStrength * 7).toFixed(1) + 'px) brightness(' + st.brightness + ') saturate(1.2)';
      } else if (st.bgType === 'gradient') {
        bg.style.background = 'linear-gradient(' + (st.gradientAngle + 90) + 'deg,' + st.bgColor + ',' + st.bgColor2 + ')';
      } else {
        bg.style.background = st.bgColor || '#111';
      }

      var bgLum = st.bgType === 'solid' ? lumOf(st.bgColor)
        : st.bgType === 'gradient' ? (lumOf(st.bgColor) + lumOf(st.bgColor2)) / 2
          : clampf(imgLum * st.brightness, 0, 1);
      var fg = st.colorMode === 'light' ? '#ffffff'
        : st.colorMode === 'dark' ? '#15171c'
          : st.colorMode === 'custom' ? (st.color || '#ffffff')
            : (bgLum > 0.62 ? '#15171c' : '#ffffff');

      var shotBg = url ? 'url("' + url + '") center/cover no-repeat' : 'linear-gradient(135deg,#6D8CC4,#8DA6D2 55%,#F9D77C)';
      art.style.cssText = 'position:relative;z-index:1;width:100%;height:100%;';
      shot.style.cssText = 'flex:none;background:' + shotBg + ';';
      lines.style.cssText = 'display:flex;';
      bars.forEach(function (b) { b.style.cssText = 'display:block;border-radius:2px;'; });

      if (st.layout === 'overlay') {
        art.style.cssText += 'padding:0;display:flex;align-items:stretch;height:100%;';
        shot.style.cssText += 'flex:1;width:100%;height:100%;border-radius:2px;';
        art.style.background = st.glass ? 'none' : 'linear-gradient(to top,rgba(0,0,0,' + (0.35 + st.scrim * 0.6) + '),rgba(0,0,0,0) 62%)';
        lines.style.cssText += 'position:absolute;left:8px;right:8px;bottom:7px;z-index:2;flex-direction:column;gap:2.5px;' +
          (st.glass ? 'background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25);border-radius:5px;padding:3px 5px;' : '') +
          'align-items:' + (st.align === 'center' ? 'center' : st.align === 'right' ? 'flex-end' : 'flex-start') + ';';
        bars.forEach(function (b, i) { b.style.height = '2.5px'; b.style.width = (i === 0 ? 26 : i === 1 ? 20 : 14) + 'px'; b.style.background = fg; });
      } else if (st.layout === 'side') {
        art.style.cssText += 'padding:0;display:flex;align-items:center;height:100%;';
        art.style.background = 'none';
        shot.style.cssText += 'width:calc(100% - 24px);height:100%;';
        lines.style.cssText += 'flex:none;width:24px;height:100%;background:' + (st.bgColor || '#111') + ';flex-direction:row;gap:2.5px;align-items:center;justify-content:center;' +
          'order:' + (st.edge === 'left' ? '-1' : '1') + ';border-radius:0;';
        bars.forEach(function (b, i) { b.style.width = '2.5px'; b.style.height = (i === 0 ? 15 : i === 1 ? 11 : 7) + 'px'; b.style.background = fg; });
      } else {
        var isTop = st.edge === 'top';
        art.style.cssText += 'display:flex;flex-direction:column;gap:4px;height:100%;justify-content:center;' +
          'padding:' + (isTop ? '8px 12px 5px' : '5px 12px 8px') + ';align-items:' + (st.align === 'center' ? 'center' : st.align === 'right' ? 'flex-end' : 'flex-start') + ';';
        art.style.background = 'none';
        shot.style.cssText += 'width:' + (st.layout === 'blur' ? 66 : 100) + '%;height:' + (st.layout === 'blur' ? 28 : Math.max(18, 32 - Math.min(12, (st.bottomSpace - 1) * 6)).toFixed(0)) + 'px;border-radius:' + (st.radius > 0.004 ? '3px' : '0') + ';' +
          (st.shadow > 0.05 ? 'box-shadow:0 3px 8px rgba(0,0,0,' + Math.min(0.6, st.shadow) + ');' : '');
        lines.style.cssText += 'flex-direction:column;gap:2.5px;order:' + (isTop ? '-1' : '1') + ';' +
          'align-items:' + (st.align === 'center' ? 'center' : st.align === 'right' ? 'flex-end' : 'flex-start') + ';';
        bars.forEach(function (b, i) { b.style.height = '2.5px'; b.style.width = (i === 0 ? 30 : i === 1 ? 22 : 15) + 'px'; b.style.background = fg; });
      }
    });
  }

  function applyPreset(id) {
    var p = findPreset(id);
    if (!p) return;
    for (var k in p.patch) state[k] = p.patch[k];
    state.preset = id;
    state.offsetX = 0;
    state.offsetY = 0;
    saveState();
    syncUI();
    refreshPresetArt();
    scheduleRender();
  }

  function updateChips(it) {
    var ph = it ? NW.Exif.placeholders(it.exif, {
      file: it.name, width: it.bitmap.width, height: it.bitmap.height,
      note: state.note, beautify: state.beautify
    }) : {};
    els.chips.innerHTML = '';
    NW.Exif.PLACEHOLDER_DEFS.forEach(function (d) {
      var val = ph[d.key] || '';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (val ? '' : ' is-empty');
      b.title = d.label + '：' + (val || '暂无数据（若图片没有该 EXIF 字段则留空）');
      b.innerHTML = d.label + ' <b>{' + d.key + '}</b>';
      b.addEventListener('click', function () { insertToken('{' + d.key + '}'); });
      els.chips.appendChild(b);
    });
  }

  function insertToken(tok) {
    var el = activeLine || $('[data-bind="l1"]');
    if (!el) return;
    var start = el.selectionStart == null ? el.value.length : el.selectionStart;
    var end = el.selectionEnd == null ? el.value.length : el.selectionEnd;
    el.value = el.value.slice(0, start) + tok + el.value.slice(end);
    state[el.dataset.bind] = el.value;
    syncLineTemplate();
    el.focus();
    try { el.setSelectionRange(start + tok.length, start + tok.length); } catch (e) { }
    saveState();
    scheduleRender();
  }
  function decodeImage(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () {
        return createImageBitmap(file).catch(function () { return loadViaImg(file); });
      });
    }
    return loadViaImg(file);
  }

  function loadViaImg(file) {
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () { res(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('decode-failed')); };
      img.src = url;
    });
  }

  function addFiles(list) {
    var files = Array.prototype.slice.call(list || []).filter(function (f) {
      return /^image\//.test(f.type) || /\.(jpe?g|png|webp|avif|gif|bmp)$/i.test(f.name || '');
    });
    if (!files.length) { toast('没有识别到图片文件', 'err'); return; }
    els.busy.hidden = false;
    var firstNew = items.length;
    var chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () {
        return decodeImage(f).then(function (bitmap) {
          return f.arrayBuffer().then(function (buf) {
            var bytes = new Uint8Array(buf);
            var exif = { ok: false, raw: {} };
            try { exif = NW.Exif.parse(bytes); } catch (e) { }
            var tiff = null;
            try { tiff = NW.Exif.extractTiff(bytes); } catch (e) { }
            var logos = [];
            try {
              var ph = NW.Exif.placeholders(exif, {});
              logos = NW.LOGOS ? NW.LOGOS.detect(ph.Make, ph.ModelRaw) : [];
            } catch (e2) { }
            items.push({
              file: f, name: f.name || 'image', url: URL.createObjectURL(f),
              bitmap: bitmap, exif: exif, exifTiff: tiff, theme: NW.extractTheme(bitmap), size: f.size,
              logos: logos
            });
          });
        }).catch(function () {
          toast('无法解码 ' + f.name + '（HEIC/CMYK 等格式需先转成 JPEG）', 'err');
        });
      });
    });
    chain.then(function () {
      els.busy.hidden = true;
      if (items.length > firstNew) current = firstNew;
      renderThumbs();
      refreshPresetArt();
      renderNow();
      updateChips(items[current]);
      items.forEach(ensureLogos);
      if (items.length) toast('已载入 ' + items.length + ' 张图片', 'ok');
    });
  }

  function renderThumbs() {
    els.thumbs.innerHTML = '';
    items.forEach(function (it, i) {
      var d = document.createElement('div');
      d.className = 'thumb' + (i === current ? ' active' : '');
      d.title = it.name;
      var img = document.createElement('img');
      img.src = it.url;
      d.appendChild(img);
      if (!NW.Exif.hasUsefulData(it.exif)) {
        var b = document.createElement('span');
        b.className = 'badge';
        b.textContent = '无EXIF';
        d.appendChild(b);
      }
      var x = document.createElement('button');
      x.className = 'x';
      x.textContent = '\u00d7';
      x.title = '移除';
      x.addEventListener('click', function (e) {
        e.stopPropagation();
        removeItem(i);
      });
      d.appendChild(x);
      d.addEventListener('click', function () {
        current = i;
        renderThumbs();
        refreshPresetArt();
        renderNow();
        updateChips(it);
      });
      els.thumbs.appendChild(d);
    });
  }

  function removeItem(i) {
    var it = items[i];
    if (it && it.url) URL.revokeObjectURL(it.url);
    items.splice(i, 1);
    if (current >= items.length) current = Math.max(0, items.length - 1);
    renderThumbs();
    refreshPresetArt();
    updateChips(items[current]);
    renderNow();
  }

  function clearImages() {
    items.forEach(function (it) { if (it.url) URL.revokeObjectURL(it.url); });
    items = [];
    current = 0;
    renderThumbs();
    refreshPresetArt();
    updateChips(null);
    showEmpty();
    toast('已清空图片');
  }

  function showEmpty() {
    els.empty.classList.remove('hide');
    els.preview.hidden = true;
    els.statName.textContent = '未载入图片';
    els.statMeta.textContent = '';
    els.statMeta.className = 'tag';
    els.statSize.textContent = '\u2014';
    lastScene = null;
  }

  function scheduleRender() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      renderNow();
    });
  }

  function renderNow() {
    var it = items[current];
    if (!it) { showEmpty(); return; }
    ensureLogos(it);
    updateLogoInfo(it);
    var meta = buildMeta(it, state);
    var plan = NW.computePlan({ source: it.bitmap, st: state, meta: meta });
    var scale = Math.min(1, PREVIEW_EDGE / Math.max(plan.W, plan.H));
    var scene = NW.paintScene({ plan: plan, st: state, source: it.bitmap, scale: scale, themeColor: it.theme.color });
    lastScene = scene;

    var c = els.preview;
    if (c.width !== scene.canvas.width || c.height !== scene.canvas.height) {
      c.width = scene.canvas.width;
      c.height = scene.canvas.height;
    }
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(scene.canvas, 0, 0);
    c.hidden = false;
    els.empty.classList.add('hide');
    if (els.themeSwatch) els.themeSwatch.style.background = it.theme.color;
    if (els.themeText) els.themeText.textContent = String(it.theme.color).toUpperCase();

    var ph = meta.placeholders;
    els.statName.textContent = it.name;
    els.statMeta.textContent = ph.Camera || '未读取到 EXIF';
    els.statMeta.className = 'tag ' + (ph.Camera ? 'ok' : 'warn');
    els.statSize.textContent = '输出: ' + plan.W + ' \u00d7 ' + plan.H + ' px  ·  ' + it.bitmap.width + ' \u00d7 ' + it.bitmap.height + ' px 来源' +
      (scale < 1 ? '  ·  预览 ' + Math.round(scale * 100) + '%' : '');
  }
  function fullRender(it) {
    if (!it) return null;
    var meta = buildMeta(it, state);
    var plan = NW.computePlan({ source: it.bitmap, st: state, meta: meta });
    var scale = state.longEdge ? Math.min(1, state.longEdge / Math.max(plan.W, plan.H)) : 1;
    var scene = NW.paintScene({
      plan: plan, st: state, source: it.bitmap, scale: scale,
      themeColor: it.theme.color, textColor: lastScene ? lastScene.color : null
    });
    return { canvas: scene.canvas, item: it, plan: plan, scale: scale };
  }

  function outName(name, suffix, fmt) {
    var base = String(name || 'image').replace(/\.[^.]+$/, '');
    return base + (suffix || '') + (fmt === 'png' ? '.png' : '.jpg');
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 5000);
  }

  function outMime() { return state.outFormat === 'png' ? 'image/png' : 'image/jpeg'; }

  /*
   * 编码画布，并把源照片的 EXIF 原样带回导出结果：
   * JPEG 写回 APP1 段，PNG 写入 eXIf 块；方向重置为 1（像素已经转过正），
   * 同时把 Exif 子 IFD 里的宽高更新为导出尺寸。
   */
  function encodeCanvas(canvas, item, mime, quality, cb) {
    if (!canvas.toBlob) { cb(null, mime); return; }
    canvas.toBlob(function (blob) {
      if (!blob || !item || !item.exifTiff || !blob.arrayBuffer) { cb(blob, mime); return; }
      blob.arrayBuffer().then(function (ab) {
        var merged = NW.Exif.embedExif(new Uint8Array(ab), item.exifTiff, {
          width: canvas.width, height: canvas.height
        });
        cb(merged ? new Blob([merged], { type: mime }) : blob, mime);
      }, function () { cb(blob, mime); });
    }, mime, quality);
  }

  function exifTag(item) {
    return item && item.exifTiff ? ' \u00b7 \u5df2\u4fdd\u7559 EXIF' : ' \u00b7 \u6e90\u56fe\u65e0 EXIF';
  }

  function withLogos(it, fn) {
    if (it && NW.LOGOS && it.logos && it.logos.length) NW.LOGOS.load(it.logos).then(fn);
    else fn();
  }

  function exportCurrent() {
    var it = items[current];
    if (!it) { toast('请先添加图片', 'err'); return; }
    els.busy.hidden = false;
    withLogos(it, function () { runExportCurrent(); });
  }

  function runExportCurrent() {
    var res = fullRender(items[current]);
    if (!res) { els.busy.hidden = true; toast('请先添加图片', 'err'); return; }
    els.busy.hidden = false;
    setTimeout(function () {
      encodeCanvas(res.canvas, res.item, outMime(), state.quality, function (blob) {
        els.busy.hidden = true;
        if (!blob) { toast('导出失败', 'err'); return; }
        download(blob, outName(res.item.name, state.suffix, state.outFormat));
        toast('已导出 ' + res.canvas.width + ' \u00d7 ' + res.canvas.height + ' px' + exifTag(res.item), 'ok');
      });
    }, 30);
  }

  /* 导出当页：只导出当前预览的这一张（与「导出全部」成对使用） */
  function exportPage() {
    if (!items.length) { toast('请先添加图片', 'err'); return; }
    exportCurrent();
  }

  function exportAll() {
    if (!items.length) { toast('请先添加图片', 'err'); return; }
    els.busy.hidden = false;
    var list = items.slice();
    if (NW.LOGOS) {
      var jobs = [];
      list.forEach(function (it) { if (it.logos && it.logos.length) jobs.push(NW.LOGOS.load(it.logos)); });
      if (jobs.length) { Promise.all(jobs).then(runExportAll); return; }
    }
    runExportAll();
  }

  function runExportAll() {
    var list = items.slice();
    var i = 0;
    function next() {
      if (i >= list.length) {
        els.busy.hidden = true;
        toast('已完成 ' + list.length + ' 张导出', 'ok');
        return;
      }
      var it = list[i++];
      var res = fullRender(it);
      if (!res) { next(); return; }
      encodeCanvas(res.canvas, res.item, outMime(), state.quality, function (blob) {
        if (blob) download(blob, outName(it.name, state.suffix, state.outFormat));
        setTimeout(next, 450);
      });
    }
    next();
  }

  function copyCurrent() {
    var it0 = items[current];
    if (!it0) { toast('请先添加图片', 'err'); return; }
    withLogos(it0, runCopyCurrent);
  }

  function runCopyCurrent() {
    var res = fullRender(items[current]);
    if (!res) { toast('请先添加图片', 'err'); return; }
    if (!navigator.clipboard || !window.ClipboardItem || !res.canvas.toBlob) {
      toast('当前环境不支持复制，请使用导出', 'err');
      return;
    }
    encodeCanvas(res.canvas, res.item, 'image/png', undefined, function (blob) {
      if (!blob) { toast('复制失败，请使用导出', 'err'); return; }
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(function () {
        toast('已复制到剪贴板', 'ok');
      }, function () {
        toast('复制失败，请使用导出', 'err');
      });
    });
  }

  function themeOf() {
    var it = items[current];
    return it ? it.theme.color : '#2a2f3a';
  }

  function resetStyle() {
    var p = findPreset(state.preset) || NW.PRESETS[0];
    for (var k in p.patch) state[k] = p.patch[k];
    state.offsetX = 0;
    state.offsetY = 0;
    saveState();
    syncUI();
    refreshPresetArt();
    scheduleRender();
    toast('已恢复「' + p.name + '」的默认样式');
  }

  function resetAll() {
    var d = NW.DEFAULT_STATE;
    for (var k in d) state[k] = d[k];
    state.offsetX = 0;
    state.offsetY = 0;
    try { localStorage.removeItem(LS_KEY); } catch (e) { }
    syncUI();
    refreshPresetArt();
    scheduleRender();
    toast('已恢复全部默认设置');
  }
  function bindActions() {
    document.addEventListener('click', function (e) {
      var el = e.target;
      var btn = el && el.closest ? el.closest('[data-action]') : null;
      if (!btn) return;
      var a = btn.dataset.action;
      if (a === 'pick') els.fileInput.click();
      else if (a === 'clear-images') clearImages();
      else if (a === 'export-current') exportCurrent();
      else if (a === 'export-all') exportAll();
      else if (a === 'export-page') exportPage();
      else if (a === 'copy') copyCurrent();
      else if (a === 'reset-offset') { state.offsetX = 0; state.offsetY = 0; saveState(); scheduleRender(); }
      else if (a === 'theme-bg') {
        state.bgType = 'solid';
        state.bgColor = themeOf();
        syncUI(); saveState(); refreshPresetArt(); scheduleRender();
        toast('已使用主题色作为背景色');
      } else if (a === 'theme-boost') {
        state.bgType = 'blur';
        state.tint = 0.5;
        syncUI(); saveState(); refreshPresetArt(); scheduleRender();
        toast('已增强主题色叠加');
      }
      else if (a === 'reset-style') resetStyle();
      else if (a === 'reset-all') resetAll();
    });

    els.fileInput.addEventListener('change', function () {
      addFiles(els.fileInput.files);
      els.fileInput.value = '';
    });

    $$('[data-zoom]').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('[data-zoom]').forEach(function (o) { o.classList.toggle('active', o === b); });
        if (b.dataset.zoom === 'fit') {
          els.preview.style.maxWidth = '100%';
          els.preview.style.maxHeight = '100%';
        } else {
          els.preview.style.maxWidth = els.preview.width + 'px';
          els.preview.style.maxHeight = 'none';
        }
      });
    });

    window.addEventListener('keydown', function (e) {
      var meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      var k = e.key.toLowerCase();
      if (k === 'o') { e.preventDefault(); els.fileInput.click(); }
      else if (k === 's') { e.preventDefault(); exportCurrent(); }
    });
  }

  function bindDrop() {
    ['dragenter', 'dragover'].forEach(function (ev) {
      window.addEventListener(ev, function (e) {
        e.preventDefault();
        if (els.dropZone) els.dropZone.classList.add('hot');
      });
    });
    ['dragleave', 'dragend'].forEach(function (ev) {
      window.addEventListener(ev, function () {
        if (els.dropZone) els.dropZone.classList.remove('hot');
      });
    });
    window.addEventListener('drop', function (e) {
      e.preventDefault();
      if (els.dropZone) els.dropZone.classList.remove('hot');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });
    window.addEventListener('paste', function (e) {
      var f = e.clipboardData && e.clipboardData.files;
      if (f && f.length) addFiles(f);
    });
  }

  function bindDragWatermark() {
    var c = els.preview;
    var drag = null;
    c.addEventListener('pointerdown', function (e) {
      if (!lastScene) return;
      var r = c.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var k = lastScene.plan.W / r.width;
      var px = (e.clientX - r.left) * k, py = (e.clientY - r.top) * k;
      var t = lastScene.plan.text, tol = Math.max(10, lastScene.plan.base * 1.5);
      if (px < t.x - tol || px > t.x + t.w + tol || py < t.y - tol || py > t.y + t.h + tol) return;
      e.preventDefault();
      drag = { x: e.clientX, y: e.clientY, ox: state.offsetX, oy: state.offsetY, k: k };
      try { c.setPointerCapture(e.pointerId); } catch (err) { }
      c.classList.add('dragging');
    });
    c.addEventListener('pointermove', function (e) {
      if (!drag) {
        if (!lastScene) return;
        var r2 = c.getBoundingClientRect();
        var k2 = lastScene.plan.W / (r2.width || 1);
        var px2 = (e.clientX - r2.left) * k2, py2 = (e.clientY - r2.top) * k2;
        var t2 = lastScene.plan.text, tol2 = Math.max(10, lastScene.plan.base * 1.5);
        var inside = px2 >= t2.x - tol2 && px2 <= t2.x + t2.w + tol2 && py2 >= t2.y - tol2 && py2 <= t2.y + t2.h + tol2;
        c.classList.toggle('drag', inside);
        return;
      }
      var it = items[current];
      if (!it) return;
      var dx = ((e.clientX - drag.x) * drag.k) / it.bitmap.width;
      var dy = ((e.clientY - drag.y) * drag.k) / it.bitmap.height;
      state.offsetX = clampf(drag.ox + dx, -0.95, 0.95);
      state.offsetY = clampf(drag.oy + dy, -0.95, 0.95);
      updateOuts();
      scheduleRender();
    });
    function endDrag() {
      if (!drag) return;
      drag = null;
      c.classList.remove('dragging');
      saveState();
    }
    c.addEventListener('pointerup', endDrag);
    c.addEventListener('pointercancel', endDrag);
    c.addEventListener('dblclick', function () {
      state.offsetX = 0;
      state.offsetY = 0;
      saveState();
      scheduleRender();
    });
  }

  var THEME_KEY = 'novawatermark.theme';
  var THEME_ORDER = ['system', 'light', 'dark'];
  var ICON_MOON = '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"/>';
  var ICON_SUN = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/>';
  var ICON_AUTO = '<circle cx="12" cy="12" r="8.6"/><path d="M12 3.4a8.6 8.6 0 0 0 0 17.2Z" fill="currentColor" stroke="none"/>';

  var mqDark = null;
  try { mqDark = window.matchMedia('(prefers-color-scheme: dark)'); } catch (e) { }

  function themeMode() {
    var m = document.documentElement.dataset.themeMode;
    return m === 'light' || m === 'dark' ? m : 'system';
  }
  function systemPrefersDark() { return !!(mqDark && mqDark.matches); }
  function resolveTheme(mode) {
    if (mode === 'dark') return 'dark';
    if (mode === 'light') return 'light';
    return systemPrefersDark() ? 'dark' : 'light';
  }
  function tellDesktop(theme) {
    var d = window.novaDesktop;
    if (d && typeof d.setTheme === 'function') { try { d.setTheme(theme); } catch (e) { } }
  }

  function paintThemeIcon() {
    var mode = themeMode();
    if (els.themeIcon) {
      els.themeIcon.innerHTML = mode === 'system' ? ICON_AUTO
        : document.documentElement.dataset.theme === 'dark' ? ICON_MOON : ICON_SUN;
    }
    if (els.themeBtn) {
      var label = mode === 'system' ? '主题：跟随系统' : mode === 'dark' ? '主题：深色' : '主题：浅色';
      els.themeBtn.title = label + '（点击切换）';
      els.themeBtn.setAttribute('aria-label', label);
    }
  }

  function applyTheme(mode, persist) {
    var root = document.documentElement;
    root.dataset.themeMode = mode;
    root.dataset.theme = resolveTheme(mode);
    if (persist) { try { localStorage.setItem(THEME_KEY, mode); } catch (e) { } }
    paintThemeIcon();
    tellDesktop(root.dataset.theme);
  }

  function bindTheme() {
    paintThemeIcon();
    tellDesktop(resolveTheme(themeMode()));
    if (mqDark) {
      var onSystemChange = function () { if (themeMode() === 'system') applyTheme('system', false); };
      if (mqDark.addEventListener) mqDark.addEventListener('change', onSystemChange);
      else if (mqDark.addListener) mqDark.addListener(onSystemChange);
    }
    if (!els.themeBtn) return;
    els.themeBtn.addEventListener('click', function () {
      var next = THEME_ORDER[(THEME_ORDER.indexOf(themeMode()) + 1) % THEME_ORDER.length];
      applyTheme(next, true);
    });
  }

  function init() {
    bindActions();
    bindControls();
    bindGroups();
    bindLines();
    bindTabs();
    bindTheme();
    bindDrop();
    bindDragWatermark();
    buildPresets();
    syncUI();
    updateChips(null);
    showEmpty();
    els.statTip.textContent = '快捷：Ctrl+O 选图 · Ctrl+S 导出 · 预览图可拖动水印 · EXIF 仅在本机解析';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();