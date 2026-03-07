#!/usr/bin/env python3
"""
generate_masterV2.py — Genererer Borregaard_SA_Master_v2.xlsx

Kombinerer tre Excel-eksporter fra Jeeves/Butler:
  1. SA-Nummer.xlsx           — SA-numre og Tools-artikkelnummer
  2. Master_Artikkelstatus.xlsx — lagerstatus, Kalkylpris bas, Artikelstatus, m.m.
  3. Analyse_Lagerplan.xlsx   — BP, EOK, Maxlager, Leverantör

Output: Borregaard_SA_Master_v2.xlsx, ark "SA-Oversikt"
  - Rad 1 = kolonneoverskrifter (ingen tittelrad)
  - Primærnøkkel: SA_Nummer (Kunds artikkelnummer fra SA-Nummer.xlsx)
  - Koblingsnøkkel: Tools_ArtNr (Artikelnr fra SA-Nummer.xlsx)

Kjøres fra prosjektmappen:
    python3 generate_masterV2.py

Krav: pip install openpyxl
"""

import os
import openpyxl
from openpyxl import Workbook

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

SA_FILE        = os.path.join(SCRIPT_DIR, 'SA-Nummer.xlsx')
MASTER_FILE    = os.path.join(SCRIPT_DIR, 'Master_Artikkelstatus.xlsx')
LAGERPLAN_FILE = os.path.join(SCRIPT_DIR, 'Analyse_Lagerplan.xlsx')
OUTPUT_FILE    = os.path.join(SCRIPT_DIR, 'Borregaard_SA_Master_v2.xlsx')


def read_sheet(filepath, sheet_name=None):
    """
    Les Excel-ark som liste av dicts.
    Håndterer dupliserte kolonnenavn ved å suffixe med _2, _3 osv.
    Tomme rader hoppes over.
    """
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
            continue  # hopp over tomme rader

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
    """Hent første ikke-tomme verdi blant oppgitte nøkler."""
    for k in keys:
        v = d.get(k)
        if v is not None and str(v).strip() != '':
            return v
    return default


def main():
    print('=' * 50)
    print('Genererer Borregaard_SA_Master_v2.xlsx')
    print('=' * 50)

    # ── 1. Les SA-Nummer.xlsx ──
    print(f'Leser SA-Nummer.xlsx...')
    sa_rows = read_sheet(SA_FILE)
    print(f'  {len(sa_rows)} rader')

    # ── 2. Les Master_Artikkelstatus.xlsx ──
    print(f'Leser Master_Artikkelstatus.xlsx...')
    master_rows = read_sheet(MASTER_FILE)
    print(f'  {len(master_rows)} rader')

    # ── 3. Les Analyse_Lagerplan.xlsx ──
    print(f'Leser Analyse_Lagerplan.xlsx...')
    lagerplan_rows = read_sheet(LAGERPLAN_FILE)
    print(f'  {len(lagerplan_rows)} rader')

    # ── Bygg oppslagstabeller: Artikelnr → dict ──
    master_by_art = {}
    for row in master_rows:
        art = val(row, 'Artikelnr')
        if art:
            master_by_art[str(art).strip()] = row

    lagerplan_by_art = {}
    for row in lagerplan_rows:
        art = val(row, 'Artikelnr')
        if art:
            lagerplan_by_art[str(art).strip()] = row

    print(f'  Master-oppslag: {len(master_by_art)} unike Artikelnr')
    print(f'  Lagerplan-oppslag: {len(lagerplan_by_art)} unike Artikelnr')

    # ── Kolonner i output-filen ──
    # Rekkefølge: SA-identitet, lagerstatus, planlegging, status/leverandør,
    #             vareinfo, kategorier, salg, pris — deretter nye felt (FASE 7.1)
    output_columns = [
        'SA_Nummer',        # Primærnøkkel (Kunds artikkelnummer)
        'Tools_ArtNr',      # Sekundær koblingsnøkkel
        'Beskrivelse',      # Artikelbeskrivning
        'Lagersaldo',       # TotLagSaldo fra Master
        'DispLagSaldo',     # DispLagSaldo fra Master
        'BP',               # Bestillingspunkt fra Lagerplan
        'Maxlager',         # Maxlager fra Lagerplan
        'ReservAnt',        # ReservAnt fra Master
        'BestAntLev',       # BestAntLev fra Master
        'R12 Del Qty',      # Historisk salg 12 mnd (Butler-eksport — tom her)
        'Artikelstatus',    # Artikelstatus fra Master
        'Supplier Name',    # Leverantör fra Lagerplan
        'Lagerhylla',       # Lagerhylla fra Master
        'VareStatus',       # Varestatus (Butler-eksport — tom her)
        'ErsattsAvArtNr',   # Ersätts av artikel fra Master
        'LAGERFØRT',        # Lagersted (Butler-eksport — tom her)
        'VAREMERKE',        # Produsentmerke (Butler-eksport — tom her)
        'PakkeStørrelse',   # Antall per pakning (Butler-eksport — tom her)
        'Enhet / Ant Des',  # Enhet (Butler-eksport — tom her)
        'Item category 1',  # Varugrupp fra Master
        'Item category 2',  # (Butler-eksport — tom her)
        'Item category 3',  # (Butler-eksport — tom her)
        'Ordre_TotAntall',  # Totalt salgsantall (trenger Ordrer_Jeeves — tom her)
        'Ordre_SisteDato',  # Siste salgsdato (trenger Ordrer_Jeeves — tom her)
        'Dagens_Pris',      # Avtalepris (Butler-eksport — tom her)
        'Kalkylpris_bas',   # Kalkylpris bas fra Master (FASE 7.1)
        'EOK',              # Ordrekvantitet fra Lagerplan (FASE 7.1)
    ]

    # ── Generer output-rader ──
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

        m = master_by_art.get(tools_art_key, {})
        l = lagerplan_by_art.get(tools_art_key, {})

        # Kalkylpris bas: Master-filen har denne kolonnen to ganger.
        # read_sheet() suffixer den andre forekomsten med "_2".
        # Den andre ("Kalkylpris bas_2") er den gjeldende prisbasen.
        kalkylpris = val(m, 'Kalkylpris bas_2', 'Kalkylpris bas')

        output_rows.append({
            'SA_Nummer':        sa_nr,
            'Tools_ArtNr':      tools_art_key,
            'Beskrivelse':      val(sa_row, 'Artikelbeskrivning'),
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
            'VareStatus':       '',
            'ErsattsAvArtNr':   val(m, 'Ersätts av artikel'),
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
            'Kalkylpris_bas':   kalkylpris,   # FASE 7.1
            'EOK':              val(l, 'EOK'), # FASE 7.1
        })
        matched += 1

    print(f'\nResultat:')
    print(f'  SA-artikler prosessert: {matched}')
    if skipped:
        print(f'  Hoppet over (mangler SA-nr): {skipped}')

    # ── Skriv output ──
    print(f'\nSkriver {OUTPUT_FILE}...')
    wb_out = Workbook()
    ws_out = wb_out.active
    ws_out.title = 'SA-Oversikt'

    # Rad 1 = kolonneoverskrifter (ingen tittelrad)
    ws_out.append(output_columns)

    for row_dict in output_rows:
        ws_out.append([row_dict.get(col, '') for col in output_columns])

    wb_out.save(OUTPUT_FILE)

    print(f'\nFerdig!')
    print(f'  Fil:     {OUTPUT_FILE}')
    print(f'  Ark:     "SA-Oversikt"')
    print(f'  Rader:   {len(output_rows)} artikler')
    print(f'  Kolonner: {len(output_columns)}')
    print(f'  Inkludert (FASE 7.1): Kalkylpris_bas, EOK')


if __name__ == '__main__':
    main()
