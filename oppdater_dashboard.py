"""
oppdater_dashboard.py — Borregaard Dashboard daglig oppdatering

Rogers morgenrutine:
  1. Eksporter 4 Excel-filer fra Butler/Jeeves
  2. Dobbeltklikk oppdater_dashboard.bat
  3. Ferdig
"""

import os
import sys
import json
import shutil
import subprocess
from datetime import datetime

try:
    import pandas as pd
except ImportError:
    print("❌ pandas er ikke installert. Kjør: pip install pandas openpyxl")
    sys.exit(1)

# ── Filstier ────────────────────────────────────────────────────────────────
BASE     = r"C:\Users\ROGSOR0319\_Datahub\Excel-eksporter"
DAGLIG   = os.path.join(BASE, "01-Daglig")
UKENTLIG = os.path.join(BASE, "02_Ukentlig")
SJELDEN  = os.path.join(BASE, "03-Sjelden")

required = {
    "Master_Artikkelstatus.xlsx": DAGLIG,
    "Master.xlsx":                DAGLIG,
    "Ordrer_Jeeves.xlsx":         DAGLIG,
    "bestillinger.xlsx":          DAGLIG,
    "SA-Nummer.xlsx":             SJELDEN,
    "leverandører.xlsx":          SJELDEN,
    "Analyse_Lagerplan.xlsx":     UKENTLIG,
}

# Prisliste er valgfri — dashbordet fungerer uten den
PRISLISTE_PATH = r"C:\Users\ROGSOR0319\_Datahub\Excel-eksporter\03-Sjelden\20260319_Borregaard_prisliste.xlsx"

# data (7).xlsx sjekkes separat pga. rename
data7_src = os.path.join(SJELDEN, "data (7).xlsx")

# ── Steg 0: Sjekk at alle filer er på plass ─────────────────────────────────
print("Sjekker påkrevde filer...")
mangler = False
for fil, mappe in required.items():
    full_sti = os.path.join(mappe, fil)
    if not os.path.exists(full_sti):
        print(f"❌ Mangler fil: {fil}")
        print(f"   Forventet sti: {full_sti}")
        mangler = True
    else:
        print(f"✅ {fil}")

if not os.path.exists(data7_src):
    print(f"❌ Mangler fil: data (7).xlsx")
    print(f"   Forventet sti: {data7_src}")
    mangler = True
else:
    print(f"✅ data (7).xlsx")

if mangler:
    print("\nEksporter manglende filer fra Butler/Jeeves og prøv igjen.")
    sys.exit(1)

try:
    script_dir = os.path.dirname(os.path.abspath(__file__))

    # ── Steg 1: Kopier filer til prosjektmappen ──────────────────────────────
    print("\n[1/5] Kopierer Excel-filer til prosjektmappen...")
    for fil, mappe in required.items():
        src = os.path.join(mappe, fil)
        dst = os.path.join(script_dir, fil)
        shutil.copy2(src, dst)
        print(f"  → {fil}")

    # data (7).xlsx kopieres med nytt navn
    shutil.copy2(data7_src, os.path.join(script_dir, "data_7.xlsx"))
    print(f"  → data (7).xlsx  (lagret som data_7.xlsx)")
    print("✅ Filer kopiert")

    # ── Steg 2: Kjør generate_masterV2.py ────────────────────────────────────
    print("\n[2/5] Genererer Borregaard_SA_Master_v2.xlsx...")
    subprocess.run([sys.executable, "generate_masterV2.py"], check=True,
                   cwd=script_dir)
    print("✅ MV2 generert")

    # ── Steg 3: Les Excel-filer og bygg JSON ─────────────────────────────────
    print("\n[3/5] Konverterer Excel til JSON...")

    master = pd.read_excel(
        os.path.join(script_dir, "Borregaard_SA_Master_v2.xlsx"),
        sheet_name="SA-Oversikt",
        dtype=str
    ).fillna("")

    orders = pd.read_excel(
        os.path.join(script_dir, "Ordrer_Jeeves.xlsx"), dtype=str
    ).fillna("")

    best = pd.read_excel(
        os.path.join(script_dir, "bestillinger.xlsx"), dtype=str
    ).fillna("")

    # ── Prisliste (valgfri) ───────────────────────────────────────────────────
    pris_records = []
    try:
        pris_df = pd.read_excel(PRISLISTE_PATH, header=4, dtype=str)
        pris_df.columns = [str(c).strip() for c in pris_df.columns]

        # Konverter priskolonner (komma → punktum)
        for col in ['q_replacement_value', 'Ny pris', 'Ny DG']:
            if col in pris_df.columns:
                pris_df[col] = pd.to_numeric(
                    pris_df[col].astype(str).str.replace(',', '.').str.replace(' ', ''),
                    errors='coerce'
                ).fillna(0)

        if 'artlistpris' in pris_df.columns:
            pris_df['artlistpris'] = pd.to_numeric(
                pris_df['artlistpris'].astype(str).str.replace(',', '.').str.replace(' ', ''),
                errors='coerce'
            ).fillna(0)

        pris_cols = ['artnr', 'SA-Nummer', 'q_replacement_value', 'artlistpris',
                     'Ny pris', 'Ny DG', 'Status', 'Anbefaling']
        pris_cols = [c for c in pris_cols if c in pris_df.columns]
        pris_records = pris_df[pris_cols].fillna('').to_dict(orient="records")
        print(f"✅ Prisliste lastet ({len(pris_records)} rader)")
    except Exception as pris_err:
        print(f"⚠️  Prisliste ikke tilgjengelig (fortsetter uten): {pris_err}")

    # Sjekk prisliste for kalkylpris-fallback
    if os.path.exists(PRISLISTE_PATH):
        print(f'✅ Prisliste funnet — kalkylpris fallback aktivert')
    else:
        print(f'⚠️  Prisliste ikke funnet — kalkylpris kun fra Master_Artikkelstatus')

    # ── DG-kontroll: Orderingang.xlsx (FASE 9.x) ─────────────────────────────
    print("\nLeser Orderingang.xlsx for DG-kontroll...")
    ORDERINGANG_PATH = os.path.join(DAGLIG, "Orderingang.xlsx")
    dg_kontroll = {}
    try:
        from datetime import timedelta
        og_raw = pd.read_excel(ORDERINGANG_PATH, header=0, dtype=str)
        og_raw.columns = [str(c).strip() for c in og_raw.columns]
        cols = og_raw.columns.tolist()

        # Hent kolonner via 0-basert indeks (rad 1 = header)
        col_art_nr = cols[3]   # Artikelnr
        col_beskr  = cols[10]  # Artikelbeskrivning
        col_pris   = cols[22]  # PrisVal
        col_ksv    = cols[7]   # KSV fakt.rad
        col_dg     = cols[8]   # Täckningsgrad
        col_dato   = cols[12]  # OrdDtm
        col_dk     = cols[25]  # D/K

        # Filtrer kun D-rader (debet/salg)
        og = og_raw[og_raw[col_dk].astype(str).str.strip().str.upper() == 'D'].copy()

        # Parse dato YYMMDD → datetime
        def parse_yymmdd(val):
            try:
                s = str(int(float(str(val)))).zfill(6)
                return datetime(2000 + int(s[0:2]), int(s[2:4]), int(s[4:6]))
            except Exception:
                return None

        og['_dato'] = og[col_dato].apply(parse_yymmdd)
        og = og.dropna(subset=['_dato'])

        # Konverter numeriske kolonner (komma → punktum)
        for c in [col_pris, col_ksv, col_dg]:
            og[c] = pd.to_numeric(
                og[c].astype(str).str.replace(',', '.').str.replace(' ', ''),
                errors='coerce'
            ).fillna(0.0)

        # Filtrer siste 12 måneder (365 dager)
        cutoff_12m = datetime.now() - timedelta(days=365)
        og_12m = og[og['_dato'] >= cutoff_12m].copy()

        # Grupper per Artikelnr — hent siste ordre og 12-mnd snitt
        grp12_map = {
            str(art_nr).strip(): grp
            for art_nr, grp in og_12m.groupby(col_art_nr)
            if str(art_nr).strip()
        }

        for art_nr, grp_all in og.groupby(col_art_nr):
            art_nr = str(art_nr).strip()
            if not art_nr:
                continue

            # Seneste ordre (høyest dato)
            latest = grp_all.loc[grp_all['_dato'].idxmax()]

            grp12 = grp12_map.get(art_nr, pd.DataFrame())
            antall_12m = len(grp12)

            dg_snitt_12mnd = round(float(grp12[col_dg].mean()), 1) if antall_12m > 0 \
                             else round(float(latest[col_dg]), 1)
            dg_siste = round(float(latest[col_dg]), 1)
            dg_avvik = round(dg_siste - dg_snitt_12mnd, 1)

            dg_kontroll[art_nr] = {
                "beskrivelse":      str(latest[col_beskr]).strip(),
                "dg_snitt_12mnd":   dg_snitt_12mnd,
                "dg_siste":         dg_siste,
                "dg_avvik":         dg_avvik,
                "siste_pris":       round(float(latest[col_pris]), 2),
                "siste_ksv":        round(float(latest[col_ksv]), 2),
                "siste_ordredato":  latest['_dato'].strftime('%Y-%m-%d'),
                "antall_ordrer_12mnd": antall_12m,
            }

        print(f"✅ DG-kontroll: {len(dg_kontroll)} artikler analysert")

    except FileNotFoundError:
        print(f"⚠️  Orderingang.xlsx ikke funnet — dgKontroll satt til tom dict")
    except Exception as dg_err:
        print(f"⚠️  DG-kontroll feil (fortsetter uten): {dg_err}")

    data = {
        "generert":     datetime.now().strftime("%Y-%m-%d %H:%M"),
        "master":       master.to_dict(orient="records"),
        "orders":       orders.to_dict(orient="records"),
        "bestillinger": best.to_dict(orient="records"),
        "prisliste":    pris_records,  # FASE 9.0
        "dgKontroll":   dg_kontroll,   # FASE 9.x
    }

    os.makedirs(os.path.join(script_dir, "data"), exist_ok=True)
    json_path = os.path.join(script_dir, "data", "dashboard-data.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)

    size_kb = os.path.getsize(json_path) / 1024
    print(f"✅ JSON generert ({size_kb:.0f} KB, {len(master)} artikler)")

    # ── Steg 4: Git push ──────────────────────────────────────────────────────
    print("\n[4/5] Pusher til GitHub...")
    subprocess.run(["git", "add", "data/dashboard-data.json"], check=True,
                   cwd=script_dir)
    subprocess.run(
        ["git", "commit", "-m",
         f"Data oppdatert {datetime.now().strftime('%Y-%m-%d %H:%M')}"],
        check=True, cwd=script_dir
    )
    subprocess.run(["git", "push"], check=True, cwd=script_dir)
    print("✅ Pushet til GitHub")

    # ── Steg 5: Ferdig ───────────────────────────────────────────────────────
    print("\n[5/5] Netlify redeployer automatisk (~10 sekunder)")
    print("\n🎉 Dashboard oppdatert! Kollega kan åpne linken nå.")

except subprocess.CalledProcessError as e:
    print(f"\n❌ Kommandofeil: {e}")
    print("   Sjekk at git er konfigurert og at du har tilgang til repoet.")
    sys.exit(1)
except Exception as e:
    print(f"\n❌ Uventet feil: {e}")
    sys.exit(1)