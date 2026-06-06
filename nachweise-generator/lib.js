// Pure data layer for the Nachweise-Listen-Generator.
// No DOM access — usable both in the browser (window.NachweiseLib) and in
// Node tests (module.exports). See lib.test.mjs.
(function (root) {
    'use strict';

    // ---- Spalten der gemeinsamen Zieltabelle (DPSG-Formular) ----
    const COLS = [
        { key: 'idx', label: 'Lfd.\nNummer', group: '', w: 3.5, type: 'idx' },
        { key: 'name', label: 'Name', group: '', w: 8.5, type: 'text' },
        { key: 'vorname', label: 'Vorname', group: '', w: 8.6, type: 'text' },
        { key: 'auskunft', label: 'Auskunfts-\nerklärung\n(ja/nein)', group: 'Präventionsordnung', w: 5.4, type: 'jn' },
        { key: 'schulung', label: 'Präventions-\nschulung\n(Datum)', group: 'Präventionsordnung', w: 11.3, type: 'text' },
        { key: 'verpflichtung', label: 'Verpflichtungs-\nerklärung\n(ja/nein)', group: 'Präventionsordnung', w: 5.4, type: 'jn' },
        { key: 'efzAusstellung', label: 'Ausstellungs-\ndatum eFZ', group: 'Bundeskinderschutzgesetz', w: 9.8, type: 'text', fn: 2 },
        { key: 'efzEinsicht', label: 'Datum der\nEinsicht-\nnahme', group: 'Bundeskinderschutzgesetz', w: 9.8, type: 'text' },
        { key: 'efzDurch', label: 'Einsichtnahme\ndurch (Name)', group: 'Bundeskinderschutzgesetz', w: 16.3, type: 'text', fn: 3 },
        { key: 'verurteilung', label: 'Liegt eine\neinschlägige\nVerurteilung\nvor? (ja/nein)', group: 'Bundeskinderschutzgesetz', w: 10.0, type: 'jn', fn: 4 },
        { key: 'efzErneut', label: 'Wann erfolgt\nerneute\nEinsichtnahme?', group: 'Bundeskinderschutzgesetz', w: 11.5, type: 'text', fn: 1 },
    ];
    const FOOTNOTES = [
        'Spätestens nach 5 Jahren muss eine erneute Einsichtnahme erfolgen.',
        'Zwischen dem Datum der Ausstellung und dem Datum der Einsichtnahme dürfen nicht mehr als drei Monate liegen.',
        'Die Einsichtnahme kann durch den StaVo oder das Bundesamt erfolgen.',
        'Siehe Anlage 1 der Vereinbarung zum Ausschluss einschlägig vorbestrafter Personen.'
    ];
    const ROWS_PER_PAGE = 15;
    const TYPES = {
        auskunft: 'Auskunftserklärung',
        schulung: 'Präventionsschulung',
        verpflichtung: 'Selbstverpflichtungserklärung',
        efz: 'Erweitertes Führungszeugnis',
    };

    // ---------------- Helpers ----------------
    function escapeHtml(s) {
        return (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    // Be lenient about header naming variations.
    function field(row, name) {
        if (name in row) return row[name];
        const want = norm(name);
        for (const k in row) if (norm(k) === want) return row[k];
        return '';
    }
    function norm(s) {
        return (s || '').toString().normalize('NFC').toLowerCase().trim()
            .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
            .normalize('NFKD').replace(/[̀-ͯ]/g, '')   // strip any remaining accents
            .replace(/[^a-z0-9]+/g, '');
    }
    // Expand a 2-digit year. Pivot a bit past today (covers ~5-year eFZ re-check
    // dates) — beyond that a year is treated as 19xx (birthdates).
    function expandYear(y) {
        if (y.length !== 2) return y;
        const n = +y;
        const cutoff = (new Date().getFullYear() + 10) % 100;
        return String(n <= cutoff ? 2000 + n : 1900 + n);
    }
    // Format any recognisable date to DD.MM.YYYY. Returns '' if none found.
    function fmtDate(v) {
        if (!v) return '';
        v = v.toString().trim();
        let m = v.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);        // ISO 2026-05-26
        if (m) return `${m[3].padStart(2, '0')}.${m[2].padStart(2, '0')}.${m[1]}`;
        m = v.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/);   // DD.MM.YYYY or DD/MM/YYYY
        if (m) return `${m[1].padStart(2, '0')}.${m[2].padStart(2, '0')}.${expandYear(m[3])}`;
        return '';
    }
    // Normalise any recognisable date to ISO YYYY-MM-DD (for stable matching).
    function isoDate(v) {
        v = (v || '').toString().trim();
        let m = v.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
        m = v.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/);   // DD.MM.YYYY or DD/MM/YYYY
        if (m) return `${expandYear(m[3])}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        return v;
    }
    // Add n years to a date, keeping DD.MM.YYYY output. '' if unparseable.
    function addYears(v, n) {
        const d = fmtDate(v);
        if (!d) return '';
        const [dd, mm, yy] = d.split('.');
        return `${dd}.${mm}.${+yy + n}`;
    }
    // Sortable YYYYMMDD integer for a date (0 if none).
    function dateSortKey(v) {
        const d = fmtDate(v);
        if (!d) return 0;
        const [dd, mm, yy] = d.split('.');
        return +`${yy}${mm}${dd}`;
    }
    // First non-empty formatted date among the given fields.
    function firstDate(row, names) {
        for (const n of names) { const d = fmtDate(field(row, n)); if (d) return d; }
        return '';
    }
    // A proof counts as present/valid if the status or any validity date says so.
    function hasValidProof(row) {
        const status = (field(row, 'Status der Person') || '').toLowerCase();
        if (/^g(ü|ue)ltig/.test(status) || status.includes('gültig bis') || status.includes('gueltig')) return true;
        if (firstDate(row, ['Gültig bis', 'Gültig ab', 'Ausgestellt am', 'Eingesehen am'])) return true;
        return false;
    }
    function keyParts(nachname, vorname, geb) {
        return [norm(nachname), norm(vorname), isoDate(geb)].join('|');
    }
    function personKey(row) {
        return keyParts(field(row, 'Nachname'), field(row, 'Vorname'), field(row, 'Geburtsdatum'));
    }

    function guessType(filename) {
        const n = (filename || '').toLowerCase();
        if (/verpflicht/.test(n)) return 'verpflichtung';
        if (/auskunft/.test(n)) return 'auskunft';
        if (/schulung|prae?vention|prävention/.test(n)) return 'schulung';
        if (/f(ue|ü)hrungszeugnis|efz|sachbescheinigung|^otd|_otd|\botd_/.test(n)) return 'efz';
        return '';
    }

    // ---------------- CSV / Excel parsing ----------------
    function parseCSV(text) {
        text = text.replace(/^﻿/, '');               // strip BOM
        const delim = detectDelimiter(text);
        return rowsFromRecords(tokenize(text, delim));
    }

    // XLSXlib defaults to the global XLSX (browser CDN); tests pass it in.
    function parseXLSX(arrayBuffer, XLSXlib) {
        const X = XLSXlib || (typeof XLSX !== 'undefined' ? XLSX : (root && root.XLSX));
        if (!X) throw new Error('Excel-Bibliothek nicht geladen (offline?).');
        const wb = X.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: true });
        let best = [];
        for (const name of wb.SheetNames) {
            const records = X.utils.sheet_to_json(wb.Sheets[name],
                { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' })
                .map(r => r.map(c => (c == null ? '' : String(c))));
            const rows = rowsFromRecords(records);
            if (rows.length >= best.length) best = rows;
        }
        return best;
    }

    function detectDelimiter(text) {
        const firstLine = text.split(/\r?\n/)[0] || '';
        const counts = { ',': 0, ';': 0, '\t': 0 };
        let q = false;
        for (const ch of firstLine) {
            if (ch === '"') q = !q;
            else if (!q && ch in counts) counts[ch]++;
        }
        return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ',';
    }

    // RFC-4180-ish tokenizer that respects quoted fields incl. newlines.
    function tokenize(text, delim) {
        const records = [];
        let row = [], field = '', inQ = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (inQ) {
                if (c === '"') {
                    if (text[i + 1] === '"') { field += '"'; i++; }
                    else inQ = false;
                } else field += c;
            } else {
                if (c === '"') inQ = true;
                else if (c === delim) { row.push(field); field = ''; }
                else if (c === '\n') { row.push(field); records.push(row); row = []; field = ''; }
                else if (c === '\r') { /* ignore, handled by \n */ }
                else field += c;
            }
        }
        if (field !== '' || row.length) { row.push(field); records.push(row); }
        return records;
    }

    // Turn a 2-D records array (header + data, possibly preceded by metadata rows)
    // into row objects. Recognises the DPSG-OTD Sachbescheinigungs-Export (eFZ)
    // and normalises it onto the canonical column names.
    function rowsFromRecords(records) {
        if (!records || !records.length) return [];
        // Header = first row that contains a Nachname/Vorname-ish cell.
        let hi = 0;
        for (let i = 0; i < records.length; i++) {
            if (records[i].some(c => ['nachname', 'vorname'].includes(norm(c)))) { hi = i; break; }
        }
        const header = records[hi].map(h => (h ?? '').toString().trim());
        const nameCol = header.findIndex(h => norm(h) === 'nachname');
        const isOtd = header.some(h => {
            const n = norm(h);
            return n.includes('fuehrungszeugnis') || n.includes('sachbescheinigung');
        });
        const out = [];
        for (let i = hi + 1; i < records.length; i++) {
            const rec = records[i];
            if (!rec || rec.every(c => (c == null || c.toString().trim() === ''))) continue;
            // Skip repeated header rows (the OTD export repeats them per block).
            if (nameCol >= 0 && norm(rec[nameCol]) === 'nachname') continue;
            const obj = {};
            header.forEach((h, j) => { obj[h] = (rec[j] ?? '').toString().trim(); });
            // Skip soft-deleted records (OTD has a "deleted" flag).
            if (/^(true|wahr|1|ja|x)$/i.test((obj['deleted'] || obj['Deleted'] || '').toString().trim())) continue;
            out.push(isOtd ? remapOtd(obj) : obj);
        }
        if (isOtd) out.__otd = true;
        return out;
    }

    // Map an OTD Sachbescheinigungs-Zeile to the canonical eFZ fields.
    function remapOtd(o) {
        const ein = o['erstelltAmFormatiert'] || o['erstelltAm'] || '';   // Datum der Einsichtnahme
        const autor = (o['autor_mgl_id'] || '').toString().trim();
        return {
            'Mitgliedsnummer': o['Mitgliedsnummer'] || '',
            'Nachname': o['Nachname'] || '',
            'Vorname': o['Vorname'] || '',
            'Geburtsdatum': isoDate(o['Geburtsdatum'] || ''),
            'Ausgestellt am': o['fzDatumFormatiert'] || o['Führungszeugnis_Dat'] || '',
            'Eingesehen am': ein,
            'Eingesehen durch': 'Bundesbüro' + (autor ? ` (${autor})` : ''),
            'Gültig bis': addYears(ein, 5),   // Wiedervorlage: spätestens nach 5 Jahren
            'Status der Person': ''
        };
    }

    // The eFZ export may hold several rows per person. Collapse them by
    // Mitgliedsnummer (the stable identity). Some exports repeat a person on two
    // rows where only one carries the Mitgliedsnummer (merged cells / repeated
    // header blocks), so a numberless row is grouped with its numbered twin via
    // name+birthdate. Falls back to ID / name+birthdate when no number exists at
    // all. The newest row leads; each field is filled from the newest row that
    // actually has a value.
    function dedupeEfz(rows) {
        const keyToNr = new Map();
        for (const r of rows) {
            const nr = (field(r, 'Mitgliedsnummer') || '').toString().trim();
            if (nr) { const pk = personKey(r); if (!keyToNr.has(pk)) keyToNr.set(pk, nr); }
        }
        function groupId(r) {
            const nr = (field(r, 'Mitgliedsnummer') || '').toString().trim();
            if (nr) return 'nr:' + nr;
            const pk = personKey(r);
            if (keyToNr.has(pk)) return 'nr:' + keyToNr.get(pk);   // numberless twin
            const id = (field(r, 'ID') || '').toString().trim();
            return id ? 'id:' + id : 'pk:' + pk;
        }
        const groups = new Map();
        for (const r of rows) {
            const id = groupId(r);
            if (!groups.has(id)) groups.set(id, []);
            groups.get(id).push(r);
        }
        const FIELDS = ['Nachname', 'Vorname', 'Geburtsdatum', 'Mitgliedsnummer', 'ID',
            'Ausgestellt am', 'Eingesehen am', 'Eingesehen durch', 'Gültig bis', 'Fälligkeit', 'Status der Person'];
        const out = [];
        for (const list of groups.values()) {
            list.sort((a, b) => dateSortKey(field(b, 'Eingesehen am') || field(b, 'Ausgestellt am'))
                              - dateSortKey(field(a, 'Eingesehen am') || field(a, 'Ausgestellt am')));
            const merged = {};
            for (const f of FIELDS) {
                merged[f] = '';
                for (const r of list) { const v = field(r, f); if (v) { merged[f] = v; break; } }
            }
            out.push(merged);
        }
        return out;
    }

    // ---------------- Merge ----------------
    // files: [{ type, rows }]. Returns { model, stats, debug }.
    function buildModel(files) {
        const byType = {};
        (files || []).forEach(f => { if (f.type) (byType[f.type] = byType[f.type] || []).push(...f.rows); });

        const persons = new Map();
        function ensure(row) {
            const key = personKey(row);
            if (!persons.has(key)) {
                persons.set(key, {
                    name: field(row, 'Nachname'), vorname: field(row, 'Vorname'),
                    geb: field(row, 'Geburtsdatum'),
                    auskunft: '', schulung: '', verpflichtung: '',
                    efzAusstellung: '', efzEinsicht: '', efzDurch: '', verurteilung: 'nein', efzErneut: ''
                });
            }
            return persons.get(key);
        }
        // Names can differ between the eFZ (Bundesamt) and the CSV (diözesan)
        // systems. The birthdate is the stable identifier, so match an eFZ row to an
        // existing person when the birthdate matches AND at least one name part
        // matches — covering marriage/name changes and typos, while a pure
        // same-birthday coincidence (no shared name) stays separate.
        function findExisting(row) {
            const key = personKey(row);
            if (persons.has(key)) return persons.get(key);
            const dob = isoDate(field(row, 'Geburtsdatum'));
            if (!dob) return null;
            const nn = norm(field(row, 'Nachname'));
            const vn = norm(field(row, 'Vorname'));
            const cand = [];
            for (const p of persons.values()) {
                if (isoDate(p.geb) === dob && ((nn && norm(p.name) === nn) || (vn && norm(p.vorname) === vn))) cand.push(p);
            }
            return cand.length === 1 ? cand[0] : null;
        }

        (byType.auskunft || []).forEach(r => { ensure(r).auskunft = hasValidProof(r) ? 'ja' : 'nein'; });
        (byType.verpflichtung || []).forEach(r => { ensure(r).verpflichtung = hasValidProof(r) ? 'ja' : 'nein'; });
        (byType.schulung || []).forEach(r => {
            ensure(r).schulung = firstDate(r, ['Ausgestellt am', 'Gültig ab', 'Eingesehen am']);
        });

        // Snapshot the people known from the CSV sources (for the debug view).
        const csvPersons = Array.from(persons.values()).map(p => ({
            name: p.name, vorname: p.vorname, gebRaw: p.geb, gebIso: isoDate(p.geb),
            key: keyParts(p.name, p.vorname, p.geb)
        }));

        const efzDebug = [];
        let efzMatched = 0, efzNew = 0;
        dedupeEfz(byType.efz || []).forEach(r => {
            const existing = findExisting(r);
            const matched = !!existing;
            if (matched) efzMatched++; else efzNew++;
            const p = existing || ensure(r);
            p.efzAusstellung = fmtDate(field(r, 'Ausgestellt am'));
            p.efzEinsicht = fmtDate(field(r, 'Eingesehen am'));
            p.efzDurch = field(r, 'Eingesehen durch');
            p.efzErneut = firstDate(r, ['Gültig bis', 'Fälligkeit']);
            efzDebug.push({
                nachname: field(r, 'Nachname'), vorname: field(r, 'Vorname'),
                mitgliedsnummer: field(r, 'Mitgliedsnummer'),
                gebRaw: field(r, 'Geburtsdatum'), gebIso: isoDate(field(r, 'Geburtsdatum')),
                key: personKey(r), matched, matchedTo: matched ? `${existing.name}, ${existing.vorname}` : ''
            });
        });

        const model = Array.from(persons.values()).sort((a, b) =>
            (a.name || '').localeCompare(b.name || '', 'de') ||
            (a.vorname || '').localeCompare(b.vorname || '', 'de'));

        return {
            model,
            stats: { efzMatched, efzNew, types: Object.keys(byType) },
            debug: { csvPersons, efz: efzDebug }
        };
    }

    const api = {
        COLS, FOOTNOTES, TYPES, ROWS_PER_PAGE,
        escapeHtml, field, norm, expandYear, fmtDate, isoDate, addYears, dateSortKey,
        firstDate, hasValidProof, keyParts, personKey, guessType,
        parseCSV, parseXLSX, detectDelimiter, tokenize, rowsFromRecords, remapOtd,
        dedupeEfz, buildModel
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.NachweiseLib = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
