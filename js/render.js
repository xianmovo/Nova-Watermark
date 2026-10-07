/* NovaWatermark - Canvas 渲染引擎（版式 / 背景 / 水印排版 / 导出） */
(function (global) {
  'use strict';
  var NW = (global.NW = global.NW || {});

  var FONTS = {
    sans: 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", Roboto, Arial, sans-serif',
    serif: 'Georgia, "Times New Roman", "Songti SC", "SimSun", serif',
    mono: '"Cascadia Mono", Consolas, "SF Mono", "JetBrains Mono", Menlo, monospace',
    hand: '"Segoe Print", "Bradley Hand", "Comic Sans MS", "KaiTi", "STKaiti", cursive'
  };
  NW.FONTS = FONTS;

  var ROLE = [
    { key: 'l1', size: 1, weight: 700, gapBefore: 0, ls: 0.02, alpha: 1 },
    { key: 'l2', size: 0.72, weight: 500, gapBefore: 0.34, ls: 0.02, alpha: 0.93 },
    { key: 'l3', size: 0.62, weight: 500, gapBefore: 0.34, ls: 0.07, alpha: 0.82 },
    { key: 'l4', size: 0.52, weight: 400, gapBefore: 0.32, ls: 0.12, alpha: 0.64 }
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  var measureCtx = null;
  function mctx() {
    if (!measureCtx) measureCtx = makeCanvas(8, 8).getContext('2d');
    return measureCtx;
  }

  function pathRound(ctx, x, y, w, h, r) {
    var rr = Math.min(Math.max(0, r), Math.min(w, h) / 2);
    ctx.beginPath();
    if (rr <= 0.01) { ctx.rect(x, y, w, h); return; }
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y); ctx.arcTo(x + w, y, x + w, y + rr, rr);
    ctx.lineTo(x + w, y + h - rr); ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    ctx.lineTo(x + rr, y + h); ctx.arcTo(x, y + h, x, y + h - rr, rr);
    ctx.lineTo(x, y + rr); ctx.arcTo(x, y, x + rr, y, rr);
    ctx.closePath();
  }

  var charCache = {};
  function chars(text) { return Array.from ? Array.from(text) : text.split(''); }
  function charWidthSum(ctx, text) {
    var key = ctx.font + '|' + text, hit = charCache[key];
    if (hit == null) {
      if (Object.keys(charCache).length > 3000) charCache = {};
      var list = chars(text), w = 0;
      for (var i = 0; i < list.length; i++) w += ctx.measureText(list[i]).width;
      charCache[key] = w;
      return w;
    }
    return hit;
  }

  function measureText(ctx, text, font, spacing) {
    if (ctx.font !== font) ctx.font = font;
    if (!spacing) return ctx.measureText(text).width;
    var n = chars(text).length;
    return charWidthSum(ctx, text) + spacing * Math.max(0, n - 1);
  }

  function drawText(ctx, text, x, baseline, font, spacing) {
    ctx.font = font;
    if (!spacing) { ctx.fillText(text, x, baseline); return; }
    var list = chars(text), cx = x;
    for (var i = 0; i < list.length; i++) {
      ctx.fillText(list[i], cx, baseline);
      cx += ctx.measureText(list[i]).width + spacing;
    }
  }

  function drawCover(ctx, src, dx, dy, dw, dh) {
    var iw = src.width, ih = src.height;
    if (!iw || !ih) return;
    var s = Math.max(dw / iw, dh / ih);
    var sw = dw / s, sh = dh / s;
    ctx.drawImage(src, (iw - sw) / 2, (ih - sh) / 2, sw, sh, dx, dy, dw, dh);
  }

  function rgbToHex(r, g, b) {
    function h(v) { var s = Math.round(clamp(v, 0, 255)).toString(16); return s.length < 2 ? '0' + s : s; }
    return '#' + h(r) + h(g) + h(b);
  }

  function hueOf(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d === 0) return 0;
    var h;
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    return h < 0 ? h + 360 : h;
  }

  function extractTheme(source) {
    var c = makeCanvas(72, 72), ctx = c.getContext('2d');
    drawCover(ctx, source, 0, 0, 72, 72);
    var d;
    try { d = ctx.getImageData(0, 0, 72, 72).data; } catch (e) { return { color: '#54617a', luminance: 0.5 }; }
    var buckets = [], i;
    for (i = 0; i < 12; i++) buckets.push({ w: 0, r: 0, g: 0, b: 0 });
    var sr = 0, sg = 0, sb = 0, lum = 0, n = 0;
    for (i = 0; i < d.length; i += 4) {
      var r = d[i], g = d[i + 1], b = d[i + 2];
      sr += r; sg += g; sb += b; n++;
      lum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      var sat = mx === 0 ? 0 : (mx - mn) / mx, val = mx / 255;
      if (sat < 0.16 || val < 0.13) continue;
      var idx = Math.floor(hueOf(r, g, b) / 30) % 12;
      var weight = Math.pow(sat, 1.4) * (0.4 + 0.6 * (1 - Math.abs(val - 0.55)));
      var bk = buckets[idx];
      bk.w += weight; bk.r += r * weight; bk.g += g * weight; bk.b += b * weight;
    }
    lum = n ? lum / n : 0.5;
    var best = null;
    for (i = 0; i < 12; i++) if (buckets[i].w > 0 && (!best || buckets[i].w > best.w)) best = buckets[i];
    var col = best && best.w > 0.4
      ? rgbToHex(best.r / best.w, best.g / best.w, best.b / best.w)
      : rgbToHex(sr / (n || 1), sg / (n || 1), sb / (n || 1));
    return { color: col, luminance: lum };
  }

  function smoothUpscale(srcCanvas, W, H) {
    var cur = srcCanvas;
    while (cur.width * 3.2 < W) {
      var nw = Math.min(W, Math.round(cur.width * 3.2)), nh = Math.min(H, Math.round(cur.height * 3.2));
      var c = makeCanvas(nw, nh), cx = c.getContext('2d');
      cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
      cx.drawImage(cur, 0, 0, nw, nh);
      cur = c;
    }
    return cur;
  }

  function blurCover(source, W, H, st, themeColor) {
    var strength = clamp(num(st.blurStrength, 0.6), 0, 1);
    /* div = 下采样倍数，越大越糊；数值越大 => 模糊半径越大 */
    var div = 4 + strength * 70;
    var sw = Math.max(4, Math.round(W / div)), sh = Math.max(4, Math.round(H / div));
    var small = makeCanvas(sw, sh);
    drawCover(small.getContext('2d'), source, 0, 0, sw, sh);
    var up = smoothUpscale(small, W, H);
    var out = makeCanvas(W, H), ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(up, 0, 0, W, H);
    var br = num(st.brightness, 1);
    if (br < 0.995) { ctx.fillStyle = 'rgba(0,0,0,' + clamp(1 - br, 0, 1).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
    else if (br > 1.005) { ctx.fillStyle = 'rgba(255,255,255,' + clamp(br - 1, 0, 1).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
    var tint = clamp(num(st.tint, 0), 0, 1);
    if (tint > 0.004 && themeColor) {
      ctx.save();
      ctx.globalAlpha = tint;
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = themeColor;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    return out;
  }

  function paintVignette(ctx, W, H, amount) {
    if (amount <= 0.01) return;
    var g = ctx.createRadialGradient(W * 0.5, H * 0.42, Math.min(W, H) * 0.16, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + clamp(amount, 0, 1).toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function makeGradient(ctx, W, H, angle, c1, c2) {
    var a = ((num(angle, 160) % 360) * Math.PI) / 180;
    var len = Math.abs(W * Math.cos(a)) + Math.abs(H * Math.sin(a));
    var dx = (Math.cos(a) * len) / 2, dy = (Math.sin(a) * len) / 2;
    var g = ctx.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    return g;
  }
  function buildItems(st, meta) {
    var items = [], i;
    for (i = 0; i < ROLE.length; i++) {
      var r = ROLE[i];
      var tpl = String(st[r.key] == null ? '' : st[r.key]).trim();
      if (!tpl) continue;
      var text = NW.Exif.tidy(NW.Exif.applyTemplate(tpl, meta.placeholders));
      if (!text) continue;
      if (r.key === 'l1' && st.uppercase) text = text.toUpperCase();
      items.push({ key: r.key, text: text, size: r.size, weight: r.weight, gapBefore: r.gapBefore, ls: r.ls, alpha: r.alpha });
    }
    if (!items.length) {
      items.push({
        key: 'fallback', text: meta.placeholders.File || 'Photo', size: 1, weight: 700,
        gapBefore: 0, ls: 0.02, alpha: 1, fallback: true
      });
    }
    return items;
  }

  function layoutBlock(ctx, items, base, st, family) {
    var lines = [], h = 0, w = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var size = base * it.size;
      var font = it.weight + ' ' + size.toFixed(2) + 'px ' + family;
      var sp = (it.ls + num(st.letterSpacing, 0)) * size;
      var width = measureText(ctx, it.text, font, sp);
      var lh = size * 1.26;
      var gap = i === 0 ? 0 : base * (it.gapBefore + num(st.lineGap, 0) * 0.6);
      lines.push({ text: it.text, font: font, size: size, spacing: sp, lineH: lh, gap: gap, alpha: it.alpha, width: width });
      h += gap + lh;
      if (width > w) w = width;
    }
    return { lines: lines, width: w, height: h };
  }

  /*
   * 厂商 Logo 只在两种版式里出现：
   *   毛玻璃卡片 = 图上叠加 + 毛玻璃，顶部信息条 = 留白边 + 水印在上方。
   * 其余版式（含侧边竖排）一律不画标识。
   */
  function logoAllowed(st) {
    var layout = st.layout || 'blur';
    if (layout === 'overlay') return !!st.glass;
    if (layout === 'strip') return (st.edge || 'bottom') === 'top';
    return false;
  }

  /*
   * 厂商 Logo：按机型识别结果生成一排横向并列的标识，整体与左侧水印文字并排（右对齐）。
   * 高度对齐整块水印文字（四行合计），宽度按各自原图比例换算；超过可用宽度时整体等比缩小。
   */
  function buildLogos(st, meta, W, base, blockH, textW) {
    var files = (meta && meta.logos) || [];
    var META = NW.LOGO_META;
    if (st.showLogo === false || !files.length || !META || !logoAllowed(st)) return null;
    var k = clamp(num(st.logoScale, 1), 0.3, 3);
    /* 目标高度对齐左边整块水印文字（四行加起来的）高度 */
    var lh = Math.max(base * 0.9, blockH) * k;
    var items = [];
    for (var i = 0; i < files.length; i++) {
      var m = META[files[i]];
      if (!m || !m.w || !m.h) continue;
      items.push({ file: files[i], w: lh * (m.w / m.h), h: lh, lum: m.lum, sat: m.sat });
    }
    if (!items.length) return null;
    var row = { items: items, gap: lh * 0.45, width: 0, height: lh };
    row.width = rowWidth(row);
    /* 最多占水印区六成宽，并且必须给左边的文字留够位置 */
    var maxW = Math.min(W * 0.6, Math.max(base * 3, W - textW - base * 1.2));
    return fitRow(row, maxW);
  }

  function rowWidth(row) {
    var w = 0;
    for (var i = 0; i < row.items.length; i++) w += row.items[i].w;
    return w + row.gap * (row.items.length - 1);
  }

  /* 等比缩放到不超过 maxW */
  function fitRow(row, maxW) {
    if (!row || !(maxW > 0) || row.width <= maxW) return row;
    var k = maxW / row.width;
    var out = { items: [], gap: row.gap * k, width: maxW, height: row.height * k };
    for (var i = 0; i < row.items.length; i++) {
      var it = row.items[i];
      out.items.push({ file: it.file, w: it.w * k, h: it.h * k, lum: it.lum, sat: it.sat });
    }
    return out;
  }

  function buildBlocks(st, meta, W) {
    var ctx = mctx();
    var family = FONTS[st.font] || FONTS.sans;
    var base = Math.max(6, num(st.baseSize, 0.02) * W);
    var items = buildItems(st, meta);
    var twoCol = st.arrangement === 'two-column' && items.length > 1 && st.layout !== 'side';
    var left = twoCol ? items.filter(function (i) { return i.key === 'l1' || i.key === 'l2'; }) : items;
    var right = twoCol ? items.filter(function (i) { return i.key !== 'l1' && i.key !== 'l2'; }) : [];
    if (twoCol && (!left.length || !right.length)) { left = items; right = []; twoCol = false; }
    var L = layoutBlock(ctx, left, base, st, family);
    var R = right.length ? layoutBlock(ctx, right, base, st, family) : null;
    var colGap = base * 2.4;
    var textW = R ? L.width + colGap + R.width : L.width;
    var textH = Math.max(L.height, R ? R.height : 0);
    return {
      L: L, R: R, twoCol: twoCol, colGap: colGap, base: base, family: family,
      width: textW, height: textH,
      logos: buildLogos(st, meta, W, base, textH, textW)
    };
  }

  function computePlan(opts) {
    var st = opts.st, src = opts.source, meta = opts.meta;
    var W = src.width, H = src.height;
    var blocks = buildBlocks(st, meta, W);
    var base = blocks.base;
    var m = clamp(num(st.margin, 0.06), 0, 0.4) * W;
    var gap = base * clamp(num(st.gap, 1.1), 0, 6);
    var logoGap = base * 1.2;
    var blockW = blocks.width + (blocks.logos ? blocks.logos.width + logoGap : 0);
    var blockH = blocks.height;
    var layout = st.layout || 'blur';
    var edge = st.edge || 'bottom';
    var plan = { layout: layout, edge: edge, W: 0, H: 0, base: base, blocks: blocks, sourceW: W, sourceH: H, themeColor: (meta && meta.themeColor) || null };
    var img, text;

    if (layout === 'overlay') {
      var glassPad = st.glass ? base * 1.5 : 0;
      var inner = m + glassPad;
      var ty = edge === 'top' ? inner : Math.max(inner, H - inner - blockH);
      plan.W = W; plan.H = H;
      plan.glassPad = glassPad;
      plan.radius = 0;
      img = { x: 0, y: 0, w: W, h: H };
      text = { x: inner, y: ty, w: Math.max(base, W - inner * 2), h: blockH };
      plan.noShadow = true;
    } else if (layout === 'side') {
      var sidePad = clamp(num(st.sidePad, 0.035), 0, 0.3) * W;
      var panel = Math.max(blocks.height + sidePad * 2, W * 0.05);
      var onLeft = edge === 'left';
      /* 竖排版式里 Logo 也跟着转 90°，所以用画面的高度当它的长度 */
      var logoRow = blocks.logos ? fitRow(blocks.logos, H * 0.5) : null;
      if (logoRow && logoRow.height > blocks.height) {
        logoRow = fitRow(logoRow, (logoRow.width * blocks.height) / logoRow.height);
      }
      /* 旋转后：Logo 行的“宽度”沿画面竖直方向排布 */
      var rowH = logoRow ? logoRow.width + base * 0.5 : 0;
      plan.W = W + panel; plan.H = H;
      plan.panel = { x: onLeft ? 0 : W, w: panel };
      plan.logoRow = logoRow;
      plan.radius = 0;
      plan.noShadow = true;
      img = { x: 0, y: 0, w: W, h: H };
      var spanLen = Math.min(H - sidePad * 2, blocks.width + rowH);
      text = {
        x: (onLeft ? 0 : W) + panel / 2 - blocks.height / 2,
        y: (H - spanLen) / 2,
        w: blocks.height, h: spanLen, vertical: true
      };
    } else {
      var isStrip = layout === 'strip';
      plan.W = 2 * m + Math.max(W, blockW + (isStrip ? 0 : 2 * m));
      var imgX = (plan.W - W) / 2;
      plan.radius = clamp(num(st.radius, 0), 0, 0.3) * W;
      if (isStrip) {
        var padBottom = m * clamp(num(st.bottomSpace, 1), 0, 4);
        if (edge === 'top') {
          var y0 = m + blockH + gap;
          img = { x: imgX, y: y0, w: W, h: H };
          text = { x: m, y: m, w: plan.W - m * 2, h: blockH };
          plan.H = y0 + H + m;
        } else {
          img = { x: imgX, y: m, w: W, h: H };
          text = { x: m, y: m + H + gap, w: plan.W - m * 2, h: blockH };
          plan.H = m + H + gap + blockH + padBottom;
        }
      } else {
        if (edge === 'top') {
          text = { x: m, y: m, w: plan.W - m * 2, h: blockH };
          img = { x: imgX, y: m + blockH + gap, w: W, h: H };
          plan.H = img.y + H + m;
        } else {
          img = { x: imgX, y: m, w: W, h: H };
          text = { x: m, y: m + H + gap, w: plan.W - m * 2, h: blockH };
          plan.H = m + H + gap + blockH + m;
        }
      }
    }

    var offX = num(st.offsetX, 0) * W, offY = num(st.offsetY, 0) * H;
    text.x += offX;
    text.y += offY;
    text.x = clamp(text.x, 0, Math.max(0, plan.W - text.w));
    text.y = clamp(text.y, 0, Math.max(0, plan.H - text.h));

    plan.img = img;
    plan.text = text;
    plan.logoGap = logoGap;
    var logo = text.vertical ? null : blocks.logos;
    if (logo) {
      /* 按实际文字区宽度再收一次：保证 Logo 与左侧文字严格并排、不互相压到 */
      var fitW = Math.max(base * 3, text.w - blocks.width - logoGap);
      if (logo.width > fitW) logo = fitRow(blocks.logos, fitW);
    }
    plan.logo = logo;
    plan.W = Math.max(1, Math.round(plan.W));
    plan.H = Math.max(1, Math.round(plan.H));
    return plan;
  }
  function rgbaOf(hex, a) {
    var s = String(hex || '#ffffff').replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var v = parseInt(s, 16);
    if (isNaN(v)) return 'rgba(255,255,255,' + a + ')';
    return 'rgba(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + a + ')';
  }

  /* 左侧文字区的水平范围（Logo 并排在右边，要把它刨掉） */
  function textSpan(plan) {
    var t = plan.text;
    if (t.vertical) return Math.max(1, t.w);
    return Math.max(1, t.w - (plan.logo ? plan.logo.width + num(plan.logoGap, 0) : 0));
  }

  function captionSpan(plan, st) {
    var b = plan.blocks, t = plan.text;
    var span = textSpan(plan);
    if (b.twoCol) return { x: t.x, w: span };
    var w = Math.min(span, b.L.width);
    var align = st.align || 'left';
    if (align === 'center') return { x: t.x + (span - w) / 2, w: w };
    if (align === 'right') return { x: t.x + span - w, w: w };
    return { x: t.x, w: w };
  }

  /* 水印文字所在区域的平均亮度；读不到像素（画布被污染）时返回 null */
  function bandLum(ctx, plan, st, S) {
    var canvas = ctx.canvas, t = plan.text;
    var span = captionSpan(plan, st);
    var x = Math.round(span.x * S), y = Math.round(t.y * S);
    var w = Math.round(Math.max(8, span.w) * S), h = Math.round(Math.max(8, t.h) * S);
    x = clamp(x, 0, canvas.width - 1);
    y = clamp(y, 0, canvas.height - 1);
    w = clamp(w, 1, canvas.width - x);
    h = clamp(h, 1, canvas.height - y);
    var d;
    try { d = ctx.getImageData(x, y, w, h).data; } catch (e) { return null; }
    var lum = 0, n = 0;
    for (var i = 0; i < d.length; i += 16) {
      lum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      n++;
    }
    if (!n) return null;
    return lum / n;
  }

  function sampleTextColor(ctx, plan, st, S) {
    var l = bandLum(ctx, plan, st, S);
    if (l == null) return '#ffffff';
    return l > 0.62 ? '#15171c' : '#ffffff';
  }

  function drawLines(ctx, block, box, color, align, alpha) {
    ctx.fillStyle = color;
    var y = box.y;
    for (var i = 0; i < block.lines.length; i++) {
      var ln = block.lines[i];
      y += ln.gap;
      var baseline = y + ln.size * 0.94;
      var x = box.x;
      if (align === 'center') x = box.x + (box.w - ln.width) / 2;
      else if (align === 'right') x = box.x + box.w - ln.width;
      ctx.globalAlpha = clamp(alpha * ln.alpha, 0, 1);
      drawText(ctx, ln.text, x, baseline, ln.font, ln.spacing);
      y += ln.lineH;
    }
    ctx.globalAlpha = 1;
  }

  function drawBlocks(ctx, b, box, color, align, alpha, base) {
    if (!b.R) {
      drawLines(ctx, b.L, { x: box.x, y: box.y + (box.h - b.L.height) / 2, w: box.w, h: b.L.height }, color, align, alpha);
      return;
    }
    drawLines(ctx, b.L, { x: box.x, y: box.y + (box.h - b.L.height) / 2, w: Math.max(base, box.w - b.R.width - b.colGap), h: b.L.height }, color, align, alpha);
    drawLines(ctx, b.R, { x: box.x + box.w - b.R.width, y: box.y + (box.h - b.R.height) / 2, w: b.R.width, h: b.R.height }, color, 'right', alpha);
  }

  function drawPhoto(ctx, src, plan, st) {
    var r = plan.img, rad = num(plan.radius, 0);
    var shadow = clamp(num(st.shadow, 0), 0, 1);
    ctx.save();
    if (shadow > 0.01) {
      ctx.shadowColor = 'rgba(0,0,0,' + shadow.toFixed(3) + ')';
      ctx.shadowBlur = Math.max(8, plan.sourceW * 0.04);
      ctx.shadowOffsetY = Math.max(3, plan.sourceW * 0.014);
    }
    if (rad > 0.5) { pathRound(ctx, r.x, r.y, r.w, r.h, rad); ctx.clip(); }
    ctx.drawImage(src, r.x, r.y, r.w, r.h);
    ctx.restore();

    var bw = num(st.border, 0) * plan.sourceW;
    if (bw > 0.5) {
      var half = bw / 2;
      ctx.save();
      ctx.lineWidth = bw;
      ctx.strokeStyle = st.borderColor || '#ffffff';
      pathRound(ctx, r.x + half, r.y + half, r.w - bw, r.h - bw, Math.max(0, rad - half));
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawScrim(ctx, plan, st) {
    var amt = clamp(num(st.scrim, 0.55), 0, 1);
    if (amt <= 0.01) return;
    var H = plan.H, band = Math.min(H, plan.text.h + plan.base * 2.6);
    var top = plan.edge === 'top';
    var y0 = top ? 0 : H - band;
    var g = ctx.createLinearGradient(0, top ? band : y0, 0, top ? 0 : H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + amt.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, plan.W, band);
  }

  function drawGlass(ctx, plan, st, src, theme) {
    var t = plan.text, pad = plan.glassPad || plan.base * 1.5;
    var card = { x: t.x - pad, y: t.y - pad * 0.85, w: t.w + pad * 2, h: t.h + pad * 1.7 };
    var r = clamp(num(st.cardRadius, 0.02), 0, 0.2) * plan.sourceW;
    var back = blurCover(src, plan.W, plan.H, {
      blurStrength: Math.min(1, num(st.blurStrength, 0.6) + 0.4),
      brightness: num(st.brightness, 1), tint: 0
    }, theme);
    ctx.save();
    pathRound(ctx, card.x, card.y, card.w, card.h, r);
    ctx.clip();
    ctx.drawImage(back, 0, 0, plan.W, plan.H);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(card.x, card.y, card.w, card.h);
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(card.x, card.y, card.w, card.h);
    ctx.restore();
    ctx.save();
    ctx.lineWidth = Math.max(1, plan.sourceW * 0.0009);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    pathRound(ctx, card.x + ctx.lineWidth / 2, card.y + ctx.lineWidth / 2, card.w - ctx.lineWidth, card.h - ctx.lineWidth, r);
    ctx.stroke();
    ctx.restore();
  }

  function lumOfHex(hex) {
    var s = String(hex || '#ffffff').replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var v = parseInt(s, 16);
    if (isNaN(v)) return 1;
    return (0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255;
  }

  /*
   * 单个标识：
   *   背景深 + 标识本身偏黑  -> 整体反色成水印文字的颜色（用户要求的"黑色 Logo 反色"）
   *   背景浅 + 标识本身偏白  -> 同理反色成深色
   *   彩色标识不破坏其品牌色，只在对比度不足时提亮 / 压暗
   */
  function drawOneLogo(ctx, it, x, y, ink, bgDark, S) {
    var img = NW.LOGOS && NW.LOGOS.get ? NW.LOGOS.get(it.file) : null;
    if (!img) return;
    var lum = num(it.lum, 0.5), sat = num(it.sat, 0);
    var mono = sat < 0.22;
    var flat = null, bright = 0;
    if (bgDark) {
      if (lum < 0.5) {
        if (mono || lum < 0.1) flat = ink;
        else bright = clamp(0.66 / Math.max(lum, 0.05), 1, 3);
      }
    } else if (lum > 0.62) {
      if (mono) flat = ink;
      else bright = clamp(0.5 / Math.max(lum, 0.05), 0.2, 1);
    }
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (flat) {
      var w = Math.max(1, Math.round(it.w * S)), h = Math.max(1, Math.round(it.h * S));
      var off = makeCanvas(w, h), octx = off.getContext('2d');
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = 'high';
      octx.drawImage(img, 0, 0, w, h);
      octx.globalCompositeOperation = 'source-in';
      octx.fillStyle = flat;
      octx.fillRect(0, 0, w, h);
      ctx.drawImage(off, x, y, it.w, it.h);
    } else {
      if (bright && typeof ctx.filter === 'string') ctx.filter = 'brightness(' + bright.toFixed(2) + ')';
      ctx.drawImage(img, x, y, it.w, it.h);
    }
    ctx.restore();
  }

  function drawLogoRow(ctx, plan, st, row, ink, bgLum, S, box, align) {
    if (!row || !row.items.length || !(row.width > 0)) return;
    var bgDark = bgLum == null ? lumOfHex(ink) > 0.5 : bgLum < 0.55;
    var x = box.x;
    if (align === 'center') x = box.x + (box.w - row.width) / 2;
    else if (align === 'right') x = box.x + box.w - row.width;
    for (var i = 0; i < row.items.length; i++) {
      var it = row.items[i];
      drawOneLogo(ctx, it, x, box.y + (row.height - it.h) / 2, ink, bgDark, S);
      x += it.w + row.gap;
    }
  }

  function drawCaption(ctx, plan, st, color, S, bgLum) {
    var b = plan.blocks, t = plan.text;
    var alpha = clamp(num(st.opacity, 1), 0.05, 1);
    var align = st.align || 'left';
    ctx.save();
    if (t.vertical) {
      ctx.translate(t.x + t.w / 2, t.y + t.h / 2);
      ctx.rotate(Math.PI / 2);
      var vrow = plan.logoRow;
      var vgap = vrow ? plan.base * 0.5 : 0;
      var vx = -(b.width + (vrow ? vrow.width + vgap : 0)) / 2;
      if (vrow) {
        ctx.globalAlpha = alpha;
        drawLogoRow(ctx, plan, st, vrow, color, bgLum, S,
          { x: vx, y: -vrow.height / 2, w: vrow.width, h: vrow.height }, 'left');
        ctx.globalAlpha = 1;
        vx += vrow.width + vgap;
      }
      drawBlocks(ctx, b, { x: vx, y: -b.height / 2, w: b.width, h: b.height }, color, align, alpha, plan.base);
    } else {
      var capTop = t.y + (t.h - b.height) / 2;
      var span = textSpan(plan);
      ctx.globalAlpha = alpha;
      /* Logo 与左侧水印文字左右并排，高度对齐整块文字并整体居右 */
      if (plan.logo) drawLogoRow(ctx, plan, st, plan.logo, color, bgLum, S,
        { x: t.x, y: t.y + (t.h - plan.logo.height) / 2, w: t.w }, 'right');
      ctx.globalAlpha = 1;
      drawBlocks(ctx, b, { x: t.x, y: capTop, w: span, h: b.height }, color, align, alpha, plan.base);
      if (st.divider) {
        var dspan = captionSpan(plan, st);
        var dy = Math.max(2, capTop - plan.base * 0.62);
        ctx.save();
        ctx.strokeStyle = rgbaOf(color, 0.3);
        ctx.lineWidth = Math.max(1, plan.sourceW * 0.0007);
        ctx.beginPath();
        ctx.moveTo(dspan.x, dy);
        ctx.lineTo(dspan.x + dspan.w, dy);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function paintScene(opts) {
    var plan = opts.plan, st = opts.st, src = opts.source;
    var S = clamp(num(opts.scale, 1), 0.01, 1);
    var canvas = makeCanvas(plan.W * S, plan.H * S);
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.save();
    ctx.scale(S, S);

    var W = plan.W, H = plan.H;
    var theme = opts.themeColor || plan.themeColor;
    var overlay = plan.layout === 'overlay';

    if (overlay) {
      ctx.drawImage(src, 0, 0, W, H);
    } else {
      if (st.bgType === 'blur') {
        ctx.drawImage(blurCover(src, W, H, st, theme), 0, 0, W, H);
      } else if (st.bgType === 'gradient') {
        ctx.fillStyle = makeGradient(ctx, W, H, st.gradientAngle, st.bgColor || '#111', st.bgColor2 || '#333');
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.fillStyle = st.bgColor || '#111';
        ctx.fillRect(0, 0, W, H);
      }
      paintVignette(ctx, W, H, num(st.vignette, 0));
      drawPhoto(ctx, src, plan, st);
    }

    if (overlay) {
      if (st.glass) drawGlass(ctx, plan, st, src, theme);
      else drawScrim(ctx, plan, st);
    }

    var bgLum = bandLum(ctx, plan, st, S);
    var auto = bgLum == null ? null : (bgLum > 0.62 ? '#15171c' : '#ffffff');
    var color = '#ffffff';
    if (st.colorMode === 'dark') color = '#15171c';
    else if (st.colorMode === 'light') color = '#ffffff';
    else if (st.colorMode === 'custom') color = st.color || '#ffffff';
    else color = opts.textColor || auto || sampleTextColor(ctx, plan, st, S);

    drawCaption(ctx, plan, st, color, S, bgLum);
    ctx.restore();
    return { canvas: canvas, plan: plan, color: color };
  }

  NW.extractTheme = extractTheme;
  NW.computePlan = computePlan;
  NW.paintScene = paintScene;
})(window);