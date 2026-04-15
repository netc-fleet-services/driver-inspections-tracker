// hub/Tool.js — Pre-Trip Compliance Audit tool for NETC Labs hub
// Exports Tool() → HTMLElement.
// Lazy-loads SheetJS from CDN only when the user clicks Run Audit.
// Imports processing logic from ../lib/engine.js (resolved via CDN or local path).

import {
  parseDriverActivity,
  parsePreTrip,
  calculateAudit,
  fmtDate,
} from '../lib/engine.js';

// ---------------------------------------------------------------------------
// Scoped CSS  (prefix: pit-)
// All colours reference NETC Labs CSS variables so the widget adapts to
// light/dark theme automatically.
// ---------------------------------------------------------------------------
const CSS = `
  .pit-root * { box-sizing: border-box; }
  .pit-root { font-family: inherit; }

  /* ── Upload grid ── */
  .pit-upload-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;
  }
  @media (max-width: 600px) { .pit-upload-grid { grid-template-columns: 1fr; } }

  .pit-drop {
    position: relative; border: 2px dashed var(--outline);
    border-radius: 0.75rem; padding: 1.75rem 1.25rem;
    text-align: center; cursor: pointer;
    background: var(--surface-high);
    transition: border-color 0.15s, background 0.15s;
  }
  .pit-drop:hover, .pit-drop.pit-over {
    border-color: var(--primary); background: var(--primary-container);
  }
  .pit-drop.pit-loaded {
    border-color: #4ade80;
    background: color-mix(in srgb, #4ade80 8%, var(--surface-high));
  }
  .pit-drop input[type=file] {
    position: absolute; inset: 0; opacity: 0; cursor: pointer;
    width: 100%; height: 100%;
  }
  .pit-drop-icon { font-size: 1.75rem; margin-bottom: 0.375rem; }
  .pit-drop-label {
    font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--on-surface);
  }
  .pit-drop-hint { font-size: 0.72rem; color: var(--on-surface-muted); margin-top: 0.2rem; }
  .pit-drop-file { font-size: 0.77rem; color: #4ade80; margin-top: 0.5rem; font-weight: 600; word-break: break-all; }

  /* ── Buttons ── */
  .pit-btn-run {
    display: block; width: 100%; margin-top: 1rem;
    padding: 0.7rem 1.5rem;
    background: var(--primary); color: #0a0a0a;
    border: none; border-radius: 0.5rem;
    font-size: 0.875rem; font-weight: 700; letter-spacing: 0.02em;
    cursor: pointer; transition: opacity 0.15s; font-family: inherit;
  }
  .pit-btn-run:hover:not(:disabled) { opacity: 0.85; }
  .pit-btn-run:disabled { opacity: 0.35; cursor: not-allowed; }

  .pit-btn-sec {
    padding: 0.4rem 0.875rem;
    background: transparent; border: 1px solid var(--outline);
    border-radius: 0.375rem; color: var(--on-surface);
    font-size: 0.78rem; cursor: pointer; font-family: inherit;
    transition: background 0.12s, border-color 0.12s;
  }
  .pit-btn-sec:hover { background: var(--surface-high); border-color: var(--primary); }

  /* ── Error / info banner ── */
  .pit-error {
    margin-top: 0.875rem; padding: 0.7rem 1rem;
    background: color-mix(in srgb, var(--error) 12%, var(--surface));
    border: 1px solid var(--error); border-radius: 0.5rem;
    color: var(--error); font-size: 0.8rem; line-height: 1.45;
  }

  /* ── Summary cards ── */
  .pit-cards {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.625rem; margin-bottom: 1.125rem;
  }
  @media (max-width: 760px) { .pit-cards { grid-template-columns: repeat(3, 1fr); } }
  @media (max-width: 440px) { .pit-cards { grid-template-columns: repeat(2, 1fr); } }

  .pit-card {
    background: var(--surface-container); border: 1px solid var(--outline-variant);
    border-radius: 0.625rem; padding: 0.75rem 0.875rem;
  }
  .pit-card-hl  { background: var(--primary-container); border-color: transparent; }
  .pit-card-warn {
    background: color-mix(in srgb, #f59e0b 12%, var(--surface-container));
    border-color: color-mix(in srgb, #f59e0b 40%, transparent);
  }
  .pit-card-good {
    background: color-mix(in srgb, #4ade80 10%, var(--surface-container));
    border-color: color-mix(in srgb, #4ade80 35%, transparent);
  }
  .pit-card-lbl {
    font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--on-surface-muted); line-height: 1.3;
  }
  .pit-card-hl .pit-card-lbl  { color: var(--on-primary-container); opacity: 0.75; }
  .pit-card-val {
    font-size: 1.3rem; font-weight: 800; color: var(--on-surface); margin-top: 0.2rem;
  }
  .pit-card-hl .pit-card-val  { color: var(--on-primary-container); }
  .pit-card-warn .pit-card-val { color: #f59e0b; }
  .pit-card-good .pit-card-val { color: #4ade80; }

  /* ── Controls row ── */
  .pit-controls {
    display: flex; gap: 0.625rem; align-items: center;
    margin-bottom: 0.75rem; flex-wrap: wrap;
  }
  .pit-search {
    flex: 1; min-width: 160px; padding: 0.45rem 0.7rem;
    background: var(--surface-high); border: 1px solid var(--outline);
    border-radius: 0.375rem; color: var(--on-surface);
    font-size: 0.8rem; font-family: inherit;
  }
  .pit-search:focus { outline: none; border-color: var(--primary); }
  .pit-search::placeholder { color: var(--on-surface-muted); }
  .pit-date-range { font-size: 0.72rem; color: var(--on-surface-muted); white-space: nowrap; }

  /* ── Table ── */
  .pit-tbl-wrap {
    overflow-x: auto; border-radius: 0.5rem;
    border: 1px solid var(--outline-variant);
  }
  .pit-tbl { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  .pit-tbl th {
    background: var(--surface-high); color: var(--on-surface-muted);
    font-size: 0.65rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.07em;
    padding: 0.575rem 0.875rem;
    border-bottom: 1px solid var(--outline-variant);
    cursor: pointer; user-select: none; white-space: nowrap;
    transition: color 0.12s;
  }
  .pit-tbl th:hover { color: var(--on-surface); }
  .pit-tbl th[data-col] { text-align: left; }
  .pit-tbl th.pit-asc::after  { content: ' ↑'; color: var(--primary); }
  .pit-tbl th.pit-desc::after { content: ' ↓'; color: var(--primary); }
  .pit-tbl th.pit-num { text-align: right; }

  .pit-tbl td {
    padding: 0.55rem 0.875rem;
    border-bottom: 1px solid var(--outline-variant);
    vertical-align: middle;
  }
  .pit-tbl tbody tr:last-child td { border-bottom: none; }
  .pit-tbl tbody tr:hover { background: var(--surface-high); }
  .pit-tbl td.pit-num { text-align: right; }

  /* Row state colouring (only applies to driver name cell) */
  .pit-row-perfect .pit-driver { color: #4ade80; font-weight: 600; }
  .pit-row-warn    .pit-driver { color: #f59e0b; }
  .pit-row-crit    .pit-driver { color: var(--error); }

  /* Completion % bar */
  .pit-pct-cell { display: flex; align-items: center; gap: 0.5rem; min-width: 120px; }
  .pit-bar      { flex: 1; height: 5px; background: var(--outline-variant); border-radius: 3px; }
  .pit-bar-fill { height: 100%; border-radius: 3px; }
  .pit-pct-lbl  { min-width: 38px; text-align: right; font-weight: 700; font-size: 0.78rem; }

  /* Empty / no-results */
  .pit-empty {
    padding: 2.5rem; text-align: center;
    color: var(--on-surface-muted); font-size: 0.83rem;
  }

  /* ── Details accordions ── */
  details.pit-accord {
    margin-top: 1rem; border: 1px solid var(--outline-variant);
    border-radius: 0.625rem; overflow: hidden;
  }
  details.pit-accord summary {
    padding: 0.75rem 1rem; cursor: pointer;
    font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--on-surface-muted); background: var(--surface-container);
    user-select: none; list-style: none; display: flex; justify-content: space-between;
  }
  details.pit-accord summary::after { content: '▸'; }
  details.pit-accord[open] summary::after { content: '▾'; }
  details.pit-accord summary:hover { color: var(--on-surface); }
  details.pit-accord[open] summary { border-bottom: 1px solid var(--outline-variant); }
  .pit-accord-body { padding: 0.625rem; overflow-x: auto; }

  /* Compact sub-table used inside accordions */
  .pit-sub-tbl { width: 100%; border-collapse: collapse; font-size: 0.77rem; }
  .pit-sub-tbl th {
    background: var(--surface-high); color: var(--on-surface-muted);
    font-size: 0.63rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.06em; padding: 0.45rem 0.75rem;
    border-bottom: 1px solid var(--outline-variant);
  }
  .pit-sub-tbl td {
    padding: 0.4rem 0.75rem; border-bottom: 1px solid var(--outline-variant);
    color: var(--on-surface);
  }
  .pit-sub-tbl tbody tr:last-child td { border-bottom: none; }
  .pit-sub-tbl tbody tr:hover { background: var(--surface-high); }

  /* ── Spinner ── */
  @keyframes pit-spin { to { transform: rotate(360deg); } }
  .pit-spinner {
    display: inline-block; width: 16px; height: 16px;
    border: 2px solid var(--outline); border-top-color: var(--primary);
    border-radius: 50%; animation: pit-spin 0.65s linear infinite;
    vertical-align: middle; margin-right: 0.375rem;
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pctColor(pct) {
  if (pct >= 100) return '#4ade80';
  if (pct >= 80)  return 'var(--primary)';
  if (pct >= 50)  return '#f59e0b';
  return 'var(--error)';
}

function rowClass(pct) {
  if (pct >= 100) return 'pit-row-perfect';
  if (pct < 80)   return pct < 50 ? 'pit-row-crit' : 'pit-row-warn';
  return '';
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Exported Tool function
// ---------------------------------------------------------------------------

export function Tool() {
  // ── DOM root ──────────────────────────────────────────────────────────────
  const el = document.createElement('div');
  el.className = 'pit-root';

  const style = document.createElement('style');
  style.textContent = CSS;
  el.appendChild(style);

  // ── Per-instance state ────────────────────────────────────────────────────
  let activityFile  = null;
  let pretripFile   = null;
  let auditData     = null;   // { results, dateRange, fuzzyMatches, missedDetails }
  let sortCol       = 'pct';
  let sortDir       = 'asc';
  let query         = '';
  let xlsxModule    = null;   // cached after first load

  // ── Initial HTML ──────────────────────────────────────────────────────────
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="pit-upload-grid" id="pit-ugrid">
      <div class="pit-drop" id="pit-zone-act">
        <input type="file" id="pit-file-act" accept=".xlsx,.xls">
        <div class="pit-drop-icon">📋</div>
        <div class="pit-drop-label">Driver Activity Report</div>
        <div class="pit-drop-hint">DriverActivity.xlsx — Detailed tab</div>
        <div class="pit-drop-file" id="pit-act-name"></div>
      </div>
      <div class="pit-drop" id="pit-zone-pt">
        <input type="file" id="pit-file-pt" accept=".xlsx,.xls">
        <div class="pit-drop-icon">🔍</div>
        <div class="pit-drop-label">PreTrip Inspections Report</div>
        <div class="pit-drop-hint">PreTripInspections.xlsx — Export tab</div>
        <div class="pit-drop-file" id="pit-pt-name"></div>
      </div>
    </div>
    <div id="pit-err" style="display:none"></div>
    <button class="pit-btn-run" id="pit-run" disabled>Run Audit</button>

    <div id="pit-results" style="display:none; margin-top:1.75rem">
      <div class="pit-cards" id="pit-cards"></div>
      <div class="pit-controls">
        <input type="search" class="pit-search" id="pit-search"
               placeholder="Search drivers, trucks…">
        <span class="pit-date-range" id="pit-dates"></span>
        <button class="pit-btn-sec" id="pit-export">↓ Export Excel</button>
        <button class="pit-btn-sec" id="pit-reset">← New Audit</button>
      </div>
      <div class="pit-tbl-wrap">
        <table class="pit-tbl">
          <thead>
            <tr>
              <th data-col="driver">Driver</th>
              <th data-col="required" class="pit-num">Required</th>
              <th data-col="completed" class="pit-num">Completed</th>
              <th data-col="missed" class="pit-num">Missed</th>
              <th data-col="pct">Completion %</th>
            </tr>
          </thead>
          <tbody id="pit-tbody"></tbody>
        </table>
      </div>
      <div id="pit-details"></div>
    </div>
  `;
  el.appendChild(container);

  // ── Query helpers ─────────────────────────────────────────────────────────
  const q = id => container.querySelector('#' + id);
  const qAll = sel => container.querySelectorAll(sel);

  // ── File drop setup ───────────────────────────────────────────────────────
  function setupDrop(zoneId, inputId, nameId, which) {
    const zone  = q(zoneId);
    const input = q(inputId);
    const lbl   = q(nameId);

    const accept = (file) => {
      if (!file) return;
      if (which === 'act') activityFile = file;
      else                 pretripFile  = file;
      lbl.textContent = '✓ ' + file.name;
      zone.classList.add('pit-loaded');
      updateRun();
    };

    input.addEventListener('change', e => accept(e.target.files[0]));
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('pit-over'); });
    zone.addEventListener('dragleave', ()  => zone.classList.remove('pit-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('pit-over');
      accept(e.dataTransfer.files[0]);
    });
  }

  setupDrop('pit-zone-act', 'pit-file-act', 'pit-act-name', 'act');
  setupDrop('pit-zone-pt',  'pit-file-pt',  'pit-pt-name',  'pt');

  function updateRun() {
    q('pit-run').disabled = !(activityFile && pretripFile);
  }

  // ── Show / hide error ─────────────────────────────────────────────────────
  function showErr(msg) {
    const el = q('pit-err');
    el.className = 'pit-error';
    el.textContent = '⚠ ' + msg;
    el.style.display = 'block';
  }
  function clearErr() { q('pit-err').style.display = 'none'; }

  // ── Read file as ArrayBuffer ──────────────────────────────────────────────
  function readBuf(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = e => resolve(new Uint8Array(e.target.result));
      r.onerror = reject;
      r.readAsArrayBuffer(file);
    });
  }

  // ── Run audit ─────────────────────────────────────────────────────────────
  q('pit-run').addEventListener('click', async () => {
    clearErr();
    const btn = q('pit-run');
    btn.disabled = true;
    btn.innerHTML = '<span class="pit-spinner"></span>Processing…';

    try {
      // Lazy-load SheetJS (cached after first call)
      if (!xlsxModule) {
        xlsxModule = await import('https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.mjs');
      }
      const XLSX = xlsxModule;

      const [actBuf, ptBuf] = await Promise.all([
        readBuf(activityFile),
        readBuf(pretripFile),
      ]);

      const actWb = XLSX.read(actBuf, { type: 'array', cellDates: true });
      const ptWb  = XLSX.read(ptBuf,  { type: 'array', cellDates: true });

      const required    = parseDriverActivity(actWb, XLSX);
      const completions = parsePreTrip(ptWb, XLSX);
      auditData = calculateAudit(required, completions);

      // Swap views
      q('pit-ugrid').style.display   = 'none';
      btn.style.display              = 'none';
      q('pit-err').style.display     = 'none';
      q('pit-results').style.display = 'block';

      renderCards();
      renderTable();
      renderDetails();

    } catch (err) {
      showErr(err.message || 'An unexpected error occurred. Check that the correct files were uploaded.');
    } finally {
      btn.disabled  = false;
      btn.innerHTML = 'Run Audit';
    }
  });

  // ── Reset ─────────────────────────────────────────────────────────────────
  q('pit-reset').addEventListener('click', () => {
    activityFile = pretripFile = auditData = null;
    sortCol = 'pct'; sortDir = 'asc'; query = '';

    q('pit-ugrid').style.display   = 'grid';
    q('pit-run').style.display     = 'block';
    q('pit-run').disabled          = true;
    q('pit-results').style.display = 'none';

    // Reset file zones
    ['pit-zone-act','pit-zone-pt'].forEach(id => {
      q(id).classList.remove('pit-loaded', 'pit-over');
    });
    ['pit-act-name','pit-pt-name'].forEach(id => { q(id).textContent = ''; });
    ['pit-file-act','pit-file-pt'].forEach(id => { q(id).value = ''; });
  });

  // ── Sort headers ──────────────────────────────────────────────────────────
  container.querySelectorAll('.pit-tbl th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortCol === col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortCol = col;
        sortDir = col === 'driver' ? 'asc' : 'asc';
      }
      renderTable();
    });
  });

  // ── Search ────────────────────────────────────────────────────────────────
  q('pit-search').addEventListener('input', e => {
    query = e.target.value.toLowerCase();
    renderTable();
  });

  // ── Export Excel ──────────────────────────────────────────────────────────
  q('pit-export').addEventListener('click', async () => {
    if (!auditData || !xlsxModule) return;
    const XLSX = xlsxModule;

    const { results, fuzzyMatches, missedDetails, dateRange } = auditData;
    const wb = XLSX.utils.book_new();

    // Sheet 1: Audit Results
    const summaryRows = results.map(r => ({
      'Driver':         r.driver,
      'Required':       r.required,
      'Completed':      r.completed,
      'Missed':         r.missed,
      'Completion %':   r.pct,
    }));
    const ws1 = XLSX.utils.json_to_sheet(summaryRows);
    ws1['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 11 }, { wch: 8 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Audit Results');

    // Sheet 2: Missing Inspections
    if (missedDetails.length) {
      const missedRows = missedDetails.map(m => ({
        'Driver': m.driver,
        'Date':   m.date,
        'Truck':  m.truck,
      }));
      const ws2 = XLSX.utils.json_to_sheet(missedRows);
      ws2['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 32 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Missing Inspections');
    }

    // Sheet 3: Fuzzy Matches
    if (fuzzyMatches.length) {
      const fuzzyRows = fuzzyMatches.map(f => ({
        'Dispatch Name':    f.dispatchName,
        'Inspection Name':  f.inspectionName,
        'Date':             f.date,
        'Truck':            f.truck,
        'Match Type':       f.matchType,
      }));
      const ws3 = XLSX.utils.json_to_sheet(fuzzyRows);
      ws3['!cols'] = [{ wch: 24 }, { wch: 24 }, { wch: 12 }, { wch: 32 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, ws3, 'Fuzzy Matches');
    }

    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const tag = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(blob),
      download: `pretrip-audit-${dateRange.min ?? 'report'}.xlsx`,
    });
    tag.click();
    URL.revokeObjectURL(tag.href);
  });

  // ── Render: summary cards ─────────────────────────────────────────────────
  function renderCards() {
    const { results, dateRange } = auditData;
    const totReq  = results.reduce((s, r) => s + r.required,  0);
    const totDone = results.reduce((s, r) => s + r.completed, 0);
    const totMiss = totReq - totDone;
    const fleetPct = totReq > 0 ? Math.round(totDone / totReq * 1000) / 10 : 100;
    const below80  = results.filter(r => r.pct < 80).length;
    const perfect  = results.filter(r => r.pct >= 100).length;

    q('pit-cards').innerHTML = `
      <div class="pit-card pit-card-hl">
        <div class="pit-card-lbl">Fleet Completion</div>
        <div class="pit-card-val">${fleetPct}%</div>
      </div>
      <div class="pit-card">
        <div class="pit-card-lbl">Required</div>
        <div class="pit-card-val">${totReq.toLocaleString()}</div>
      </div>
      <div class="pit-card">
        <div class="pit-card-lbl">Completed</div>
        <div class="pit-card-val">${totDone.toLocaleString()}</div>
      </div>
      <div class="pit-card">
        <div class="pit-card-lbl">Missed</div>
        <div class="pit-card-val">${totMiss.toLocaleString()}</div>
      </div>
      <div class="pit-card ${below80 > 0 ? 'pit-card-warn' : ''}">
        <div class="pit-card-lbl">Drivers&nbsp;&lt;&nbsp;80%</div>
        <div class="pit-card-val">${below80}</div>
      </div>
      <div class="pit-card ${perfect > 0 ? 'pit-card-good' : ''}">
        <div class="pit-card-lbl">Drivers at 100%</div>
        <div class="pit-card-val">${perfect}</div>
      </div>
    `;

    q('pit-dates').textContent = dateRange.min
      ? `${fmtDate(dateRange.min)} – ${fmtDate(dateRange.max)}`
      : '';
  }

  // ── Render: main results table ────────────────────────────────────────────
  function renderTable() {
    if (!auditData) return;

    // Update sort indicators
    container.querySelectorAll('.pit-tbl th[data-col]').forEach(th => {
      th.classList.toggle('pit-asc',  th.dataset.col === sortCol && sortDir === 'asc');
      th.classList.toggle('pit-desc', th.dataset.col === sortCol && sortDir === 'desc');
    });

    // Filter
    let rows = auditData.results.filter(r => {
      if (!query) return true;
      return r.driver.toLowerCase().includes(query);
    });

    // Sort
    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'driver') {
        cmp = a.driver.localeCompare(b.driver);
      } else {
        cmp = a[sortCol] - b[sortCol];
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    if (!rows.length) {
      q('pit-tbody').innerHTML =
        `<tr><td class="pit-empty" colspan="5">No results match your search.</td></tr>`;
      return;
    }

    q('pit-tbody').innerHTML = rows.map(r => {
      const fillColor = pctColor(r.pct);
      const fillPct   = Math.min(r.pct, 100);
      return `
        <tr class="${rowClass(r.pct)}">
          <td class="pit-driver">${esc(r.driver)}</td>
          <td class="pit-num">${r.required}</td>
          <td class="pit-num">${r.completed}</td>
          <td class="pit-num">${r.missed}</td>
          <td>
            <div class="pit-pct-cell">
              <div class="pit-bar">
                <div class="pit-bar-fill"
                     style="width:${fillPct}%;background:${fillColor}"></div>
              </div>
              <span class="pit-pct-lbl" style="color:${fillColor}">${r.pct}%</span>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  // ── Render: detail accordions ─────────────────────────────────────────────
  function renderDetails() {
    const { missedDetails, fuzzyMatches } = auditData;
    let html = '';

    // Missing inspections
    if (missedDetails.length) {
      const rows = missedDetails.map(m =>
        `<tr>
          <td>${esc(m.driver)}</td>
          <td>${esc(fmtDate(m.date))}</td>
          <td>${esc(m.truck)}</td>
        </tr>`
      ).join('');

      html += `
        <details class="pit-accord">
          <summary>
            <span>Missing Inspections (${missedDetails.length})</span>
          </summary>
          <div class="pit-accord-body">
            <table class="pit-sub-tbl">
              <thead>
                <tr><th>Driver</th><th>Date</th><th>Truck</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </details>`;
    }

    // Fuzzy matches
    if (fuzzyMatches.length) {
      const rows = fuzzyMatches.map(f =>
        `<tr>
          <td>${esc(f.dispatchName)}</td>
          <td>${esc(f.inspectionName)}</td>
          <td>${esc(fmtDate(f.date))}</td>
          <td>${esc(f.truck)}</td>
          <td>${esc(f.matchType)}</td>
        </tr>`
      ).join('');

      html += `
        <details class="pit-accord">
          <summary>
            <span>Fuzzy Matches Applied (${fuzzyMatches.length})</span>
          </summary>
          <div class="pit-accord-body">
            <p style="font-size:0.72rem;color:var(--on-surface-muted);margin:0 0 0.5rem">
              These inspections were matched using name or truck-label variations.
              Review to confirm they are correct.
            </p>
            <table class="pit-sub-tbl">
              <thead>
                <tr>
                  <th>Dispatch Name</th>
                  <th>Inspection Name</th>
                  <th>Date</th>
                  <th>Truck</th>
                  <th>Match Type</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </details>`;
    }

    q('pit-details').innerHTML = html;
  }

  return el;
}
