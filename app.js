'use strict';

const { PDFDocument, PDFName, PDFHexString, PDFString } = PDFLib;
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const $ = (id) => document.getElementById(id);
const els = {
  drop: $('drop'), file: $('file'), dropText: $('drop-text'), status: $('status'),
  tree: $('tree'), count: $('count'), json: $('json'), errors: $('errors'),
  format: $('format'), reset: $('reset'), copy: $('copy'), dlJson: $('dl-json'),
  loadJson: $('load-json'), loadJsonLabel: $('load-json-label'), apply: $('apply'),
};

const state = { bytes: null, name: 'document.pdf', pageCount: 0, original: [] };

// ---------- Reading ----------

async function readOutline(bytes) {
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  state.pageCount = pdf.numPages;

  async function resolvePage(dest) {
    try {
      if (typeof dest === 'string') dest = await pdf.getDestination(dest);
      if (!Array.isArray(dest)) return null;
      const target = dest[0];
      if (Number.isInteger(target)) return target + 1;
      if (target && typeof target === 'object') return (await pdf.getPageIndex(target)) + 1;
    } catch (_) { /* unresolvable destination */ }
    return null;
  }

  async function convert(items) {
    const out = [];
    for (const it of items) {
      const node = { title: it.title };
      if (it.url) node.url = it.url;
      else node.page = await resolvePage(it.dest);
      if (it.items && it.items.length) {
        if (it.count > 0) node.open = true;
        node.children = await convert(it.items);
      }
      out.push(node);
    }
    return out;
  }

  const outline = (await pdf.getOutline()) || [];
  const result = await convert(outline);
  await pdf.destroy();
  return result;
}

// ---------- Validation ----------

function validate(data) {
  const errors = [];
  if (!Array.isArray(data)) return ['Root must be an array of entries.'];
  (function walk(items, path) {
    items.forEach((it, i) => {
      const p = `${path}[${i}]`;
      if (!it || typeof it !== 'object' || Array.isArray(it)) { errors.push(`${p}: must be an object.`); return; }
      if (typeof it.title !== 'string') errors.push(`${p}: "title" must be a string.`);
      if (it.url !== undefined) {
        if (typeof it.url !== 'string' || !it.url) errors.push(`${p}: "url" must be a non-empty string.`);
      } else if (!Number.isInteger(it.page) || it.page < 1 || it.page > state.pageCount) {
        errors.push(`${p}: "page" must be an integer between 1 and ${state.pageCount} (got ${JSON.stringify(it.page)}).`);
      }
      if (it.open !== undefined && typeof it.open !== 'boolean') errors.push(`${p}: "open" must be true or false.`);
      if (it.children !== undefined) {
        if (!Array.isArray(it.children)) errors.push(`${p}: "children" must be an array.`);
        else walk(it.children, `${p}.children`);
      }
    });
  })(data, '');
  return errors;
}

// ---------- Writing ----------

function writeOutline(doc, items) {
  const ctx = doc.context;
  const pageRefs = doc.getPages().map((p) => p.ref);
  doc.catalog.delete(PDFName.of('Outlines'));
  if (!items.length) return;

  // Number of entries visible beneath an item when it's expanded.
  const visible = (it) => (it.children || []).reduce((n, c) => n + 1 + (c.open ? visible(c) : 0), 0);

  function build(list, parentRef) {
    const refs = list.map(() => ctx.nextRef());
    list.forEach((it, i) => {
      const dict = {
        Title: PDFHexString.fromText(it.title),
        Parent: parentRef,
      };
      if (i > 0) dict.Prev = refs[i - 1];
      if (i < list.length - 1) dict.Next = refs[i + 1];
      if (it.url) {
        dict.A = { Type: 'Action', S: 'URI', URI: PDFString.of(it.url) };
      } else {
        dict.Dest = [pageRefs[it.page - 1], 'XYZ', null, null, null];
      }
      const kids = it.children || [];
      if (kids.length) {
        const kidRefs = build(kids, refs[i]);
        dict.First = kidRefs[0];
        dict.Last = kidRefs[kidRefs.length - 1];
        dict.Count = it.open ? visible(it) : -visible(it);
      }
      ctx.assign(refs[i], ctx.obj(dict));
    });
    return refs;
  }

  const rootRef = ctx.nextRef();
  const topRefs = build(items, rootRef);
  const total = items.reduce((n, it) => n + 1 + (it.open ? visible(it) : 0), 0);
  ctx.assign(rootRef, ctx.obj({
    Type: 'Outlines',
    First: topRefs[0],
    Last: topRefs[topRefs.length - 1],
    Count: total,
  }));
  doc.catalog.set(PDFName.of('Outlines'), rootRef);
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}

// ---------- UI ----------

function setStatus(msg, kind = '') {
  els.status.textContent = msg;
  els.status.className = 'status ' + kind;
}

function renderTree(items) {
  if (!items.length) {
    els.tree.innerHTML = '<p class="muted">This PDF has no outline. Add entries in the JSON editor.</p>';
    return;
  }
  const build = (list) => {
    const ul = document.createElement('ul');
    for (const it of list) {
      const li = document.createElement('li');
      const row = document.createElement('div');
      row.className = 'row';
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = it.title;
      const pg = document.createElement('span');
      pg.className = 'pg';
      if (it.url) pg.textContent = '↗ link';
      else if (it.page == null) { pg.textContent = 'no page'; pg.classList.add('bad'); }
      else {
        pg.textContent = 'p. ' + it.page;
        if (!Number.isInteger(it.page) || it.page < 1 || it.page > state.pageCount) pg.classList.add('bad');
      }
      row.append(title, pg);
      if (it.children && it.children.length) {
        const det = document.createElement('details');
        det.open = true;
        const sum = document.createElement('summary');
        sum.append(row);
        det.append(sum, build(it.children));
        li.append(det);
      } else {
        li.className = 'leaf';
        li.append(row);
      }
      ul.append(li);
    }
    return ul;
  };
  els.tree.replaceChildren(build(items));
}

function countEntries(items) {
  return items.reduce((n, it) => n + 1 + countEntries(it.children || []), 0);
}

// Parses the editor; renders tree + errors. Returns data if valid, else null.
function sync() {
  const text = els.json.value;
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    els.errors.innerHTML = '';
    const d = document.createElement('div');
    d.textContent = 'Invalid JSON: ' + e.message;
    els.errors.append(d);
    els.apply.disabled = true;
    return null;
  }
  const errors = validate(data);
  els.errors.replaceChildren(...errors.slice(0, 50).map((m) => {
    const d = document.createElement('div');
    d.textContent = m;
    return d;
  }));
  if (Array.isArray(data)) {
    renderTree(data.filter((x) => x && typeof x === 'object'));
    els.count.textContent = `${countEntries(data)} entries · ${state.pageCount} pages`;
  }
  els.apply.disabled = errors.length > 0;
  return errors.length ? null : data;
}

function setEditor(data) {
  els.json.value = JSON.stringify(data, null, 2);
  sync();
}

async function loadPdf(file) {
  if (!file) return;
  setStatus('Reading ' + file.name + '…');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const outline = await readOutline(bytes);
    state.bytes = bytes;
    state.name = file.name;
    state.original = outline;
    for (const el of [els.json, els.format, els.reset, els.copy, els.dlJson, els.loadJson]) el.disabled = false;
    els.loadJsonLabel.removeAttribute('aria-disabled');
    els.dropText.innerHTML = '';
    const strong = document.createElement('strong');
    strong.textContent = file.name;
    els.dropText.append(strong, ' — click or drop to load another PDF');
    setEditor(outline);
    setStatus(outline.length
      ? `Loaded outline with ${countEntries(outline)} entries.`
      : 'This PDF has no outline yet.', 'ok');
  } catch (e) {
    console.error(e);
    setStatus('Could not read PDF: ' + (e.message || e), 'error');
  }
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function applyOutline() {
  const data = sync();
  if (!data) return;
  els.apply.disabled = true;
  setStatus('Writing PDF…');
  try {
    const doc = await PDFDocument.load(state.bytes, { ignoreEncryption: true, updateMetadata: false });
    writeOutline(doc, data);
    const out = await doc.save();
    const base = state.name.replace(/\.pdf$/i, '');
    download(new Blob([out], { type: 'application/pdf' }), base + '-outline.pdf');
    setStatus(`Saved ${base}-outline.pdf with ${countEntries(data)} outline entries.`, 'ok');
  } catch (e) {
    console.error(e);
    setStatus('Could not write PDF: ' + (e.message || e), 'error');
  } finally {
    els.apply.disabled = false;
  }
}

// ---------- Events ----------

els.file.addEventListener('change', () => { loadPdf(els.file.files[0]); els.file.value = ''; });
['dragenter', 'dragover'].forEach((t) => els.drop.addEventListener(t, (e) => { e.preventDefault(); els.drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => els.drop.addEventListener(t, (e) => { e.preventDefault(); els.drop.classList.remove('over'); }));
els.drop.addEventListener('drop', (e) => loadPdf(e.dataTransfer.files[0]));
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

let timer;
els.json.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(sync, 250); });
els.json.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault();
    document.execCommand('insertText', false, '  ');
  }
});

els.format.addEventListener('click', () => {
  try { setEditor(JSON.parse(els.json.value)); } catch (_) { sync(); }
});
els.reset.addEventListener('click', () => { setEditor(state.original); setStatus('Reset to the outline in the PDF.'); });
els.copy.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(els.json.value); setStatus('JSON copied to clipboard.', 'ok'); }
  catch (_) { setStatus('Clipboard not available.', 'error'); }
});
els.dlJson.addEventListener('click', () => {
  download(new Blob([els.json.value], { type: 'application/json' }), state.name.replace(/\.pdf$/i, '') + '-outline.json');
});
els.loadJson.addEventListener('change', async () => {
  const f = els.loadJson.files[0];
  els.loadJson.value = '';
  if (!f) return;
  els.json.value = await f.text();
  sync();
  setStatus('Loaded ' + f.name + '.');
});
els.apply.addEventListener('click', applyOutline);
