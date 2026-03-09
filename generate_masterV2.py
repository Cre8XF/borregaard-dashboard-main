#!/usr/bin/env python3
"""
generate_masterV2.py — Genererer Borregaard_SA_Master_v2.xlsx  (FASE 7.2)

Kildefiler:
  1. SA-Nummer.xlsx             — SA-numre og Tools-artikkelnummer
  2. Master_Artikkelstatus.xlsx — lagerstatus, Kalkylpris bas, Artikelstatus
  3. Analyse_Lagerplan.xlsx     — BP, EOK, Maxlager, Leverantör
  4. data__7_.xlsx              — VareStatus, ErsattsAvArtNr, Alternativ(er)
  5. leverandører.xlsx          — LevLedTid + Transportdagar
  6. Master.xlsx                — InvDat (sist telt-dato) [FASE 7.2]
"""

import os
import openpyxl
from openpyxl import Workbook

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

SA_FILE          = os.path.join(SCRIPT_DIR, 'SA-Nummer.xlsx')
MASTER_FILE      = os.path.join(SCRIPT_DIR, 'Master_Artikkelstatus.xlsx')
LAGERPLAN_FILE   = os.path.join(SCRIPT_DIR, 'Analyse_Lagerplan.xlsx')
DATA7_FILE       = os.path.join(SCRIPT_DIR, 'data__7_.xlsx')
LEV_FILE         = os.path.join(SCRIPT_DIR, 'leverandører.xlsx')
MASTER_INV_FILE  = os.path.join(SCRIPT_DIR, 'Master.xlsx')
OUTPUT_FILE      = os.path.join(SCRIPT_DIR, 'Borregaard_SA_Master_v2.xlsx')


def read_sheet(filepath, sheet_name=None):
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


def val(d, *keys, default=''):
    for k in keys:
        v = d.get(k)
        if v is not None and str(v).strip() != '':
            return v
    return default


def read_sheet_raw_indexed(filepath):
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    ws = wb.active
    rows_raw = list(ws.iter_rows(values_only=True))
    wb.close()
    if len(rows_raw) < 2:
        return [], []
    headers = [str(h).strip() if h is not None else '' for h in rows_raw[0]]
    data = [list(r) for r in rows_raw[1:] if not all(v is None for v in r)]
    return headers, data


def format_invdat(raw):
    """YYYYMMDD (int) → 'YYYY-MM-DD' (str)"""
    if raw is None:
        return ''
    s = str(raw).strip()
    if len(s) == 8 and s.isdigit():
        return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"
    return s


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
    sa_lokasjon_map = {}
    sa_kundens_artbeskr_map = {}
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

    # ── 4. data__7_.xlsx ──
    data7_by_sa = {}
    if os.path.exists(DATA7_FILE):
        print('Leser data__7_.xlsx...')
        data7_rows = read_sheet(DATA7_FILE)
        print(f'  {len(data7_rows)} rader')
        for row in data7_rows:
            sa = val(row, 'Kundens artnr', 'SA_Nummer', 'SA-Nummer')
            if sa:
                data7_by_sa[str(sa).strip()] = row
        print(f'  data7-oppslag: {len(data7_by_sa)} unike SA-numre')
    else:
        print('  data__7_.xlsx ikke funnet — hopper over')

    # ── 5. leverandører.xlsx ──
    lev_ledetid = {}
    if os.path.exists(LEV_FILE):
        print('Leser leverandører.xlsx...')
        lev_rows = read_sheet(LEV_FILE)
        print(f'  {len(lev_rows)} rader')
        for row in lev_rows:
            fnr = val(row, 'Företagsnr', 'LevNr', 'Leverantörsnr')
            if not fnr:
                continue
            fnr_str = str(fnr).strip().lstrip('0') or '0'
            lev_led   = val(row, 'LevLedTid', 'Leveranstid')
            transport = val(row, 'Transportdagar', 'Transport')
            try:
                lev_val = int(float(str(lev_led))) if lev_led != '' else 0
            except (ValueError, TypeError):
                lev_val = 0
            try:
                tra_val = int(float(str(transport))) if transport != '' else 0
            except (ValueError, TypeError):
                tra_val = 0
            lev_ledetid[fnr_str] = {'total': lev_val + tra_val, 'lev': lev_val, 'transport': tra_val}
        print(f'  Ledetid-oppslag: {len(lev_ledetid)} unike leverandørnr')
    else:
        print('  leverandører.xlsx ikke funnet — Ledetid_dager blir tom')

    # ── 6. Master.xlsx — InvDat (FASE 7.2) ──
    invdat_by_art = {}
    if os.path.exists(MASTER_INV_FILE):
        print('Leser Master.xlsx (InvDat — sist telt)...')
        master_inv_rows = read_sheet(MASTER_INV_FILE)
        print(f'  {len(master_inv_rows)} rader')
        for row in master_inv_rows:
            art = val(row, 'Artikelnr')
            if not art:
                continue
            raw_inv = row.get('InvDat')
            if raw_inv is not None:
                formatted = format_invdat(raw_inv)
                if formatted:
                    invdat_by_art[str(art).strip()] = formatted
        print(f'  Artikler med telledato: {len(invdat_by_art)}')
    else:
        print('  Master.xlsx ikke funnet — Sist_telt blir tom')

    # ── Oppslagstabeller ──
    master_by_art = {str(val(r, 'Artikelnr')).strip(): r for r in master_rows if val(r, 'Artikelnr')}
    lagerplan_by_art = {str(val(r, 'Artikelnr')).strip(): r for r in lagerplan_rows if val(r, 'Artikelnr')}
    print(f'  Master-oppslag: {len(master_by_art)} | Lagerplan-oppslag: {len(lagerplan_by_art)}')

    # ── Kolonner ──
    output_columns = [
        'SA_Nummer', 'Tools_ArtNr', 'Beskrivelse',
        'Lagersaldo', 'DispLagSaldo', 'BP', 'Maxlager', 'ReservAnt', 'BestAntLev',
        'R12 Del Qty', 'Artikelstatus', 'Supplier Name', 'Lagerhylla',
        'VareStatus', 'ErsattsAvArtNr',
        'LAGERFØRT', 'VAREMERKE', 'PakkeStørrelse', 'Enhet / Ant Des',
        'Item category 1', 'Item category 2', 'Item category 3',
        'Ordre_TotAntall', 'Ordre_SisteDato', 'Dagens_Pris',
        'Kalkylpris_bas', 'EOK', 'Lokasjon_SA',
        'Ledetid_dager', 'Ledetid_lev', 'Ledetid_transport',
        'Sist_telt',   # FASE 7.2
    ]

    # ── Generer rader ──
    output_rows = []
    matched = 0
    skipped = 0

    for sa_row in sa_rows:
        sa_nr = val(sa_row, 'Kunds artikkelnummer')
        if not sa_nr:
            skipped += 1
            continue
        sa_nr = str(sa_nr).strip()
        tools_art = val(sa_row, 'Artikelnr')
        tools_art_key = str(tools_art).strip() if tools_art else ''

        m  = master_by_art.get(tools_art_key, {})
        l  = lagerplan_by_art.get(tools_art_key, {})
        d7 = data7_by_sa.get(sa_nr, {})

        kalkylpris  = val(m, 'Kalkylpris bas_2', 'Kalkylpris bas')
        erstatning  = val(d7, 'ErsattsAvArtNr', 'Alternativ(er)') or \
                      val(m, 'Ersätts av artikel', 'ErsattsAvArtNr', 'Alternativ(er)')
        varestatus  = val(d7, 'VareStatus', 'Varestatus')
        lokasjon_sa = sa_lokasjon_map.get(sa_nr, '') or sa_kundens_artbeskr_map.get(sa_nr, '')

        lev_nr_raw  = val(l, 'Leverantör', 'LevNr', 'Företagsnr')
        lev_nr_str  = str(lev_nr_raw).strip().lstrip('0') if lev_nr_raw else ''
        lev_info    = lev_ledetid.get(lev_nr_str, {})

        sist_telt   = invdat_by_art.get(tools_art_key, '')  # FASE 7.2

        output_rows.append({
            'SA_Nummer':         sa_nr,
            'Tools_ArtNr':       tools_art_key,
            'Beskrivelse':       val(sa_row, 'Beskrivelse', 'Description', 'Artikelbeskrivelse', 'Navn'),
            'Lagersaldo':        val(m, 'TotLagSaldo', 'Lagersaldo'),
            'DispLagSaldo':      val(m, 'DispLagSaldo'),
            'BP':                val(l, 'BP'),
            'Maxlager':          val(l, 'Maxlager'),
            'ReservAnt':         val(m, 'ReservAnt'),
            'BestAntLev':        val(m, 'BestAntLev'),
            'R12 Del Qty':       '',
            'Artikelstatus':     val(m, 'Artikelstatus'),
            'Supplier Name':     val(l, 'Leverantör'),
            'Lagerhylla':        val(m, 'Lagerhylla'),
            'VareStatus':        varestatus,
            'ErsattsAvArtNr':    erstatning,
            'LAGERFØRT':         '',
            'VAREMERKE':         '',
            'PakkeStørrelse':    '',
            'Enhet / Ant Des':   '',
            'Item category 1':   val(m, 'Varugrupp'),
            'Item category 2':   '',
            'Item category 3':   '',
            'Ordre_TotAntall':   '',
            'Ordre_SisteDato':   '',
            'Dagens_Pris':       '',
            'Kalkylpris_bas':    kalkylpris,
            'EOK':               val(l, 'EOK'),
            'Lokasjon_SA':       lokasjon_sa,
            'Ledetid_dager':     lev_info.get('total', ''),
            'Ledetid_lev':       lev_info.get('lev', ''),
            'Ledetid_transport': lev_info.get('transport', ''),
            'Sist_telt':         sist_telt,
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
    ledetid_count    = sum(1 for r in output_rows if r.get('Ledetid_dager') != '')
    sist_telt_count  = sum(1 for r in output_rows if r.get('Sist_telt'))

    print(f'\nFerdig!')
    print(f'  Fil:      {OUTPUT_FILE}')
    print(f'  Ark:      "SA-Oversikt"')
    print(f'  Rader:    {len(output_rows)} artikler')
    print(f'  Kolonner: {len(output_columns)}')
    print(f'')
    print(f'  ── Verifisering ──')
    print(f'  Lokasjon_SA:     {lokasjon_count} av {len(output_rows)}')
    print(f'  ErsattsAvArtNr:  {erstatning_count} av {len(output_rows)}')
    print(f'  Ledetid_dager:   {ledetid_count} av {len(output_rows)}')
    print(f'  Sist_telt:       {sist_telt_count} av {len(output_rows)}  [FASE 7.2]')


if __name__ == '__main__':
    main()
