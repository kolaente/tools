// Tests for the Nachweise-Listen-Generator data layer.
// Run from this folder with:  node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import lib from './lib.js';

const {
    norm, fmtDate, isoDate, expandYear, detectDelimiter, parseCSV,
    rowsFromRecords, dedupeEfz, personKey, guessType, buildModel
} = lib;

test('norm unifies umlaut encodings', () => {
    const a = norm('Müller');            // precomposed ü
    const b = norm('Müller');      // u + combining diaeresis
    const c = norm('Mueller');           // spelled out
    assert.equal(a, 'mueller');
    assert.equal(a, b);
    assert.equal(a, c);
    assert.equal(norm('Weiß'), 'weiss');
    assert.equal(norm('  Schmidt-Meyer '), 'schmidtmeyer');
});

test('expandYear pivots: birthdates 19xx, near-future 20xx', () => {
    assert.equal(expandYear('99'), '1999');
    assert.equal(expandYear('05'), '2005');
    assert.equal(expandYear('28'), '2028');   // future eFZ re-check date
    assert.equal(expandYear('2019'), '2019'); // 4-digit untouched
});

test('isoDate normalises every date shape to the same key', () => {
    assert.equal(isoDate('17.05.99'), '1999-05-17');
    assert.equal(isoDate('17.05.99 00:00'), '1999-05-17');  // eFZ Excel form
    assert.equal(isoDate('1999-05-17'), '1999-05-17');
    assert.equal(isoDate('17/05/1999'), '1999-05-17');
    assert.equal(isoDate('7.5.99'), '1999-05-07');
});

test('fmtDate outputs DD.MM.YYYY and keeps future years', () => {
    assert.equal(fmtDate('17.05.99'), '17.05.1999');
    assert.equal(fmtDate('1999-05-17'), '17.05.1999');
    assert.equal(fmtDate('20.06.28'), '20.06.2028');
    assert.equal(fmtDate('07.8.2019'), '07.08.2019');
});

test('detectDelimiter and parseCSV handle ; and ,', () => {
    assert.equal(detectDelimiter('a;b;c\n1;2;3'), ';');
    assert.equal(detectDelimiter('a,b,c\n1,2,3'), ',');
    const rows = parseCSV('Nachname;Vorname;Geburtsdatum\nMeier;Anna;17.05.99\n\n');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].Nachname, 'Meier');
    assert.equal(rows[0].Geburtsdatum, '17.05.99');
});

test('guessType maps filenames (incl. OTD eFZ export)', () => {
    assert.equal(guessType('Auskunftserklaerung.csv'), 'auskunft');
    assert.equal(guessType('Selbstverpflichtungserklaerung.csv'), 'verpflichtung');
    assert.equal(guessType('Praeventionsschulung.csv'), 'schulung');
    assert.equal(guessType('Erweitertes_Fuehrungszeugnis.csv'), 'efz');
    assert.equal(guessType('otd_20260606_1356.xlsx'), 'efz');
});

test('rowsFromRecords parses the OTD layout (metadata + repeated header + deleted)', () => {
    const header = ['SachbescheinigungID', 'deleted', 'GruppierungsID', 'GruppierungsNummer', '',
        'GruppierungName', 'Mitgliedsnummer', '', 'Vorname', 'Nachname', 'Geburtsdatum',
        'erstelltAm', 'erstelltAmFormatiert', 'Führungszeugnis_Dat', 'fzDatumFormatiert',
        'Identifikationsnumme', 'autor_mgl_id', 'empfaenger_mgl_id'];
    const sara = ['7002', 'false', '330303', '003', '', 'Grp', '42463', '', 'Sara', 'Schulz',
        '17.05.99 00:00', '', '07.8.2019', '', '05.6.2019', '0', '32000', '41574'];
    const deleted = ['9724', 'true', '330303', '003', '', 'Grp', '99', '', 'Tom', 'Test',
        '01.01.90 00:00', '', '01.02.2020', '', '01.01.2020', '0', '111', '222'];
    const records = [
        ['Aufgerufen für Gruppierung:', 'Lübeck: 003'],
        [],
        ['Ausführendes Mitglied:', 'Konrad Langenberg (298482)'],
        header, sara, header /* repeated */, deleted,
    ];
    const rows = rowsFromRecords(records);
    assert.equal(rows.__otd, true);
    assert.equal(rows.length, 1, 'repeated header and deleted row are skipped');
    const r = rows[0];
    assert.equal(r.Nachname, 'Schulz');
    assert.equal(r.Vorname, 'Sara');
    assert.equal(r.Geburtsdatum, '1999-05-17');
    assert.equal(r['Ausgestellt am'], '05.6.2019');       // fzDatumFormatiert
    assert.equal(r['Eingesehen am'], '07.8.2019');         // erstelltAmFormatiert
    assert.equal(r['Eingesehen durch'], 'Bundesbüro (32000)');
});

test('dedupeEfz keeps newest per Mitgliedsnummer, fills blanks from older rows', () => {
    const rows = [
        { Mitgliedsnummer: '5', Nachname: 'Klein', Vorname: 'Uta', Geburtsdatum: '1992-02-02',
          'Ausgestellt am': '', 'Eingesehen am': '10.05.2026', 'Eingesehen durch': 'Bundesbüro (1)', 'Gültig bis': '' },
        { Mitgliedsnummer: '5', Nachname: 'Klein', Vorname: 'Uta', Geburtsdatum: '1992-02-02',
          'Ausgestellt am': '01.03.2021', 'Eingesehen am': '20.03.2021', 'Eingesehen durch': 'Bundesbüro (2)', 'Gültig bis': '20.03.2026' },
    ];
    const out = dedupeEfz(rows);
    assert.equal(out.length, 1);
    assert.equal(out[0]['Eingesehen am'], '10.05.2026');        // newest leads
    assert.equal(out[0]['Eingesehen durch'], 'Bundesbüro (1)');
    assert.equal(out[0]['Ausgestellt am'], '01.03.2021');       // filled from older
    assert.equal(out[0]['Gültig bis'], '20.03.2026');
});

test('buildModel: the real-world case — 2-digit CSV date + eFZ time-suffix + changed surname → merges', () => {
    const auskunft = parseCSV('Nachname;Vorname;Geburtsdatum;Gültig ab;Status der Person\nNeumann;Sara;17.05.99;2024-01-01;Gültig');
    const efz = [{
        Mitgliedsnummer: '42463', Nachname: 'Schulz', Vorname: 'Sara', Geburtsdatum: '17.05.99 00:00',
        'Ausgestellt am': '05.6.2019', 'Eingesehen am': '07.8.2019', 'Eingesehen durch': 'Bundesbüro (32000)', 'Gültig bis': '07.8.2024'
    }];
    const { model, stats } = buildModel([
        { type: 'auskunft', rows: auskunft },
        { type: 'efz', rows: efz },
    ]);
    assert.equal(model.length, 1, 'same person, not duplicated');
    assert.equal(stats.efzMatched, 1);
    assert.equal(stats.efzNew, 0);
    const p = model[0];
    assert.equal(p.name, 'Neumann');          // CSV (current) name kept
    assert.equal(p.auskunft, 'ja');
    assert.equal(p.efzEinsicht, '07.08.2019');
    assert.equal(p.efzDurch, 'Bundesbüro (32000)');
    assert.equal(p.verurteilung, 'nein');     // always pre-set
});

test('buildModel: same birthday but no shared name part stays separate', () => {
    const auskunft = parseCSV('Nachname;Vorname;Geburtsdatum;Status der Person\nBerg;Tom;07.07.90;Gültig');
    const efz = [{
        Mitgliedsnummer: '1', Nachname: 'Wolf', Vorname: 'Karl', Geburtsdatum: '07.07.90',
        'Ausgestellt am': '02.02.2021', 'Eingesehen am': '12.02.2021', 'Eingesehen durch': 'Bundesbüro (9)'
    }];
    const { model, stats } = buildModel([
        { type: 'auskunft', rows: auskunft },
        { type: 'efz', rows: efz },
    ]);
    assert.equal(model.length, 2);
    assert.equal(stats.efzMatched, 0);
    assert.equal(stats.efzNew, 1);
});

test('buildModel: fuzzy match works for changed first name (same surname + birthdate)', () => {
    const schulung = parseCSV('Nachname;Vorname;Geburtsdatum;Ausgestellt am\nKlar;Mia;08.08.88;2022-01-01');
    const efz = [{
        Mitgliedsnummer: '2', Nachname: 'Klar', Vorname: 'Miriam', Geburtsdatum: '08.08.88',
        'Ausgestellt am': '01.01.2022', 'Eingesehen am': '10.01.2022', 'Eingesehen durch': 'Bundesbüro (11)'
    }];
    const { model, stats } = buildModel([
        { type: 'schulung', rows: schulung },
        { type: 'efz', rows: efz },
    ]);
    assert.equal(model.length, 1);
    assert.equal(stats.efzMatched, 1);
    assert.equal(model[0].vorname, 'Mia');             // CSV name kept
    assert.equal(model[0].efzDurch, 'Bundesbüro (11)');
});

test('personKey is identical across date formats and umlaut spellings', () => {
    assert.equal(
        personKey({ Nachname: 'Müller', Vorname: 'Sara', Geburtsdatum: '17.05.99' }),
        personKey({ Nachname: 'Mueller', Vorname: 'Sara', Geburtsdatum: '1999-05-17' })
    );
});
