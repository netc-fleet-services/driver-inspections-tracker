// lib/engine.js — Pre-Trip Inspection Audit Engine
// Pure data processing — no DOM, no external imports.
// Pass the SheetJS library object (XLSX) to the parse* functions.

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

/** Lowercase + trim + collapse whitespace. */
export function normName(name) {
  if (name == null) return '';
  return String(name).toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Lowercase + trim, strip leading "#" and trailing "*", collapse spaces.
 * Keeps numbers intact so numeric ID overlap can be detected later.
 */
export function normTruck(truck) {
  if (truck == null) return '';
  return String(truck).toLowerCase().trim()
    .replace(/^[#\s]+/, '')
    .replace(/\*+$/, '')
    .replace(/\s+/g, ' ');
}

/**
 * Convert any date-like value → "YYYY-MM-DD" string.
 * Handles: JS Date objects, Excel serial numbers, ISO strings, locale strings.
 * Returns null for anything that can't be parsed.
 */
export function toDateStr(val) {
  if (val == null || val === '') return null;
  let d;
  if (val instanceof Date) {
    d = val;
  } else if (typeof val === 'number') {
    // Excel date serial (days since 1900-01-01, with the 1900 leap-year bug)
    d = new Date(Math.round((val - 25569) * 86400 * 1000));
  } else {
    d = new Date(val);
  }
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  if (y < 2000 || y > 2100) return null; // sanity guard
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format "YYYY-MM-DD" as "Apr 15, 2026". */
export function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[+m - 1]} ${+d}, ${y}`;
}

// ---------------------------------------------------------------------------
// Fuzzy match helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when two driver names are equivalent.
 *
 * Rules (applied in order):
 *  1. Exact normalised match.
 *  2. Same last name AND one first name starts with the other
 *     (handles Chris / Christopher, Mike / Michael, etc.).
 */
export function namesMatch(a, b) {
  const n1 = normName(a);
  const n2 = normName(b);
  if (!n1 || !n2) return false;
  if (n1 === n2) return true;

  const p1 = n1.split(' ');
  const p2 = n2.split(' ');
  if (p1.length < 2 || p2.length < 2) return false;

  // Last names must match
  if (p1[p1.length - 1] !== p2[p2.length - 1]) return false;

  // First names: one starts with the other
  const fn1 = p1[0], fn2 = p2[0];
  return fn1.startsWith(fn2) || fn2.startsWith(fn1);
}

/**
 * Returns true when two truck identifiers are equivalent.
 *
 * Rules:
 *  1. Exact normalised string match.
 *  2. Both strings share at least one significant numeric ID (3+ digits).
 *     e.g. "424 Peterbilt Quickswap" ↔ "Truck 424" → share "424".
 */
export function trucksMatch(a, b) {
  const t1 = normTruck(a);
  const t2 = normTruck(b);
  if (!t1 || !t2) return false;
  if (t1 === t2) return true;

  const nums1 = (a.match(/\d+/g) || []).filter(n => n.length >= 3);
  const nums2 = (b.match(/\d+/g) || []).filter(n => n.length >= 3);
  return nums1.length > 0 && nums2.length > 0 && nums1.some(n => nums2.includes(n));
}

// ---------------------------------------------------------------------------
// File parsers
// ---------------------------------------------------------------------------

/**
 * Parse the Driver Activity workbook (Towbook export).
 *
 * Looks for the "Detailed" sheet, finds the header row containing "Driver Name",
 * then extracts one required-inspection record per unique (driver, date, truck)
 * combination. All six driver columns (Driver Name + Driver2-6) are included.
 *
 * @param  {object} workbook  SheetJS workbook object
 * @param  {object} XLSX      SheetJS library ({ utils })
 * @returns {Array<{driver:string, date:string, truck:string}>}
 */
export function parseDriverActivity(workbook, XLSX) {
  const ws = workbook.Sheets['Detailed'];
  if (!ws) {
    throw new Error(
      '"Detailed" sheet not found. Make sure you uploaded the Driver Activity report (not the PreTrip file).'
    );
  }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // The first two rows are a company banner + timestamp; the real header is row 3
  const headerIdx = rows.findIndex(
    r => Array.isArray(r) && r[0] === 'Driver Name'
  );
  if (headerIdx < 0) {
    throw new Error(
      '"Driver Name" column not found in the Detailed sheet. Check that the correct file was uploaded.'
    );
  }

  // Column positions (0-indexed from the header row):
  // 0  Driver Name | 1  Driver2 | 2  Driver3 | 3  Driver4 | 4  Driver5 | 5  Driver6
  // 6  Company Name | 7  Call# | 8  Invoice# | 9  Reason | 10 Total | 11 Account
  // 12 PO# | 13 Truck | 14 Create Date | 15 Dispatch Time | 16 Enroute Time
  // 17 Arrival Time | 18 Tow Time | 19 Dest Arrival | 20 Completion Time ...

  const required = new Map(); // key → { driver, date, truck }

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;

    const truck = row[13];
    if (!truck) continue;

    // Use the first available operational date.
    // Create Date (col 14) can pre-date actual work by days/weeks in Towbook,
    // so we only fall back to it as a last resort.
    const date =
      toDateStr(row[16]) ||  // Enroute Time  ← preferred
      toDateStr(row[17]) ||  // Arrival Time
      toDateStr(row[15]) ||  // Dispatch Time
      toDateStr(row[20]) ||  // Completion Time
      toDateStr(row[14]);    // Create Date   ← last resort

    if (!date) continue;

    // Collect all drivers listed on this call
    const drivers = [row[0], row[1], row[2], row[3], row[4], row[5]]
      .map(d => (d == null ? '' : String(d).trim()))
      .filter(Boolean);

    for (const driver of drivers) {
      const key = `${normName(driver)}||${date}||${normTruck(truck)}`;
      if (!required.has(key)) {
        required.set(key, { driver, date, truck: String(truck).trim() });
      }
    }
  }

  return Array.from(required.values());
}

/**
 * Parse the PreTrip Inspections workbook (Towbook export).
 *
 * Looks for the "Export" sheet, finds the header row containing "Date" and
 * "Employee", then extracts one completion record per unique
 * (employee, date, truck) combination.
 *
 * @param  {object} workbook  SheetJS workbook object
 * @param  {object} XLSX      SheetJS library ({ utils })
 * @returns {Array<{employee:string, date:string, truck:string, passFail:string}>}
 */
export function parsePreTrip(workbook, XLSX) {
  const ws = workbook.Sheets['Export'];
  if (!ws) {
    throw new Error(
      '"Export" sheet not found. Make sure you uploaded the PreTrip Inspections report (not the Driver Activity file).'
    );
  }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Header row contains: Date | Truck | Odometer | Employee | Pass/Fail
  const headerIdx = rows.findIndex(
    r => Array.isArray(r) && r[0] === 'Date' && r[3] === 'Employee'
  );
  if (headerIdx < 0) {
    throw new Error(
      '"Date" / "Employee" columns not found in the Export sheet. Check that the correct file was uploaded.'
    );
  }

  const completions = new Map(); // key → { employee, date, truck, passFail }

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[3]) continue; // need an employee name

    const date = toDateStr(row[0]);
    if (!date) continue;

    const truck    = row[1] ? String(row[1]).trim() : '';
    const employee = String(row[3]).trim();
    const passFail = row[4] ? String(row[4]).trim() : '';

    const key = `${normName(employee)}||${date}||${normTruck(truck)}`;
    if (!completions.has(key)) {
      completions.set(key, { employee, date, truck, passFail });
    }
  }

  return Array.from(completions.values());
}

// ---------------------------------------------------------------------------
// Audit engine
// ---------------------------------------------------------------------------

/**
 * Match required inspections against completions, calculate per-driver metrics.
 *
 * Matching strategy (applied in order):
 *  1. Exact:       normName(driver) === normName(employee) AND same date AND normTruck match
 *  2. Fuzzy name:  namesMatch(driver, employee) AND same date AND same normalised truck
 *  3. Fuzzy truck: same driver (exact) AND same date AND trucksMatch(truck, inspectionTruck)
 *
 * @param  {Array} required    Output of parseDriverActivity()
 * @param  {Array} completions Output of parsePreTrip()
 * @returns {{
 *   results:       Array<{driver,required,completed,missed,pct}>,
 *   dateRange:     {min:string|null, max:string|null},
 *   fuzzyMatches:  Array<{dispatchName,inspectionName,date,truck,matchType}>,
 *   missedDetails: Array<{driver,date,truck}>
 * }}
 */
export function calculateAudit(required, completions) {
  // --- Build lookup structures ---

  // Exact key: normName(employee) || date || normTruck(truck)
  const exactKeys = new Set(
    completions.map(c => `${normName(c.employee)}||${c.date}||${normTruck(c.truck)}`)
  );

  // By date + normalised truck (for fuzzy-name lookup)
  const byDateTruck = new Map();
  for (const c of completions) {
    const k = `${c.date}||${normTruck(c.truck)}`;
    if (!byDateTruck.has(k)) byDateTruck.set(k, []);
    byDateTruck.get(k).push(c);
  }

  // By date only (for fuzzy-truck lookup)
  const byDate = new Map();
  for (const c of completions) {
    if (!byDate.has(c.date)) byDate.set(c.date, []);
    byDate.get(c.date).push(c);
  }

  // --- Process each required inspection ---

  const driverStats  = new Map(); // normName(driver) → { driver, required, completed }
  const fuzzyMatches  = [];
  const missedDetails = [];
  let minDate = null, maxDate = null;

  for (const req of required) {
    const dKey = normName(req.driver);
    if (!driverStats.has(dKey)) {
      driverStats.set(dKey, { driver: req.driver, required: 0, completed: 0 });
    }
    const stat = driverStats.get(dKey);
    stat.required++;

    if (!minDate || req.date < minDate) minDate = req.date;
    if (!maxDate || req.date > maxDate) maxDate = req.date;

    // 1. Exact match
    const exactKey = `${normName(req.driver)}||${req.date}||${normTruck(req.truck)}`;
    if (exactKeys.has(exactKey)) {
      stat.completed++;
      continue;
    }

    // 2. Fuzzy name match (same date + same truck, different name spelling)
    const sameDateTruck = byDateTruck.get(`${req.date}||${normTruck(req.truck)}`) || [];
    const fuzzyName = sameDateTruck.find(c => namesMatch(req.driver, c.employee));
    if (fuzzyName) {
      stat.completed++;
      fuzzyMatches.push({
        dispatchName:   req.driver,
        inspectionName: fuzzyName.employee,
        date:           req.date,
        truck:          req.truck,
        matchType:      'Name variation',
      });
      continue;
    }

    // 3. Fuzzy truck match (same driver name, same date, different truck label)
    const sameDate = byDate.get(req.date) || [];
    const fuzzyTruck = sameDate.find(
      c => normName(c.employee) === normName(req.driver) && trucksMatch(req.truck, c.truck)
    );
    if (fuzzyTruck) {
      stat.completed++;
      fuzzyMatches.push({
        dispatchName:   req.driver,
        inspectionName: fuzzyTruck.employee,
        date:           req.date,
        truck:          req.truck,
        matchType:      'Truck label variation',
      });
      continue;
    }

    // No match found
    missedDetails.push({ driver: req.driver, date: req.date, truck: req.truck });
  }

  // --- Build result rows ---

  const results = Array.from(driverStats.values()).map(s => ({
    driver:    s.driver,
    required:  s.required,
    completed: s.completed,
    missed:    s.required - s.completed,
    pct:       s.required > 0
      ? Math.round(s.completed / s.required * 1000) / 10
      : 100,
  }));

  // Default sort: worst completion % first, then alphabetically
  results.sort((a, b) => a.pct - b.pct || a.driver.localeCompare(b.driver));

  // Sort missed details chronologically
  missedDetails.sort((a, b) => a.date.localeCompare(b.date) || a.driver.localeCompare(b.driver));

  return {
    results,
    dateRange: { min: minDate, max: maxDate },
    fuzzyMatches,
    missedDetails,
  };
}
