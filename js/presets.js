/* NovaWatermark - 预设样式与默认配置 */
(function (global) {
  'use strict';
  var NW = (global.NW = global.NW || {});

  var BASE = {
    layout: 'blur', edge: 'bottom',
    margin: 0.06, bottomSpace: 1.0, gap: 1.15, sidePad: 0.035,
    radius: 0.022, shadow: 0.45, border: 0, borderColor: '#ffffff',
    bgType: 'blur', bgColor: '#0e1013', bgColor2: '#232838', gradientAngle: 160,
    blurStrength: 0.62, brightness: 0.86, tint: 0.24, vignette: 0.28,
    font: 'sans', baseSize: 0.020, align: 'left', arrangement: 'stacked',
    colorMode: 'auto', color: '#ffffff', uppercase: false,
    lineGap: 0.5, letterSpacing: 0, opacity: 1, divider: false,
    scrim: 0.55, glass: false, cardRadius: 0.022,
    showLogo: false, logoScale: 1,
    offsetX: 0, offsetY: 0
  };

  function P(patch) { var o = {}; for (var k in patch) o[k] = patch[k]; return o; }

  NW.PRESETS = [
    {
      id: 'blur-dark', name: '\u9ad8\u65af\u6a21\u7cca \u00b7 \u6df1\u8272',
      desc: '\u56fe\u7247\u653e\u5728\u81ea\u8eab\u9ad8\u65af\u6a21\u7cca\u80cc\u666f\u4e0a\uff0c\u5706\u89d2 + \u9634\u5f71\uff0c\u4e0b\u65b9\u663e\u793a\u62cd\u6444\u4fe1\u606f',
      patch: P({ layout: 'blur', edge: 'bottom', bgType: 'blur', margin: 0.06, bottomSpace: 1.0, gap: 1.15, radius: 0.024, shadow: 0.5, border: 0, blurStrength: 0.7, brightness: 0.84, tint: 0.26, vignette: 0.3, font: 'sans', baseSize: 0.020, align: 'left', arrangement: 'stacked', colorMode: 'auto', lineGap: 0.5, letterSpacing: 0, divider: false, scrim: 0.5, glass: false })
    },
    {
      id: 'blur-light', name: '\u9ad8\u65af\u6a21\u7cca \u00b7 \u6d45\u8272',
      desc: '\u63d0\u4eae\u80cc\u666f\uff0c\u9002\u5408\u660e\u4eae\u7684\u7167\u7247',
      patch: P({ layout: 'blur', edge: 'bottom', bgType: 'blur', margin: 0.07, bottomSpace: 1.1, gap: 1.2, radius: 0.02, shadow: 0.28, border: 0, blurStrength: 0.68, brightness: 1.28, tint: 0.1, vignette: 0.04, font: 'sans', baseSize: 0.019, align: 'left', arrangement: 'stacked', colorMode: 'auto', lineGap: 0.5, letterSpacing: 0, divider: false, scrim: 0.5, glass: false })
    },
    {
      id: 'white', name: '\u767d\u8fb9\u7559\u767d',
      desc: '\u56fe\u7247\u4e0b\u65b9\u52a0\u767d\u8272\u8fb9\u6846\u663e\u793a\u6c34\u5370',
      patch: P({ layout: 'strip', edge: 'bottom', bgType: 'solid', bgColor: '#ffffff', margin: 0.05, bottomSpace: 1.0, gap: 1.1, radius: 0, shadow: 0, border: 0, font: 'sans', baseSize: 0.019, align: 'left', arrangement: 'stacked', colorMode: 'auto', lineGap: 0.48, letterSpacing: 0, divider: false })
    },
    {
      id: 'black', name: '\u9ed1\u8fb9\u7559\u767d',
      desc: '\u56fe\u7247\u4e0b\u65b9\u52a0\u9ed1\u8272\u8fb9\u6846\u663e\u793a\u6c34\u5370',
      patch: P({ layout: 'strip', edge: 'bottom', bgType: 'solid', bgColor: '#0b0c0e', margin: 0.05, bottomSpace: 1.0, gap: 1.1, radius: 0, shadow: 0, border: 0, font: 'sans', baseSize: 0.019, align: 'left', arrangement: 'stacked', colorMode: 'auto', lineGap: 0.48, letterSpacing: 0.01, divider: false })
    },
    {
      id: 'polaroid', name: '\u5b9d\u4e3d\u6765',
      desc: '\u7ecf\u5178\u62cd\u7acb\u5f97\u76f8\u7eb8\uff0c\u5e95\u90e8\u5bbd\u7559\u767d + \u624b\u5199\u5b57',
      patch: P({ layout: 'strip', edge: 'bottom', bgType: 'solid', bgColor: '#faf8f4', margin: 0.055, bottomSpace: 2.6, gap: 1.4, radius: 0.004, shadow: 0.22, border: 0, font: 'hand', baseSize: 0.019, align: 'center', arrangement: 'stacked', colorMode: 'dark', lineGap: 0.62, letterSpacing: 0, divider: false, opacity: 0.92 })
    },
    {
      id: 'overlay', name: '\u56fe\u4e0a\u6e10\u53d8',
      desc: '\u4e0d\u52a0\u8fb9\u6846\uff0c\u7167\u7247\u539f\u5c3a\u5bf8 + \u5e95\u90e8\u6e10\u53d8\u906e\u7f69\u6587\u5b57',
      patch: P({ layout: 'overlay', edge: 'bottom', margin: 0.05, gap: 0.8, bottomSpace: 0.4, baseSize: 0.021, font: 'sans', align: 'left', arrangement: 'stacked', colorMode: 'light', lineGap: 0.5, letterSpacing: 0.02, divider: false, scrim: 0.62, glass: false, radius: 0, shadow: 0 })
    },
    {
      id: 'glass', name: '\u6bdb\u73bb\u7483\u5361\u7247',
      desc: '\u56fe\u4e0a\u534a\u900f\u660e\u6bdb\u73bb\u7483\u5361\u7247\uff0c\u9002\u5408\u5c01\u9762\u56fe',
      patch: P({ layout: 'overlay', edge: 'bottom', margin: 0.042, gap: 0.7, bottomSpace: 0.4, baseSize: 0.018, font: 'sans', align: 'left', arrangement: 'two-column', colorMode: 'light', lineGap: 0.46, letterSpacing: 0.02, divider: false, scrim: 0, glass: true, cardRadius: 0.024, radius: 0, shadow: 0 })
    },
    {
      id: 'side', name: '\u4fa7\u8fb9\u7ad6\u6392',
      desc: '\u4fa7\u8fb9\u7a84\u6761 + \u7ad6\u6392\u6587\u5b57\uff0c\u9002\u5408\u7ad6\u5e45\u4eba\u50cf',
      patch: P({ layout: 'side', edge: 'right', bgType: 'solid', bgColor: '#111419', sidePad: 0.032, baseSize: 0.018, font: 'sans', align: 'left', arrangement: 'stacked', colorMode: 'light', lineGap: 0.46, letterSpacing: 0.03, divider: false, gap: 1.0, shadow: 0 })
    },
    {
      id: 'matte', name: '\u753b\u5eca\u5361\u7eb8',
      desc: '\u56db\u5468\u5bbd\u7559\u767d\u7684\u5c55\u793a\u5361\u7eb8\uff0c\u5e95\u90e8\u5c45\u4e2d\u6ce8\u91ca',
      patch: P({ layout: 'strip', edge: 'bottom', bgType: 'solid', bgColor: '#edeae4', margin: 0.09, bottomSpace: 1.3, gap: 1.1, radius: 0, shadow: 0.16, border: 0.002, borderColor: '#d8d3c9', font: 'serif', baseSize: 0.017, align: 'center', arrangement: 'stacked', colorMode: 'auto', lineGap: 0.5, letterSpacing: 0.02, divider: true })
    },
    {
      id: 'topbar', name: '\u9876\u90e8\u4fe1\u606f\u6761',
      desc: '\u56fe\u7247\u4e0a\u65b9\u9ed1\u8272\u4fe1\u606f\u6761\uff0c\u5de6\u53f3\u4e24\u680f\u6392\u7248',
      patch: P({ layout: 'strip', edge: 'top', bgType: 'solid', bgColor: '#0d0f13', margin: 0.045, bottomSpace: 0.25, gap: 0.9, radius: 0, shadow: 0, border: 0, font: 'sans', baseSize: 0.017, align: 'left', arrangement: 'two-column', colorMode: 'light', lineGap: 0.44, letterSpacing: 0.03, divider: false })
    }
  ];

  /* 「预设样式」页里 4 行水印的固定槽位：开关 = 是否显示这组拍摄信息 */
  var LINE_DEFS = [
    { key: 'l1', name: '机型', tpl: '{Make} {Model}' },
    { key: 'l2', name: '镜头', tpl: '{Lens}' },
    { key: 'l3', name: '拍摄参数', tpl: '{Focal} \u00b7 {Aperture} \u00b7 {Shutter} \u00b7 {ISO}' },
    { key: 'l4', name: '时间', tpl: '{Date} {Time}' }
  ];
  NW.LINE_DEFS = LINE_DEFS;

  NW.DEFAULT_STATE = (function () {
    var st = P(BASE);
    for (var k in NW.PRESETS[0].patch) st[k] = NW.PRESETS[0].patch[k];
    st.preset = 'blur-dark';
    LINE_DEFS.forEach(function (d, i) {
      st[d.key] = d.tpl;
      st['lineOn' + (i + 1)] = true;
      st['lineText' + (i + 1)] = '';
    });
    st.note = '';
    st.beautify = true;
    st.outFormat = 'jpeg';
    st.quality = 0.94;
    st.longEdge = 0;
    st.suffix = '_nova';
    return st;
  })();

  NW.STYLE_KEYS = Object.keys(BASE);
})(window);