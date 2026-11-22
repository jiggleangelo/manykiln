/* Manykiln: original, dependency-free heuristics. No upstream code copied. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ImageCompressResize = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STRINGS = Object.freeze({ limit: 'Output size is an estimate, not a guarantee.',
    browser: 'Encoding formats depend on this browser; animated images become one still frame.' });
  function finite(value, fallback = 0) {
    const n = Number(value); return Number.isFinite(n) ? n : fallback;
  }
  function normalise(input) {
    if (typeof input === 'string') return input.trim().replace(/\s+/g, ' ').toLowerCase();
    if (input && typeof input === 'object') return {name: String(input.name || '').trim(),
      type: String(input.type || '').trim().toLowerCase(), size: Math.max(0, finite(input.size))};
    return '';
  }
  function targetDimensions(width, height, maxDimension, mode = 'longest') {
    const w = finite(width), h = finite(height), max = finite(maxDimension);
    if (w <= 0 || h <= 0) throw new RangeError('Image dimensions must be positive.');
    if (!['longest', 'width', 'height', 'exact'].includes(mode)) throw new RangeError('Unknown resize mode.');
    // "exact" keeps supplied dimensions: it never invents a second aspect ratio.
    const scale = max <= 0 || mode === 'exact' ? 1 : Math.min(1, max / (mode === 'width' ? w : mode === 'height' ? h : Math.max(w, h)));
    return {width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale))};
  }
  function qualityForSize(originalBytes, maxBytes, maxDimension) {
    const original = Math.max(0, finite(originalBytes)), max = finite(maxBytes);
    if (max <= 0 || original <= 0 || max >= original) return 100;
    // A logarithmic estimate only. Pixel dimensions cannot be inferred from bytes.
    // maxDimension is validated by targetDimensions, not guessed from file size.
    return Math.max(0, Math.min(100, Math.round(100 + 25 * Math.log2(max / original))));
  }
  function compressPlan(file) {
    file = file || {};
    const maxDimension = Math.max(0, Math.floor(finite(file.maxDimension, 1600)));
    const maxBytes = Math.max(0, finite(file.maxBytes));
    const sourceBytes = Math.max(0, finite(file.size));
    const hasAlpha = file.hasAlpha == null ? /^image\/(png|webp|gif)$/.test(normalise(file.type || '')) : Boolean(file.hasAlpha);
    let format = normalise(file.format || 'auto');
    if (file.lossless) format = 'png';
    else if (format === 'auto') format = maxBytes > 0 && maxBytes < sourceBytes / 2 ? 'webp' : hasAlpha ? 'png' : 'jpeg';
    if (!['jpeg', 'png', 'webp'].includes(format)) throw new RangeError('Unsupported encoding format.');
    const explicitQuality = file.quality !== '' && file.quality != null;
    let estimateBytes = sourceBytes;
    if (finite(file.width) > 0 && finite(file.height) > 0) {
      const target = targetDimensions(file.width, file.height, maxDimension, file.mode || 'longest');
      estimateBytes *= target.width * target.height / (file.width * file.height);
    }
    const quality = explicitQuality ? Math.max(0, Math.min(100, finite(file.quality, 100))) : qualityForSize(estimateBytes, maxBytes, maxDimension);
    return {maxDimension, maxBytes, format, quality};
  }
  return Object.freeze({normalise, targetDimensions, qualityForSize, compressPlan, STRINGS});
}));
