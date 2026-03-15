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
PRISLISTE_PATH = r"C:\Users\ROGSOR0319\_Datahub\Excel-eksporter\prislister\20260319_Borregaard_prisliste.xlsx"

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

    data = {
        "generert":     datetime.now().strftime("%Y-%m-%d %H:%M"),
        "master":       master.to_dict(orient="records"),
        "orders":       orders.to_dict(orient="records"),
        "bestillinger": best.to_dict(orient="records"),
        "prisliste":    pris_records,  # FASE 9.0
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