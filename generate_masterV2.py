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


def read_sheet_raw_indexed(filepath):
    """
    Les Excel-ark; returnerer (headers_som_strenger, rader_som_lister).
    Brukes for å hente kolonner etter indeks uavhengig av kolonnenavn.
    """
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    ws = wb.active
    rows_raw = list(ws.iter_rows(values_only=True))
    wb.close()
    if len(rows_raw) < 2:
        return [], []
    headers = [str(h).strip() if h is not None else '' for h in rows_raw[0]]
    data = [list(r) for r in rows_raw[1:] if not all(v is None for v in r)]
    return headers, data


def main():
    print('=' * 50)
    print('Genererer Borregaard_SA_Master_v2.xlsx')
    print('=' * 50)

    # ── 1. Les SA-Nummer.xlsx ──
    print(f'Leser SA-Nummer.xlsx...')
    sa_rows = read_sheet(SA_FILE)
    print(f'  {len(sa_rows)} rader')

    # Les SA-Nummer.xlsx råt etter indeks for å hente col[6] pålitelig
    # (uavhengig av om kolonnenavnet er duplisert og omdøpt av read_sheet())
    sa_headers, sa_raw_data = read_sheet_raw_indexed(SA_FILE)
    print(f'  SA-kolonner funnet: {sa_headers}')

    # Finn SA-nummerkolonnen (primærnøkkel) og 'Kundens artbeskr.' etter indeks
    sa_nr_idx = next(
        (i for i, h in enumerate(sa_headers)
         if h.lower() in ('kunds artikkelnummer', 'kundens artnr', 'sa-nummer', 'sa nummer', 'sa_nummer')),
        0
    )
    kundens_artbeskr_idx = next(
        (i for i, h in enumerate(sa_headers) if h.lower() == 'kundens artbeskr.'),
        None
    )

    # Bygg SA-nr → lokasjon (col[6]) og SA-nr → Kundens artbeskr.-oppslag
    sa_lokasjon_map = {}           # fra 'Artikelbeskrivning' ved indeks 6
    sa_kundens_artbeskr_map = {}   # fallback fra 'Kundens artbeskr.'

    for raw_row in sa_raw_data:
        if len(raw_row) <= sa_nr_idx:
            continue
        sa_key = str(raw_row[sa_nr_idx]).strip() if raw_row[sa_nr_idx] is not None else ''
        if not sa_key:
            continue

        # Kolonne på indeks 6 = hyllelokasjon (f.eks. '11-11-B')
        if len(raw_row) > 6 and raw_row[6] is not None:
            col6 = str(raw_row[6]).strip()
            if col6:
                sa_lokasjon_map[sa_key] = col6

        # 'Kundens artbeskr.' fallback
        if kundens_artbeskr_idx is not None and len(raw_row) > kundens_artbeskr_idx:
            kb = raw_row[kundens_artbeskr_idx]
            if kb is not None:
                kb_str = str(kb).strip()
                if kb_str:
                    sa_kundens_artbeskr_map[sa_key] = kb_str

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
        'Lokasjon_SA',      # Hyllelokasjon fra SA-Nummer.xlsx (Artikelbeskrivning indeks 6)
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

        # Problem A: ErsattsAvArtNr — bruk 'Alternativ(er)' som fallback
        erstatning = val(m, 'Ersätts av artikel', 'ErsattsAvArtNr', 'Alternativ(er)')

        # Problem B+C: Lokasjon_SA — hent fra col[6] i SA-fil (indeksbasert),
        # med 'Kundens artbeskr.' som fallback
        lokasjon_sa = sa_lokasjon_map.get(sa_nr, '') or sa_kundens_artbeskr_map.get(sa_nr, '')

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
            'VareStatus':       '',
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
            'Kalkylpris_bas':   kalkylpris,   # FASE 7.1
            'EOK':              val(l, 'EOK'), # FASE 7.1
            'Lokasjon_SA':      lokasjon_sa,  # col[6] fra SA-fil, fallback Kundens artbeskr.
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

    # Verifisering
    lokasjon_count     = sum(1 for r in output_rows if r.get('Lokasjon_SA'))
    erstatning_count   = sum(1 for r in output_rows if r.get('ErsattsAvArtNr'))

    print(f'\nFerdig!')
    print(f'  Fil:     {OUTPUT_FILE}')
    print(f'  Ark:     "SA-Oversikt"')
    print(f'  Rader:   {len(output_rows)} artikler')
    print(f'  Kolonner: {len(output_columns)}')
    print(f'  Inkludert (FASE 7.1): Kalkylpris_bas, EOK')
    print(f'')
    print(f'  ── Verifisering ──')
    print(f'  Lokasjon_SA ikke-tomme: {lokasjon_count} av {len(output_rows)}')
    print(f'    (fra SA col[6]: {len(sa_lokasjon_map)}, fra Kundens artbeskr.: {len(sa_kundens_artbeskr_map)})')
    print(f'  ErsattsAvArtNr ikke-tomme: {erstatning_count} av {len(output_rows)}')


if __name__ == '__main__':
    main()
