/* NovaWatermark - 机型识别与厂商 Logo 匹配 */
(function (global) {
  'use strict';
  var NW = (global.NW = global.NW || {});
  var META = NW.LOGO_META || {};
  var DATA = NW.LOGO_DATA || {};

  function n1(s) { var m = String(s == null ? '' : s).match(/(\d{1,4})/); return m ? Number(m[1]) : 0; }

  /* ---- 联动品牌：这些机型由两家联合打造，需要同时显示两个标识 ---- */
  function vivoZeiss(M, D) {
    if (/^X\s?\d/.test(D) || /\bX ?(FOLD|FLIP|NOTE)\b/.test(D)) return ['zeiss.png'];
    return [];
  }
  function xiaomiLeica(M, D) {
    if (/\bULTRA\b/.test(D) || /\bMIX ?FOLD\b/.test(D) || /12S/.test(D)) return ['leica.png'];
    var t = D.replace(/\bXIAOMI\b|\bMI\b/g, ' ').trim();
    var n = n1(t);
    if (n >= 13 && n <= 20) return ['leica.png'];
    return [];
  }
  function huaweiLeica(M, D) {
    var p = D.match(/^P\s?(\d{1,2})\b/);
    if (p && Number(p[1]) <= 40) return ['leica.png'];
    var m = D.match(/^MATE\s?(\d{1,2})\b/);
    if (m && Number(m[1]) <= 40) return ['leica.png'];
    return [];
  }
  function nokiaZeiss(M, D) {
    if (/^LUMIA|^N8\b|^808|^NOKIA\s?[789]\b|^N9\b/.test(D)) return ['zeiss.png'];
    return [];
  }
  function xperiaZeiss(M, D) {
    if (/\bPRO-?I\b/.test(D)) return ['zeiss.png'];
    if (/XPERIA\s+[15]\s*(II|III|IV|V|VI|VII|VIII)/.test(D)) return ['zeiss.png'];
    if (/^XQ-(AT|AS|BC|BQ|CT|CQ|DQ|DE|EC|CC|BT)\d/.test(D)) return ['zeiss.png'];
    return [];
  }
  function oppoHasselblad(M, D) {
    if (/FIND\s?X\s?([5-9])/.test(D)) return ['hasselblad.png'];
    if (/FIND\s?N\s?([2-9])/.test(D)) return ['hasselblad.png'];
    return [];
  }
  function oneplusHasselblad(M, D) {
    if (/\bNORD\b/.test(D)) return [];
    if (/^(?:ONEPLUS\s+)?(LE21|IN202|NE221|CPH24[3-9]|CPH25[0-9]|CPH26[0-9]|PJD1|PHK1|PHB1|MT21|KB200|IN201|IN202)\d?/.test(D)) return ['hasselblad.png'];
    var n = n1(D.replace(/\bONEPLUS\b|\bONE ?PLUS\b/g, ' ').trim());
    if (n >= 9 && n <= 13) return ['hasselblad.png'];
    return [];
  }
  function lumixLeica(M, D) {
    if (/^(LX|TZ|ZS|FZ)\d|DC-(LX|TZ|ZS|FZ)/.test(D)) return ['leica.png'];
    return [];
  }

  /*
   * 匹配规则：自上而下取第一条命中的规则（所以子品牌 / 更具体的机型必须排在母品牌前面）。
   *   re     正则（对 "厂商 机型" 的大写形式匹配，另外 ^ 锚点也允许命中机型本身）
   *   files  主标识
   *   collab 联动品牌，返回附加标识
   */
  var RULES = [
    /* ============ 手机：子品牌优先 ============ */
    { id: 'redmi', re: /\bREDMI\b/, files: ['redmi.png'] },
    { id: 'poco', re: /\bPOCO\b/, files: ['poco.png'] },
    { id: 'iqoo', re: /\bI\s?QOO\b/, files: ['iqoo.png'] },
    { id: 'rog', re: /\bROG\b|ASUS_?ROG/, files: ['rog.png'] },
    { id: 'realme', re: /\bREALME\b|^RMX\d/, files: ['realme.png'] },
    { id: 'nothing', re: /\bNOTHING\b/, files: ['nothing.png'] },
    { id: 'honor', re: /\bHONOR\b/, files: ['honor.png'] },
    { id: 'nubia', re: /\bNUBIA\b|\bRED ?MAGIC\b/, files: ['nubia.png'] },
    { id: 'pixel', re: /\bPIXEL\b/, files: ['pixel.png'] },
    { id: 'xperia', re: /\bXPERIA\b|^XQ-/, files: ['xperia.png'], collab: xperiaZeiss },

    /* ============ 手机：主品牌 ============ */
    { id: 'galaxy', re: /^SM-|\bGALAXY\b/, files: ['galaxy.png'] },
    { id: 'apple', re: /\bIPHONE\b|\bIPAD\b|\bAPPLE\b/, files: ['apple.png'] },
    { id: 'huawei', re: /\bHUAWEI\b|^(ELE|ANA|CLT|VOG|LYA|MAR|JNY|NOH|LIO|TAS|OCE)-/, files: ['huawei.png'], collab: huaweiLeica },
    { id: 'vivo', re: /\bVIVO\b/, files: ['vivo.png'], collab: vivoZeiss },
    { id: 'oppo', re: /\bOPPO\b|\bFIND ?[XN]/, files: ['oppo.png'], collab: oppoHasselblad },
    { id: 'oneplus', re: /\bONEPLUS\b|\bONE ?PLUS\b/, files: ['oneplus.png'], collab: oneplusHasselblad },
    { id: 'xiaomi', re: /\bXIAOMI\b|\bMI ?\d/, files: ['xiaomi.png'], collab: xiaomiLeica },
    { id: 'samsung', re: /\bSAMSUNG\b/, files: ['samsung.png'] },
    { id: 'google', re: /\bGOOGLE\b/, files: ['google.png'] },
    { id: 'motorola', re: /\bMOTOROLA\b|\bMOTO\b|^XT\d/, files: ['motorola.png'] },
    { id: 'nokia', re: /\bNOKIA\b|^TA-\d|^LUMIA/, files: ['nokia.png'], collab: nokiaZeiss },
    { id: 'sony-ericsson', re: /\bSONY ?ERICSSON\b/, files: ['sony-ericsson.png'] },
    { id: 'asus', re: /\bASUS\b|^ASUS_|^ZS\d/, files: ['asus.png'] },
    { id: 'blackberry', re: /\bBLACKBERRY\b|^BBF\d|^STV\d/, files: ['blackberry.png'] },
    { id: 'fairphone', re: /\bFAIRPHONE\b|^FP\d/, files: ['fairphone.png'] },
    { id: 'htc', re: /\bHTC\b|^2Q[A-Z0-9]{2}/, files: ['htc.png'] },
    { id: 'infinix', re: /\bINFINIX\b|^X6\d{2}/, files: ['infinix.png'] },
    { id: 'itel', re: /\bITEL\b/, files: ['itel.png'] },
    { id: 'lava', re: /\bLAVA\b/, files: ['lava.png'] },
    { id: 'lenovo', re: /\bLENOVO\b|^LENOVO/, files: ['lenovo.png'] },
    { id: 'lg', re: /\bLG-|\bLG ?E|\bLGE\b|^(LM|LM-)/, files: ['lg.png'] },
    { id: 'meizu', re: /\bMEIZU\b/, files: ['meizu.png'] },
    { id: 'micromax', re: /\bMICROMAX\b/, files: ['micromax.png'] },
    { id: 'sharp', re: /\bSHARP\b|^SH-/, files: ['sharp.png'] },
    { id: 'tcl', re: /\bTCL\b/, files: ['tcl.png'] },
    { id: 'tecno', re: /\bTECNO\b|^TECNO/, files: ['tecno.png'] },
    { id: 'vertu', re: /\bVERTU\b/, files: ['vertu.png'] },
    { id: 'zte', re: /\bZTE\b|^ZTE/, files: ['zte.png'] },
    { id: 'alcatel', re: /\bALCATEL\b/, files: ['alcatel.png'] },

    /* ============ 相机 / 摄像机 / 无人机 ============ */
    { id: 'sony', re: /\bSONY\b|^ILCE-|^ILCA-|^DSC-|^SLT-|^NEX-|^ZV-/, files: ['sony.png'] },
    { id: 'nikon', re: /\bNIKON\b|\bCOOLPIX\b|^NIKON/, files: ['nikon.png'] },
    { id: 'canon', re: /\bCANON\b|^EOS\b/, files: ['canon.png'] },
    { id: 'fujifilm', re: /\bFUJI\b|\bFUJIFILM\b|^X-T\d|^X-S\d|^X-H\d|^X100|^GFX/, files: ['fujifilm.png'] },
    { id: 'leica', re: /\bLEICA\b|^LEICA/, files: ['leica.png'] },
    { id: 'hasselblad', re: /\bHASSELBLAD\b|^X1D|^X2D|^LUNAR|^HB/, files: ['hasselblad.png'] },
    { id: 'om-system', re: /\bOM ?SYSTEM\b|^OM-\d/, files: ['om-system.png'] },
    { id: 'olympus', re: /\bOLYMPUS\b|^E-\d{3}|^STYLUS|^TG-\d/, files: ['olympus.png'] },
    { id: 'lumix', re: /\bLUMIX\b|^DC-(G|S|F|T|ZS|LX|GX|GM|GF|FT)/, files: ['lumix.png'], collab: lumixLeica },
    { id: 'panasonic', re: /\bPANASONIC\b|^DC-/, files: ['panasonic.png'], collab: lumixLeica },
    { id: 'pentax', re: /\bPENTAX\b|^PENTAX/, files: ['pentax.png'] },
    { id: 'ricoh', re: /\bRICOH\b|^GR ?(II|III|IV|DIGITAL)/, files: ['ricoh.png'] },
    { id: 'sigma', re: /\bSIGMA\b|^SIGMA|^SD ?QUATTRO|^FP\b|^FP L/, files: ['sigma.png'] },
    { id: 'arri', re: /\bARRI\b|^ALEXA/, files: ['arri.png'] },
    { id: 'blackmagic', re: /\bBLACKMAGIC\b|^BLACKMAGIC|^POCKET CINEMA|^URSA/, files: ['blackmagic.png'] },
    { id: 'red', re: /\bRED\b|^KOMODO|^HELIUM|^RAVEN\b|^SCARLET\b|^EPIC\b|^V-RAPTOR/, files: ['red.png'] },
    { id: 'dji', re: /\bDJI\b|^FC\d{4}|^MAVIC|^PHANTOM|^MINI ?\d/, files: ['dji.png'] },
    { id: 'gopro', re: /\bGOPRO\b|^HERO\d|^HD\d/, files: ['gopro.png'] },
    { id: 'insta360', re: /\bINSTA360\b|^ONE ?X\d|^GO ?\d/, files: ['insta360.png'] },
    { id: 'casio', re: /\bCASIO\b|^EX-\w/, files: ['casio.png'] },
    { id: 'kodak', re: /\bKODAK\b|^PIXPRO/, files: ['kodak.png'] },
    { id: 'contax', re: /\bCONTAX\b/, files: ['contax.png'] },
    { id: 'bolex', re: /\bBOLEX\b/, files: ['bolex.png'] },
    { id: 'kyocera', re: /\bKYOCERA\b|^CONTAX/, files: ['kyocera.png'] },
    { id: 'mamiya', re: /\bMAMIYA\b/, files: ['mamiya.png'] },
    { id: 'minolta', re: /\bMINOLTA\b|^DYNAX|^MAXXUM|^DIMAGE/, files: ['minolta.png'] },
    { id: 'phase-one', re: /\bPHASE ?ONE\b/, files: ['phase-one.png'] },
    { id: 'polaroid', re: /\bPOLAROID\b|^PIC-/, files: ['polaroid.png'] },
    { id: 'rollei', re: /\bROLLEI\b/, files: ['rollei.png'] },
    { id: 'sanyo', re: /\bSANYO\b|^VPC-/, files: ['sanyo.png'] },
    { id: 'sinar', re: /\bSINAR\b/, files: ['sinar.png'] },
    { id: 'vivitar', re: /\bVIVITAR\b/, files: ['vivitar.png'] },
    { id: 'yashica', re: /\bYASHICA\b/, files: ['yashica.png'] },
    { id: 'epson', re: /\bEPSON\b|^R-D1/, files: ['epson.png'] },

    /* ============ 闪光灯 / 三脚架 / 镜头厂商（机型字段里出现时） ============ */
    { id: 'godox', re: /\bGODOX\b/, files: ['godox.png'] },
    { id: 'profoto', re: /\bPROFOTO\b/, files: ['profoto.png'] },
    { id: 'gitzo', re: /\bGITZO\b/, files: ['gitzo.png'] },
    { id: 'manfrotto', re: /\bMANFROTTO\b/, files: ['manfrotto.png'] },
    { id: 'zeiss', re: /\bZEISS\b|\bCARL ZEISS\b/, files: ['zeiss.png'] },
    { id: 'tamron', re: /\bTAMRON\b/, files: ['tamron.png'] },
    { id: 'tokina', re: /\bTOKINA\b/, files: ['tokina.png'] },
    { id: 'samyang', re: /\bSAMYANG\b/, files: ['samyang.png'] },
    { id: 'laowa', re: /\bLAOWA\b|VENUS OPTICS/, files: ['laowa.png'] },
    { id: 'ttartisan', re: /\bTTARTISAN\b/, files: ['ttartisan.png'] },
    { id: 'seven-artisans', re: /\b7 ?ARTISANS\b|SEVEN ?ARTISANS/, files: ['seven-artisans.png'] },
    { id: 'voigtlander', re: /\bVOIGTLANDER\b/, files: ['voigtlander.png'] },
    { id: 'schneider', re: /\bSCHNEIDER\b/, files: ['schneider.png'] }
  ];

  function uniq(list) {
    var out = [];
    (list || []).forEach(function (f) {
      if (!f || !META[f] || out.indexOf(f) >= 0) return;
      out.push(f);
    });
    return out;
  }

  /* 由 EXIF 的厂商 / 机型推出该显示哪些 Logo（返回文件名数组） */
  function detect(make, model) {
    var M = String(make == null ? '' : make).toUpperCase().trim();
    var D = String(model == null ? '' : model).toUpperCase().trim();
    D = D.replace(/\s+/g, ' ').replace(/^[^0-9A-Z\u4e00-\u9fa5]+/, '');
    /* 很多机型字段会重复一遍厂商名（如 "vivo X100 Pro"），去掉它才能命中 ^ 开头的机型规则 */
    if (M) {
      if (D.indexOf(M) === 0) D = D.slice(M.length).trim();
      else {
        var w = M.split(' ')[0];
        /* 厂商名首词太短时（LG / OM / ZTE）不剥离，否则会把机型切坏 */
        if (w && w.length >= 4 && D.indexOf(w) === 0) D = D.slice(w.length).trim();
      }
    }
    if (!M && !D) return [];
    var S = (M + ' ' + D).trim();
    for (var i = 0; i < RULES.length; i++) {
      var r = RULES[i];
      if (!r.re.test(S) && !r.re.test(D)) continue;
      var out = r.files.slice();
      if (r.collab) out = out.concat(r.collab(M, D) || []);
      return uniq(out);
    }
    return [];
  }

  /* ---- 按需加载（data URI，不会污染 canvas） ---- */
  var cache = {};
  function get(file) {
    var e = cache[file];
    return e && e.ok ? e.img : null;
  }
  function load(files) {
    var jobs = [];
    (files || []).forEach(function (f) {
      if (!f || !DATA[f]) return;
      var e = cache[f];
      if (!e) {
        var img = new Image();
        e = cache[f] = { img: img, ok: false };
        e.promise = new Promise(function (res) {
          img.onload = function () { e.ok = true; res(); };
          img.onerror = function () { e.ok = false; res(); };
        });
        img.src = DATA[f];
      }
      jobs.push(e.promise);
    });
    return Promise.all(jobs);
  }

  NW.LOGOS = {
    RULES: RULES,
    META: META,
    detect: detect,
    get: get,
    load: load,
    ready: function (file) { return !!get(file); }
  };
})(window);