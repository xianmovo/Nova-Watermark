/* NovaWatermark - EXIF解析与文本格式化（离线可用） */
(function (global) {
  'use strict';
  var NW = (global.NW = global.NW || {});

  var IFD0_TAGS = {
    0x0100: 'ImageWidth', 0x0101: 'ImageLength', 0x010e: 'ImageDescription',
    0x010f: 'Make', 0x0110: 'Model', 0x0112: 'Orientation', 0x011a: 'XResolution',
    0x011b: 'YResolution', 0x0128: 'ResolutionUnit', 0x0131: 'Software',
    0x0132: 'DateTime', 0x013b: 'Artist', 0x8298: 'Copyright', 0x8769: 'ExifIFD',
    0x8825: 'GPSIFD', 0xa005: 'InteropIFD'
  };

  var EXIF_TAGS = {
    0x829a: 'ExposureTime', 0x829d: 'FNumber', 0x8822: 'ExposureProgram',
    0x8827: 'ISO', 0x8830: 'SensitivityType', 0x8831: 'StandardOutputSensitivity',
    0x8832: 'RecommendedExposureIndex', 0x8833: 'ISOSpeed',
    0x9003: 'DateTimeOriginal', 0x9004: 'DateTimeDigitized',
    0x9201: 'ShutterSpeedValue', 0x9202: 'ApertureValue', 0x9203: 'BrightnessValue',
    0x9204: 'ExposureBiasValue', 0x9205: 'MaxApertureValue', 0x9206: 'SubjectDistance',
    0x9207: 'MeteringMode', 0x9208: 'LightSource', 0x9209: 'Flash', 0x920a: 'FocalLength',
    0x9290: 'SubSecTime', 0x9291: 'SubSecTimeOriginal', 0x9292: 'SubSecTimeDigitized',
    0xa002: 'PixelXDimension', 0xa003: 'PixelYDimension', 0xa402: 'ExposureMode',
    0xa403: 'WhiteBalance', 0xa405: 'FocalLengthIn35mmFilm', 0xa406: 'SceneCaptureType',
    0xa40a: 'Sharpness', 0xa420: 'ImageUniqueID', 0xa430: 'CameraOwnerName',
    0xa431: 'BodySerialNumber', 0xa432: 'LensSpecification', 0xa433: 'LensMake',
    0xa434: 'LensModel', 0xa435: 'LensSerialNumber'
  };

  var GPS_TAGS = {
    0x0000: 'GPSVersionID', 0x0001: 'GPSLatitudeRef', 0x0002: 'GPSLatitude',
    0x0003: 'GPSLongitudeRef', 0x0004: 'GPSLongitude', 0x0005: 'GPSAltitudeRef',
    0x0006: 'GPSAltitude', 0x0007: 'GPSTimeStamp', 0x0012: 'GPSMapDatum',
    0x001d: 'GPSDateStamp'
  };

  var TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

  function str(bytes, off, len) {
    var s = '';
    for (var i = 0; i < len && off + i < bytes.length; i++) s += String.fromCharCode(bytes[off + i]);
    return s;
  }

  function findJpegExif(bytes) {
    var off = 2;
    while (off + 4 <= bytes.length) {
      if (bytes[off] !== 0xff) { off++; continue; }
      var marker = bytes[off + 1];
      if (marker === 0xff) { off++; continue; }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { off += 2; continue; }
      if (marker === 0xda || marker === 0xd9) break;
      var size = (bytes[off + 2] << 8) | bytes[off + 3];
      if (size < 2) break;
      if (marker === 0xe1) {
        var p = off + 4;
        if (str(bytes, p, 4) === 'Exif' && bytes[p + 4] === 0 && bytes[p + 5] === 0) return p + 6;
      }
      off += 2 + size;
    }
    return null;
  }

  function findWebpExif(bytes) {
    var off = 12;
    while (off + 8 <= bytes.length) {
      var id = str(bytes, off, 4);
      var size = (bytes[off + 4] | (bytes[off + 5] << 8) | (bytes[off + 6] << 16) | (bytes[off + 7] << 24)) >>> 0;
      if (id === 'EXIF') {
        var p = off + 8;
        if (str(bytes, p, 4) === 'Exif') p += 6;
        return p;
      }
      off += 8 + size + (size % 2);
    }
    return null;
  }

  function findPngExif(bytes) {
    var off = 8;
    while (off + 8 <= bytes.length) {
      var len = ((bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3]) >>> 0;
      var type = str(bytes, off + 4, 4);
      if (type === 'eXIf') return off + 8;
      if (type === 'IEND') return null;
      off += 12 + len;
    }
    return null;
  }
  function readValues(bytes, dv, little, off, type, count) {
    var size = TYPE_SIZE[type];
    if (!size || off < 0 || off + size * count > bytes.length) return null;
    var out = [], i;
    switch (type) {
      case 1: case 7:
        for (i = 0; i < count; i++) out.push(bytes[off + i]);
        return out;
      case 2: {
        var s = '';
        for (i = 0; i < count; i++) {
          var ch = bytes[off + i];
          if (ch === 0) break;
          s += String.fromCharCode(ch);
        }
        return s;
      }
      case 3: for (i = 0; i < count; i++) out.push(dv.getUint16(off + i * 2, little)); return out;
      case 4: for (i = 0; i < count; i++) out.push(dv.getUint32(off + i * 4, little)); return out;
      case 5: case 10:
        for (i = 0; i < count; i++) {
          var n = type === 5 ? dv.getUint32(off + i * 8, little) : dv.getInt32(off + i * 8, little);
          var d = type === 5 ? dv.getUint32(off + i * 8 + 4, little) : dv.getInt32(off + i * 8 + 4, little);
          out.push(d === 0 ? 0 : n / d);
        }
        return out;
      case 6: for (i = 0; i < count; i++) out.push(dv.getInt8(off + i)); return out;
      case 8: for (i = 0; i < count; i++) out.push(dv.getInt16(off + i * 2, little)); return out;
      case 9: for (i = 0; i < count; i++) out.push(dv.getInt32(off + i * 4, little)); return out;
      case 11: for (i = 0; i < count; i++) out.push(dv.getFloat32(off + i * 4, little)); return out;
      case 12: for (i = 0; i < count; i++) out.push(dv.getFloat64(off + i * 8, little)); return out;
      default: return null;
    }
  }

  function readIfd(bytes, dv, little, tiffStart, offset, dict, out) {
    var subs = {};
    if (offset <= 0 || offset + 2 > bytes.length) return subs;
    var count = dv.getUint16(offset, little);
    if (count > 512) return subs;
    var p = offset + 2;
    for (var i = 0; i < count; i++, p += 12) {
      if (p + 12 > bytes.length) break;
      var tag = dv.getUint16(p, little);
      var type = dv.getUint16(p + 2, little);
      var num = dv.getUint32(p + 4, little);
      var size = TYPE_SIZE[type];
      if (!size || num > 65535) continue;
      var total = size * num;
      var valueOff = total <= 4 ? p + 8 : tiffStart + dv.getUint32(p + 8, little);
      var values = readValues(bytes, dv, little, valueOff, type, num);
      if (values == null) continue;
      if (tag === 0x8769 || tag === 0x8825 || tag === 0xa005) {
        subs[tag] = Array.isArray(values) ? values[0] : values;
        continue;
      }
      if (tag === 0x927c || tag === 0x37500) continue;
      var name = dict[tag] || ('Tag_0x' + tag.toString(16));
      out[name] = values;
    }
    return subs;
  }

  function first(v) {
    if (v == null) return null;
    return Array.isArray(v) ? v[0] : v;
  }

  function readTiff(bytes, start) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var bo = str(bytes, start, 2);
    if (bo !== 'II' && bo !== 'MM') return { ok: false, reason: 'bad-byte-order' };
    var little = bo === 'II';
    if (dv.getUint16(start + 2, little) !== 42) return { ok: false, reason: 'bad-tiff-header' };
    var out = {};
    var ifd0 = start + dv.getUint32(start + 4, little);
    var subs = readIfd(bytes, dv, little, start, ifd0, IFD0_TAGS, out);
    if (subs[0x8769]) {
      var exif = {};
      var es = readIfd(bytes, dv, little, start, start + subs[0x8769], EXIF_TAGS, exif);
      for (var k in exif) if (exif.hasOwnProperty(k)) out[k] = exif[k];
    }
    if (subs[0x8825]) {
      var gps = {};
      readIfd(bytes, dv, little, start, start + subs[0x8825], GPS_TAGS, gps);
      var g = gpsToPoint(gps);
      if (g) out.GPS = g;
    }
    return { ok: true, raw: out };
  }

  function gpsToPoint(g) {
    var lat = g.GPSLatitude, lon = g.GPSLongitude;
    if (!Array.isArray(lat) || !Array.isArray(lon) || lat.length < 3 || lon.length < 3) return null;
    var la = lat[0] + lat[1] / 60 + lat[2] / 3600;
    var lo = lon[0] + lon[1] / 60 + lon[2] / 3600;
    if (g.GPSLatitudeRef === 'S') la = -la;
    if (g.GPSLongitudeRef === 'W') lo = -lo;
    var alt = first(g.GPSAltitude);
    return { lat: la, lon: lo, alt: typeof alt === 'number' ? alt : null };
  }
  var MAKES = {
    'SONY': 'Sony', 'NIKON CORPORATION': 'Nikon', 'NIKON': 'Nikon', 'CANON': 'Canon',
    'FUJIFILM': 'Fujifilm', 'OLYMPUS CORPORATION': 'Olympus', 'OLYMPUS IMAGING CORP.': 'Olympus',
    'PANASONIC': 'Panasonic', 'LEICA CAMERA AG': 'Leica', 'LEICA': 'Leica',
    'RICOH IMAGING COMPANY, LTD.': 'Ricoh', 'RICOH': 'Ricoh', 'PENTAX': 'Pentax',
    'APPLE': 'Apple', 'HASSELBLAD': 'Hasselblad', 'DJI': 'DJI', 'GOOGLE': 'Google',
    'XIAOMI': 'Xiaomi', 'HUAWEI': 'HUAWEI', 'VIVO': 'vivo', 'OPPO': 'OPPO',
    'SAMSUNG': 'Samsung', 'MOTOROLA': 'Motorola', 'ONEPLUS': 'OnePlus', 'SIGMA': 'Sigma',
    'TAMRON': 'Tamron', 'SONY CORPORATION': 'Sony'
  };

  var MODEL_ALIAS = {
    'ILCE-1': 'A1', 'ILCE-1M2': 'A1 II',
    'ILCE-7': 'A7', 'ILCE-7M2': 'A7 II', 'ILCE-7M3': 'A7 III', 'ILCE-7M4': 'A7 IV', 'ILCE-7M5': 'A7 V',
    'ILCE-7R': 'A7R', 'ILCE-7RM2': 'A7R II', 'ILCE-7RM3': 'A7R III', 'ILCE-7RM4': 'A7R IV', 'ILCE-7RM5': 'A7R V',
    'ILCE-7S': 'A7S', 'ILCE-7SM2': 'A7S II', 'ILCE-7SM3': 'A7S III',
    'ILCE-7C': 'A7C', 'ILCE-7CM2': 'A7C II', 'ILCE-7CR': 'A7CR',
    'ILCE-9': 'A9', 'ILCE-9M2': 'A9 II', 'ILCE-9M3': 'A9 III',
    'ILCE-6000': 'A6000', 'ILCE-6100': 'A6100', 'ILCE-6300': 'A6300', 'ILCE-6400': 'A6400',
    'ILCE-6500': 'A6500', 'ILCE-6600': 'A6600', 'ILCE-6700': 'A6700',
    'ILCE-QX1': 'QX1', 'ILCE-5000': 'A5000', 'ILCE-5100': 'A5100',
    'Z 6_2': 'Z6 II', 'Z 7_2': 'Z7 II', 'Z 6': 'Z6', 'Z 7': 'Z7', 'Z 9': 'Z9', 'Z 8': 'Z8',
    'Z 5': 'Z5', 'Z 50': 'Z50', 'Z 30': 'Z30', 'Z f': 'Zf', 'Z fc': 'Z fc',
    'D850': 'D850', 'D780': 'D780', 'D6': 'D6', 'D500': 'D500', 'D7500': 'D7500', 'D5600': 'D5600'
  };

  function prettyMake(m) {
    if (!m) return '';
    var k = String(m).trim();
    if (MAKES[k]) return MAKES[k];
    if (MAKES[k.toUpperCase()]) return MAKES[k.toUpperCase()];
    return k.replace(/[A-Z]{2,}/g, function (w) { return w.charAt(0) + w.slice(1).toLowerCase(); });
  }

  function prettyModel(model, make) {
    var m = String(model || '').trim();
    var mk = String(make || '').trim();
    if (mk && m.toUpperCase().indexOf(mk.toUpperCase()) === 0) m = m.slice(mk.length).trim();
    else if (mk) {
      var firstWord = mk.split(' ')[0];
      if (firstWord && m.toUpperCase().indexOf(firstWord.toUpperCase()) === 0) m = m.slice(firstWord.length).trim();
    }
    return m;
  }

  function modelLabel(model, make) {
    var cleaned = prettyModel(model, make);
    var alias = MODEL_ALIAS[cleaned.toUpperCase()] || MODEL_ALIAS[cleaned];
    if (alias) return alias;
    return cleaned;
  }

  function cameraLabel(make, model, beautify) {
    if (beautify === false) return [String(make || '').trim(), String(model || '').trim()].filter(Boolean).join(' ');
    var mk = prettyMake(make);
    var md = modelLabel(model, make);
    if (!mk) return md;
    if (!md) return mk;
    if (md.toUpperCase().indexOf(mk.toUpperCase()) === 0) return md;
    return mk + ' ' + md;
  }

  function trimNum(v, digits) {
    if (typeof v !== 'number' || !isFinite(v)) return '';
    var d = digits == null ? 1 : digits;
    var s = v.toFixed(d);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  function fmtShutter(t) {
    if (typeof t !== 'number' || !isFinite(t) || t <= 0) return '';
    if (t >= 1) return trimNum(t, 1) + 's';
    var d = Math.round(1 / t);
    if (d <= 0) return trimNum(t, 3) + 's';
    if (Math.abs(1 / t - d) > 0.02) {
      var nice = [8000, 6400, 5000, 4000, 3200, 2500, 2000, 1600, 1250, 1000, 800, 640, 500, 400, 320, 250, 200, 160, 125, 100, 80, 60, 50, 40, 30, 25, 20, 15, 13, 10, 8, 6, 5, 4, 3, 2, 1];
      for (var i = nice.length - 1; i >= 0; i--) {
        if (nice[i] <= d * 1.03) { d = nice[i]; break; }
      }
    }
    return '1/' + d + 's';
  }

  function fmtLens(raw, make, beautify) {
    var lens = raw.LensModel || '';
    if (!lens && raw.LensSpecification && raw.LensSpecification.length >= 4) {
      var s = raw.LensSpecification;
      var isZoom = s[0] !== s[2];
      var f = isZoom ? trimNum(s[0], 0) + '-' + trimNum(s[2], 0) + 'mm' : trimNum(s[0], 0) + 'mm';
      lens = (raw.LensMake ? prettyMake(raw.LensMake) + ' ' : '') + f + ' f/' + trimNum(s[3], 1) + '';
    }
    if (!lens) return '';
    lens = String(lens).trim();
    if (beautify === false) return lens;
    var mk = prettyMake(make);
    if (mk && lens.toUpperCase().indexOf(mk.toUpperCase()) === 0) lens = lens.slice(mk.length).trim();
    return lens;
  }

  function parseExifDate(s) {
    if (!s) return null;
    var m = String(s).match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (!m) {
      var m2 = String(s).match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})/);
      if (!m2) return null;
      m = [null, m2[1], m2[2], m2[3], '00', '00', '00'];
    }
    return { y: m[1], mo: m[2], d: m[3], h: m[4], mi: m[5], s: m[6] };
  }

  function pad2(v) { return String(v).length < 2 ? '0' + v : String(v); }

  function fmtGPS(g) {
    if (!g) return '';
    var lat = Math.abs(g.lat).toFixed(5), lon = Math.abs(g.lon).toFixed(5);
    return lat + '\u00b0' + (g.lat >= 0 ? 'N' : 'S') + ' ' + lon + '\u00b0' + (g.lon >= 0 ? 'E' : 'W');
  }
  function v1(x) { return Array.isArray(x) ? x[0] : x; }

  var PLACEHOLDER_DEFS = [
    { key: 'Make', label: '厂商' }, { key: 'Model', label: '机型' }, { key: 'Camera', label: '厂商+机型' },
    { key: 'Lens', label: '镜头' }, { key: 'Focal', label: '焦距' }, { key: 'FocalEq', label: '等效焦距' },
    { key: 'Aperture', label: '光圈' }, { key: 'Shutter', label: '快门' }, { key: 'ISO', label: '感光度' },
    { key: 'EV', label: '曝光补偿' }, { key: 'DateTime', label: '日期时间' }, { key: 'Date', label: '日期' },
    { key: 'Time', label: '时间' }, { key: 'GPS', label: 'GPS 坐标' }, { key: 'MP', label: '像素' },
    { key: 'Width', label: '宽' }, { key: 'Height', label: '高' }, { key: 'File', label: '文件名' },
    { key: 'Software', label: '软件' }, { key: 'Artist', label: '作者' }, { key: 'Copyright', label: '版权' },
    { key: 'Note', label: '备注' }
  ];

  function placeholders(exif, extra) {
    extra = extra || {};
    var raw = (exif && exif.raw) || {};
    var beautify = extra.beautify !== false;
    var rawMake = v1(raw.Make) || '';
    var rawModel = v1(raw.Model) || '';
    var make = beautify ? prettyMake(rawMake) : String(rawMake).trim();
    var model = beautify ? modelLabel(rawModel, rawMake) : String(rawModel).trim();
    var camera = cameraLabel(rawMake, rawModel, beautify);

    var dto = v1(raw.DateTimeOriginal) || v1(raw.DateTimeDigitized) || v1(raw.DateTime);
    var dt = parseExifDate(dto);
    var w = extra.width || v1(raw.PixelXDimension) || 0;
    var h = extra.height || v1(raw.PixelYDimension) || 0;

    var iso = v1(raw.ISO);
    if (typeof iso !== 'number') iso = v1(raw.ISOSpeed);
    if (typeof iso !== 'number') iso = v1(raw.RecommendedExposureIndex);

    var focal = v1(raw.FocalLength);
    var focalEq = v1(raw.FocalLengthIn35mmFilm);
    var fnum = v1(raw.FNumber);
    var exp = v1(raw.ExposureTime);
    var ev = v1(raw.ExposureBiasValue);

    var file = extra.file || '';
    var base = file.replace(/\.[^.]+$/, '');

    return {
      Make: make, Model: model, Camera: camera, ModelRaw: String(rawModel).trim(),
      Lens: fmtLens(raw, rawMake, beautify),
      Focal: typeof focal === 'number' ? trimNum(focal, focal % 1 === 0 ? 0 : 1) + 'mm' : '',
      FocalEq: typeof focalEq === 'number' && focalEq > 0 ? trimNum(focalEq, 0) + 'mm' : '',
      Aperture: typeof fnum === 'number' && fnum > 0 ? 'f/' + trimNum(fnum, 1) : '',
      Shutter: fmtShutter(exp),
      ISO: typeof iso === 'number' && iso > 0 ? 'ISO ' + iso : '',
      EV: typeof ev === 'number' && ev !== 0 ? (ev > 0 ? '+' : '') + trimNum(ev, 1) + ' EV' : '',
      Date: dt ? dt.y + '-' + dt.mo + '-' + dt.d + '' : '',
      DateDot: dt ? dt.y + '.' + dt.mo + '.' + dt.d : '',
      Time: dt ? pad2(dt.h) + ':' + dt.mi + ':' + dt.s : '',
      DateTime: dt ? dt.y + '-' + dt.mo + '-' + dt.d + ' ' + pad2(dt.h) + ':' + dt.mi : '',
      Year: dt ? dt.y : '',
      GPS: fmtGPS(exif && exif.raw ? exif.raw.GPS : null),
      MP: w && h ? trimNum((w * h) / 1e6, 1) + 'MP' : '',
      Width: w ? String(w) : '', Height: h ? String(h) : '',
      File: file, Name: base,
      Software: v1(raw.Software) || '', Artist: v1(raw.Artist) || '', Copyright: v1(raw.Copyright) || '',
      Note: extra.note || ''
    };
  }

  function applyTemplate(tpl, map) {
    return String(tpl == null ? '' : tpl).replace(/\{(\w+)\}/g, function (m, k) {
      var v = map[k];
      return v == null || v === '' ? '' : String(v);
    });
  }

  function tidy(line) {
    var t = String(line == null ? '' : line);
    var sep = t.indexOf('|') >= 0 && t.indexOf('\u00b7') < 0 ? '|' : '\u00b7';
    var parts = t.split(/\s*[\u00b7|]\s*/).map(function (s) { return s.replace(/\s+/g, ' ').trim(); })
      .filter(function (s) { return s.length > 0; });
    t = parts.join(' ' + sep + ' ');
    if (sep === '|') t = t.replace(/\s*\|\s*/g, ' | ');
    return t.replace(/^[\s\u00b7|]+|[\s\u00b7|]+$/g, '').trim();
  }

  function hasUsefulData(exif) {
    var raw = (exif && exif.raw) || {};
    return !!(raw.Make || raw.Model || raw.DateTimeOriginal || raw.ExposureTime || raw.FNumber || raw.ISO || raw.FocalLength || raw.LensModel);
  }

  function parse(buffer) {
    try {
      var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      var tiff = null;
      if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) tiff = findJpegExif(bytes);
      else if (bytes.length > 16 && str(bytes, 0, 4) === 'RIFF' && str(bytes, 8, 4) === 'WEBP') tiff = findWebpExif(bytes);
      else if (bytes.length > 12 && bytes[0] === 0x89 && str(bytes, 1, 3) === 'PNG') tiff = findPngExif(bytes);
      if (tiff == null) return { ok: false, reason: 'no-exif', raw: {} };
      var info = readTiff(bytes, tiff);
      if (!info.ok) return { ok: false, reason: info.reason, raw: {} };
      return info;
    } catch (e) {
      return { ok: false, reason: 'error: ' + (e && e.message ? e.message : e), raw: {} };
    }
  }
  /* ---------------- 导出时保留源照片 EXIF ---------------- */

  /* 找到 EXIF（TIFF 块）在文件中的字节范围，兼容 JPEG / PNG / WebP 三种容器 */
  function findExifRange(bytes) {
    var off, i;
    if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      off = 2;
      while (off + 4 <= bytes.length) {
        if (bytes[off] !== 0xff) { off++; continue; }
        var marker = bytes[off + 1];
        if (marker === 0xff) { off++; continue; }
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { off += 2; continue; }
        if (marker === 0xda || marker === 0xd9) break;
        var size = (bytes[off + 2] << 8) | bytes[off + 3];
        if (size < 2) break;
        if (marker === 0xe1 && str(bytes, off + 4, 4) === 'Exif' && bytes[off + 8] === 0 && bytes[off + 9] === 0) {
          return { start: off + 10, end: off + 2 + size };
        }
        off += 2 + size;
      }
      return null;
    }
    if (bytes.length > 16 && str(bytes, 0, 4) === 'RIFF' && str(bytes, 8, 4) === 'WEBP') {
      off = 12;
      while (off + 8 <= bytes.length) {
        var wid = str(bytes, off, 4);
        var wsize = (bytes[off + 4] | (bytes[off + 5] << 8) | (bytes[off + 6] << 16) | (bytes[off + 7] << 24)) >>> 0;
        if (wid === 'EXIF') {
          var p = off + 8;
          if (str(bytes, p, 4) === 'Exif') p += 6;
          return { start: p, end: off + 8 + wsize };
        }
        off += 8 + wsize + (wsize % 2);
      }
      return null;
    }
    if (bytes.length > 16 && bytes[0] === 0x89 && str(bytes, 1, 3) === 'PNG') {
      off = 8;
      while (off + 8 <= bytes.length) {
        var plen = ((bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3]) >>> 0;
        var ptype = str(bytes, off + 4, 4);
        if (ptype === 'eXIf') return { start: off + 8, end: off + 8 + plen };
        if (ptype === 'IEND') return null;
        off += 12 + plen;
      }
      return null;
    }
    return null;
  }

  /* 取出 TIFF 块的副本（不含 "Exif\0\0" 前缀），非 EXIF 文件返回 null */
  function extractTiff(bytes) {
    var r;
    try { r = findExifRange(bytes); } catch (e) { return null; }
    if (!r || r.start < 0 || r.end > bytes.length || r.end - r.start < 8) return null;
    var tiff = bytes.subarray(r.start, r.end);
    var bo = str(tiff, 0, 2);
    if (bo !== 'II' && bo !== 'MM') return null;
    return tiff;
  }

  function patchIfd(dv, little, offset, opts, len) {
    var subs = {};
    if (offset <= 0 || offset + 2 > len) return subs;
    var count = dv.getUint16(offset, little);
    if (count > 512) return subs;
    var p = offset + 2;
    for (var i = 0; i < count; i++, p += 12) {
      if (p + 12 > len) break;
      var tag = dv.getUint16(p, little);
      var type = dv.getUint16(p + 2, little);
      var num = dv.getUint32(p + 4, little);
      if (tag === 0x8769 || tag === 0x8825 || tag === 0xa005) { subs[tag] = dv.getUint32(p + 8, little); continue; }
      var size = TYPE_SIZE[type];
      if (!size || size * num > 4) continue;   /* 只改内联（<=4 字节）的数值 */
      if (tag === 0x0112) {
        if (type === 3) dv.setUint16(p + 8, 1, little);
        else if (type === 4) dv.setUint32(p + 8, 1, little);
      } else if (tag === 0xa002 && opts.width) {
        if (type === 4) dv.setUint32(p + 8, opts.width, little);
        else if (type === 3) dv.setUint16(p + 8, Math.min(65535, opts.width), little);
      } else if (tag === 0xa003 && opts.height) {
        if (type === 4) dv.setUint32(p + 8, opts.height, little);
        else if (type === 3) dv.setUint16(p + 8, Math.min(65535, opts.height), little);
      }
    }
    return subs;
  }

  /*
   * 复制一份 TIFF 块，并把「方向」重置为 1（导出时像素已经转过正，否则看图软件会再转一次），
   * 同时把 Exif 子 IFD 里的宽高更新为导出尺寸。
   */
  function patchTiff(tiff, opts) {
    var out = new Uint8Array(tiff.length);
    out.set(tiff);
    try {
      var dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
      var bo = str(out, 0, 2);
      if (bo !== 'II' && bo !== 'MM') return out;
      var little = bo === 'II';
      if (dv.getUint16(2, little) !== 42) return out;
      var subs = patchIfd(dv, little, dv.getUint32(4, little), opts, out.length);
      if (subs[0x8769]) patchIfd(dv, little, subs[0x8769], opts, out.length);
    } catch (e) { /* 结构异常就原样返回 */ }
    return out;
  }

  var CRC_TABLE = null;
  function crc32(buf) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Int32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        CRC_TABLE[n] = c;
      }
    }
    var x = -1;
    for (var i = 0; i < buf.length; i++) x = CRC_TABLE[(x ^ buf[i]) & 0xff] ^ (x >>> 8);
    return (x ^ -1) >>> 0;
  }

  function injectJpeg(jpeg, tiff) {
    var payload = tiff.length + 6;
    var size = payload + 2;
    if (size > 0xffff || jpeg.length < 4) return null;
    var seg = new Uint8Array(4 + payload);
    seg[0] = 0xff; seg[1] = 0xe1;
    seg[2] = (size >> 8) & 0xff; seg[3] = size & 0xff;
    seg[4] = 0x45; seg[5] = 0x78; seg[6] = 0x69; seg[7] = 0x66; seg[8] = 0; seg[9] = 0;
    seg.set(tiff, 10);
    var at = 2;
    if (jpeg[2] === 0xff && jpeg[3] === 0xe0) at = 4 + ((jpeg[4] << 8) | jpeg[5]);
    if (at > jpeg.length) at = 2;
    var out = new Uint8Array(jpeg.length + seg.length);
    out.set(jpeg.subarray(0, at), 0);
    out.set(seg, at);
    out.set(jpeg.subarray(at), at + seg.length);
    return out;
  }

  function injectPng(png, tiff) {
    if (png.length < 33) return null;
    var chunk = new Uint8Array(12 + tiff.length);
    var dv = new DataView(chunk.buffer);
    dv.setUint32(0, tiff.length);
    chunk[4] = 0x65; chunk[5] = 0x58; chunk[6] = 0x49; chunk[7] = 0x66;  /* eXIf */
    chunk.set(tiff, 8);
    dv.setUint32(8 + tiff.length, crc32(chunk.subarray(4, 8 + tiff.length)));
    var out = new Uint8Array(png.length + chunk.length);
    out.set(png.subarray(0, 33), 0);          /* PNG 签名 + IHDR */
    out.set(chunk, 33);
    out.set(png.subarray(33), 33 + chunk.length);
    return out;
  }

  /* 把源图的 EXIF 写进刚导出的图片字节里；不支持或没有 EXIF 时返回 null */
  function embedExif(container, tiff, opts) {
    if (!container || !tiff || !tiff.length) return null;
    opts = opts || {};
    try {
      var patched = patchTiff(tiff, opts);
      if (container.length > 8 && container[0] === 0x89 && container[1] === 0x50 && container[2] === 0x4e && container[3] === 0x47) {
        return injectPng(container, patched);
      }
      if (container[0] === 0xff && container[1] === 0xd8) return injectJpeg(container, patched);
      return null;
    } catch (e) { return null; }
  }

  NW.Exif = {
    parse: parse, placeholders: placeholders, applyTemplate: applyTemplate, tidy: tidy,
    prettyMake: prettyMake, modelLabel: modelLabel, cameraLabel: cameraLabel,
    hasUsefulData: hasUsefulData, PLACEHOLDER_DEFS: PLACEHOLDER_DEFS,
    extractTiff: extractTiff, patchTiff: patchTiff, embedExif: embedExif
  };
})(window);