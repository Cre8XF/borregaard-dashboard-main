#!/usr/bin/env python3
"""
generate_masterV2.py — Genererer Borregaard_SA_Master_v2.xlsx  (FASE 7.2)

Kildefiler (alle i samme mappe som dette scriptet):
  1. SA-Nummer.xlsx             — SA-numre, Tools-artikkelnummer, Lokasjon_SA
  2. Master_Artikkelstatus.xlsx — lagerstatus, kalkylpris, Artikelstatus
  3. Analyse_Lagerplan.xlsx     — BP, EOK, Maxlager, leverandørnummer
  4. data_7.xlsx                — VareStatus, ErsattsAvArtNr (primær), Alternativ(er)
  5. Master.xlsx                — ErsattsAvArtNr (fallback), InvDat (sist telt)
  6. leverandører.xlsx          — LevLedTid, Transportdagar (nøkkel: Företagsnr)

Output:
  Borregaard_SA_Master_v2.xlsx  — 31 kolonner, ark "SA-Oversikt"
"""

import os
import openpyxl
from openpyxl import Workbook

SCRIPT_DIR       = os.path.dirname(os.path.abspath(__file__))

SA_FILE          = os.path.join(SCRIPT_DIR, 'SA-Nummer.xlsx')
MASTER_FILE      = os.path.join(SCRIPT_DIR, 'Master_Artikkelstatus.xlsx')
MASTER_FULL_FILE = os.path.join(SCRIPT_DIR, 'Master.xlsx')
DATA7_FILE       = os.path.join(SCRIPT_DIR, 'data_7.xlsx')
LAGERPLAN_FILE   = os.path.join(SCRIPT_DIR, 'Analyse_Lagerplan.xlsx')
LEVERANDOR_FILE  = os.path.join(SCRIPT_DIR, 'leverandører.xlsx')
OUTPUT_FILE      = os.path.join(SCRIPT_DIR, 'Borregaard_SA_Master_v2.xlsx')


# ── Hjelpefunksjoner ──────────────────────────────────────────────────────────

def read_sheet(filepath, sheet_name=None):
    """Les ark til liste av dict {kolonnenavn: verdi}. Duplikate kolonnenavn får suffiks _2, _3 osv."""
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    ws = wb.active if sheet_name is None else wb[sheet_name]
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    if not rows:
        return []
    headers = list(rows[0])
    data = []
    for raw_row in rows[1:]:
        if all(v is None for v in raw_row):
            continue
        d = {}
        seen = {}
        for i, h in enumerate(headers):
            if h is None:
                continue
            key = str(h).strip()
            if key in seen:
                seen[key] += 1
                key = f"{key}_{seen[key]}"
            else:
                seen[key] = 1
            d[key] = raw_row[i] if i < len(raw_row) else None
        data.append(d)
    return data


def read_sheet_raw_indexed(filepath):
    """Les ark til liste av lister (rå indeksbasert), for kolonner uten overskrift."""
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    ws = wb.active
    rows_raw = list(ws.iter_rows(values_only=True))
    wb.close()
    if len(rows_raw) < 2:
        return [], []
    headers = [str(h).strip() if h is not None else '' for h in rows_raw[0]]
    data = [list(r) for r in rows_raw[1:] if not all(v is None for v in r)]
    return headers, data


def val(d, *keys, default=''):
    """Hent første ikke-tomme verdi fra dict d for en av keys."""
    for k in keys:
        v = d.get(k)
        if v is not None and str(v).strip() != '':
            return v
    return default


def format_invdat(raw):
    """Konverter InvDat (int eller str YYYYMMDD) til streng 'YYYYMMDD' for sortering."""
    if raw is None:
        return ''
    s = str(raw).strip().replace('-', '')
    if len(s) == 8 and s.isdigit():
        return s   # returner som YYYYMMDD — dashboardet formaterer til DD.MM.YYYY
    return ''


# ── Hovedlogikk ───────────────────────────────────────────────────────────────

def main():
    print('=' * 55)
    print('Genererer Borregaard_SA_Master_v2.xlsx  (FASE 7.2)')
    print('=' * 55)

    # ── 1. SA-Nummer.xlsx ──
    print('Leser SA-Nummer.xlsx...')
    sa_rows = read_sheet(SA_FILE)
    print(f'  {len(sa_rows)} rader')

    sa_headers, sa_raw_data = read_sheet_raw_indexed(SA_FILE)

    sa_nr_idx = next(
        (i for i, h in enumerate(sa_headers)
         if h.lower() in ('kunds artikkelnummer', 'kundens artnr', 'sa-nummer', 'sa nummer', 'sa_nummer')),
        0
    )
    kundens_artbeskr_idx = next(
        (i for i, h in enumerate(sa_headers) if h.lower() == 'kundens artbeskr.'),
        None
    )

    sa_lokasjon_map = {}           # SA-nr → Lokasjon (kolonne 6 i SA-Nummer.xlsx)
    sa_kundens_artbeskr_map = {}   # SA-nr → Kundens artbeskr. (fallback for lokasjon)

    for raw_row in sa_raw_data:
        if len(raw_row) <= sa_nr_idx:
            continue
        sa_key = str(raw_row[sa_nr_idx]).strip() if raw_row[sa_nr_idx] is not None else ''
        if not sa_key:
            continue
        if len(raw_row) > 6 and raw_row[6] is not None:
            col6 = str(raw_row[6]).strip()
            if col6:
                sa_lokasjon_map[sa_key] = col6
        if kundens_artbeskr_idx is not None and len(raw_row) > kundens_artbeskr_idx:
            kb = raw_row[kundens_artbeskr_idx]
            if kb is not None:
                kb_str = str(kb).strip()
                if kb_str:
                    sa_kundens_artbeskr_map[sa_key] = kb_str

    # ── 2. Master_Artikkelstatus.xlsx ──
    print('Leser Master_Artikkelstatus.xlsx...')
    master_rows = read_sheet(MASTER_FILE)
    print(f'  {len(master_rows)} rader')

    # ── 3. Analyse_Lagerplan.xlsx ──
    print('Leser Analyse_Lagerplan.xlsx...')
    lagerplan_rows = read_sheet(LAGERPLAN_FILE)
    print(f'  {len(lagerplan_rows)} rader')

    master_by_art = {str(val(r, 'Artikelnr')).strip(): r for r in master_rows if val(r, 'Artikelnr')}
    lagerplan_by_art = {str(val(r, 'Artikelnr')).strip(): r for r in lagerplan_rows if val(r, 'Artikelnr')}
    print(f'  Master-oppslag: {len(master_by_art)} | Lagerplan-oppslag: {len(lagerplan_by_art)}')

    # ── 4a. data_7.xlsx — primærkilde for ErsattsAvArtNr og VareStatus ──
    print('Leser data_7.xlsx (ErsattsAvArtNr primær + VareStatus)...')
    data7_rows = read_sheet(DATA7_FILE)
    print(f'  {len(data7_rows)} rader')

    erstatning_by_art = {}   # Tools-ArtNr → erstatningsartikkel
    varestatus_by_art = {}   # Tools-ArtNr → VareStatus

    for row in data7_rows:
        art  = val(row, 'VareNr')
        erst = val(row, 'ErsattsAvArtNr')
        alt  = val(row, 'Alternativ(er)')
        vs   = val(row, 'VareStatus', 'Varestatus')
        if not art:
            continue
        art_key = str(art).strip()
        # Erstatning: ErsattsAvArtNr først, Alternativ(er) som fallback
        best = str(erst).strip() if erst and str(erst).strip() not in ('0', '') else ''
        if not best:
            best = str(alt).strip() if alt and str(alt).strip() not in ('0', '') else ''
        if best and art_key not in erstatning_by_art:
            erstatning_by_art[art_key] = best
        if vs and art_key not in varestatus_by_art:
            varestatus_by_art[art_key] = str(vs).strip()

    print(f'  data_7 erstatnings-oppslag: {len(erstatning_by_art)} artikler')
    print(f'  data_7 VareStatus-oppslag:  {len(varestatus_by_art)} artikler')

    # ── 4b. Master.xlsx — fallback ErsattsAvArtNr + InvDat ──
    print('Leser Master.xlsx (ErsattsAvArtNr fallback + InvDat)...')
    master_full_rows = read_sheet(MASTER_FULL_FILE)
    print(f'  {len(master_full_rows)} rader')

    invdat_by_art = {}
    master_fallback_count = 0

    for row in master_full_rows:
        art    = val(row, 'Artikelnr')
        erst   = val(row, 'Ersätts av artikel')
        invdat = row.get('InvDat')
        if not art:
            continue
        art_key = str(art).strip()
        # ErsattsAvArtNr fallback — kun om data_7 ikke allerede har den
        if erst and str(erst).strip() not in ('0', '') and art_key not in erstatning_by_art:
            erstatning_by_art[art_key] = str(erst).strip()
            master_fallback_count += 1
        # InvDat — alltid fra Master.xlsx
        formatted = format_invdat(invdat)
        if formatted:
            invdat_by_art[art_key] = formatted

    print(f'  Master fallback la til: {master_fallback_count} ekstra erstatninger')
    print(f'  Totalt erstatnings-oppslag: {len(erstatning_by_art)} artikler')
    print(f'  InvDat-oppslag: {len(invdat_by_art)} artikler')

    # ── 5. leverandører.xlsx — nøkkel Företagsnr ──
    # NB: Lagerplan.Leverantör inneholder Företagsnr (nummer), ikke Företagsnamn
    print('Leser leverandører.xlsx...')
    lev_rows = read_sheet(LEVERANDOR_FILE)
    print(f'  {len(lev_rows)} rader')

    lev_ledtid_map = {}   # Företagsnr (str) → (LevLedTid, Transportdagar)

    for row in lev_rows:
        nr = val(row, 'Företagsnr')
        if not nr:
            continue
        key = str(nr).strip()
        ledtid    = val(row, 'LevLedTid',     default=None)
        transport = val(row, 'Transportdagar', default=None)
        if key not in lev_ledtid_map:
            try:
                lev_val = int(float(str(ledtid).replace(',', '.')))    if ledtid    not in (None, '') else 0
                tra_val = int(float(str(transport).replace(',', '.'))) if transport not in (None, '') else 0
            except (ValueError, TypeError):
                lev_val, tra_val = 0, 0
            lev_ledtid_map[key] = (lev_val, tra_val)

    print(f'  Ledetid-oppslag bygget: {len(lev_ledtid_map)} leverandører (nøkkel: Företagsnr)')

    # ── Kolonner i output ──
    output_columns = [
        'SA_Nummer', 'Tools_ArtNr', 'Beskrivelse',
        'Lagersaldo', 'DispLagSaldo', 'BP', 'Maxlager', 'ReservAnt', 'BestAntLev',
        'R12 Del Qty', 'Artikelstatus', 'Supplier Name', 'Lagerhylla',
        'VareStatus', 'ErsattsAvArtNr',
        'LAGERFØRT', 'VAREMERKE', 'PakkeStørrelse', 'Enhet / Ant Des',
        'Item category 1', 'Item category 2', 'Item category 3',
        'Ordre_TotAntall', 'Ordre_SisteDato', 'Dagens_Pris',
        'Kalkylpris_bas', 'EOK', 'Lokasjon_SA',
        'LevLedTid', 'Transportdagar',
        'InvDat',
    ]

    # ── Generer output-rader ──
    output_rows = []
    matched = 0
    skipped = 0

    for sa_row in sa_rows:
        sa_nr = val(sa_row, 'Kunds artikkelnummer', 'Kunds artikelnummer')
        if not sa_nr:
            skipped += 1
            continue

        sa_nr         = str(sa_nr).strip()
        tools_art     = val(sa_row, 'Artikelnr')
        tools_art_key = str(tools_art).strip() if tools_art else ''

        m = master_by_art.get(tools_art_key, {})
        l = lagerplan_by_art.get(tools_art_key, {})

        kalkylpris  = val(m, 'Kalkylpris bas_2', 'Kalkylpris bas')
        erstatning  = erstatning_by_art.get(tools_art_key, '')
        varestatus  = varestatus_by_art.get(tools_art_key, '')
        lokasjon_sa = sa_lokasjon_map.get(sa_nr, '') or sa_kundens_artbeskr_map.get(sa_nr, '')

        # Ledetid via Företagsnr fra Lagerplan (Leverantör-kolonne = leverandørnummer)
        supplier_nr  = val(l, 'Leverantör')
        supplier_key = str(supplier_nr).strip() if supplier_nr else ''
        lev_tuple    = lev_ledtid_map.get(supplier_key, (0, 0))

        invdat = invdat_by_art.get(tools_art_key, '')

        output_rows.append({
            'SA_Nummer':        sa_nr,
            'Tools_ArtNr':      tools_art_key,
            'Beskrivelse':      val(sa_row, 'Beskrivelse', 'Description', 'Artikelbeskrivelse', 'Navn'),
            'Lagersaldo':       val(m, 'TotLagSaldo', 'Lagersaldo'),
            'DispLagSaldo':     val(m, 'DispLagSaldo'),
            'BP':               val(l, 'BP'),
            'Maxlager':         val(l, 'Maxlager'),
            'ReservAnt':        val(m, 'ReservAnt'),
            'BestAntLev':       val(m, 'BestAntLev'),
            'R12 Del Qty':      '',
            'Artikelstatus':    val(m, 'Artikelstatus'),
            'Supplier Name':    val(l, 'Leverantör'),
            'Lagerhylla':       val(m, 'Lagerhylla'),
            'VareStatus':       varestatus,
            'ErsattsAvArtNr':   erstatning,
            'LAGERFØRT':        '',
            'VAREMERKE':        '',
            'PakkeStørrelse':   '',
            'Enhet / Ant Des':  '',
            'Item category 1':  val(m, 'Varugrupp'),
            'Item category 2':  '',
            'Item category 3':  '',
            'Ordre_TotAntall':  '',
            'Ordre_SisteDato':  '',
            'Dagens_Pris':      '',
            'Kalkylpris_bas':   kalkylpris,
            'EOK':              val(l, 'EOK'),
            'Lokasjon_SA':      lokasjon_sa,
            'LevLedTid':        lev_tuple[0],
            'Transportdagar':   lev_tuple[1],
            'InvDat':           invdat,
        })
        matched += 1

    # ── Skriv output ──
    print(f'\nSkriver {OUTPUT_FILE}...')
    wb_out = Workbook()
    ws_out = wb_out.active
    ws_out.title = 'SA-Oversikt'
    ws_out.append(output_columns)
    for row_dict in output_rows:
        ws_out.append([row_dict.get(col, '') for col in output_columns])
    wb_out.save(OUTPUT_FILE)

    # ── Verifisering ──
    lokasjon_count   = sum(1 for r in output_rows if r.get('Lokasjon_SA'))
    erstatning_count = sum(1 for r in output_rows if r.get('ErsattsAvArtNr'))
    ledetid_count    = sum(1 for r in output_rows if r.get('LevLedTid', 0) > 0 or r.get('Transportdagar', 0) > 0)
    invdat_count     = sum(1 for r in output_rows if r.get('InvDat'))
    telt2026_count   = sum(1 for r in output_rows if r.get('InvDat', '') >= '20260101' and r.get('InvDat'))
    varestatus_count = sum(1 for r in output_rows if r.get('VareStatus'))

    print(f'\nFerdig!')
    print(f'  Fil:      {OUTPUT_FILE}')
    print(f'  Ark:      "SA-Oversikt"')
    print(f'  Rader:    {len(output_rows)} artikler')
    print(f'  Kolonner: {len(output_columns)}')
    print(f'\n  ── Verifisering ──')
    print(f'  Lokasjon_SA ikke-tomme:   {lokasjon_count} av {len(output_rows)}')
    print(f'  ErsattsAvArtNr ikke-tomme:{erstatning_count} av {len(output_rows)}')
    print(f'  VareStatus ikke-tomme:    {varestatus_count} av {len(output_rows)}')
    print(f'  Artikler med ledetid:     {ledetid_count} av {len(output_rows)}')
    print(f'  InvDat (sist telt):       {invdat_count} av {len(output_rows)}')
    print(f'  Telt i 2026:              {telt2026_count} av {len(output_rows)}')


if __name__ == '__main__':
    main()