/* DOM boundary: local files only, canvas encoding, object URLs revoked on reset. */
(function () {
  'use strict';
  const api = globalThis.ImageCompressResize;
  const byId = id => document.getElementById(id);
  let selected = null, resultUrl = null, previewUrl = null, generation = 0;
  function clearOutput() {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    if (previewUrl && previewUrl !== resultUrl) URL.revokeObjectURL(previewUrl);
    resultUrl = previewUrl = null;
    byId('download').removeAttribute('href'); byId('download').hidden = true;
    byId('preview').removeAttribute('src'); byId('preview').hidden = true;
  }
  function reset(clearFile) {
    generation += 1; clearOutput();
    if (clearFile) { selected = null; byId('file').value = ''; }
    byId('status').textContent = selected ? 'Image selected. Choose options and compress.' : 'Choose an image to begin.';
  }
  function select(file) {
    reset(true);
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif|avif|bmp)$/.test(file.type)) {
      byId('status').textContent = 'Choose a JPEG, PNG, WebP, GIF, AVIF or BMP image.'; return;
    }
    if (file.size > 30 * 1024 * 1024) { byId('status').textContent = 'Please choose an image under 30 MiB.'; return; }
    selected = file; byId('status').textContent = 'Selected ' + file.name + ' (' + file.size + ' bytes).';
  }
  async function compress() {
    if (!selected) { byId('status').textContent = 'Choose an image first.'; return; }
    const file = selected, token = ++generation;
    clearOutput(); byId('compress').disabled = true;
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      if (bitmap.width * bitmap.height > 40000000) throw new Error('Image exceeds 40 megapixels.');
      const plan = api.compressPlan({size: file.size, maxDimension: byId('maxDimension').value,
        maxBytes: Number(byId('maxKiB').value) * 1024, format: byId('format').value,
        quality: byId('quality').value, width: bitmap.width, height: bitmap.height,
        hasAlpha: file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/gif'});
      const dimensions = api.targetDimensions(bitmap.width, bitmap.height, plan.maxDimension, 'longest');
      const canvas = document.createElement('canvas'); canvas.width = dimensions.width; canvas.height = dimensions.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas encoding is unavailable.');
      if (plan.format === 'jpeg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/' + plan.format, plan.quality / 100));
      if (token !== generation) return;
      if (!blob) throw new Error('This browser could not encode the image.');
      const ext = ({'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp'})[blob.type];
      if (!ext) throw new Error('The browser returned an unsupported encoding.');
      resultUrl = URL.createObjectURL(blob); previewUrl = resultUrl;
      const link = byId('download'); link.href = resultUrl; link.download = 'compressed-image.' + ext; link.hidden = false;
      byId('preview').src = resultUrl; byId('preview').hidden = false;
      const savings = ((1 - blob.size / Math.max(1, file.size)) * 100).toFixed(1);
      byId('status').textContent = file.size + ' → ' + blob.size + ' bytes; savings ' + savings + '%. ' +
        dimensions.width + ' × ' + dimensions.height + '. Actual format: ' + blob.type + '. ' + api.STRINGS.limit;
    } catch (error) {
      if (token === generation) byId('status').textContent = error.message || 'Could not process this image.';
    } finally {
      if (bitmap && typeof bitmap.close === 'function') bitmap.close();
      byId('compress').disabled = false;
    }
  }
  byId('file').addEventListener('change', event => select(event.target.files[0]));
  const drop = byId('drop');
  drop.addEventListener('dragover', event => event.preventDefault());
  drop.addEventListener('drop', event => { event.preventDefault(); select(event.dataTransfer.files[0]); });
  byId('compress').addEventListener('click', compress);
  byId('reset').addEventListener('click', () => { byId('options').reset(); reset(false); });
  byId('clear').addEventListener('click', () => { byId('options').reset(); reset(true); });
  const presets = [[256, 32, 'webp'], [1200, 200, 'webp'], [3200, 1500, 'jpeg'], [1600, 0, 'png']];
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
    const [max, kib, format] = presets[Number(button.dataset.preset)];
    byId('maxDimension').value = String(max); byId('maxKiB').value = String(kib);
    byId('format').value = format; byId('quality').value = '';
  }));
  globalThis.addEventListener('pagehide', () => { generation += 1; clearOutput(); });
}());
