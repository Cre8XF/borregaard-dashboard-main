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
import subprocess
from datetime import datetime

try:
    import pandas as pd
except ImportError:
    print("❌ pandas er ikke installert. Kjør: pip install pandas openpyxl")
    sys.exit(1)

# ── Steg 0: Sjekk at alle 4 daglige filer er på plass ──────────────────────
required = [
    "Master_Artikkelstatus.xlsx",
    "Master.xlsx",
    "Ordrer_Jeeves.xlsx",
    "bestillinger.xlsx"
]

print("Sjekker påkrevde filer...")
for f in required:
    if not os.path.exists(f):
        print(f"❌ Mangler fil: {f}")
        print("   Eksporter denne fra Butler/Jeeves og legg den i samme mappe.")
        sys.exit(1)
print("✅ Alle filer funnet")

try:
    # ── Steg 1: Kjør generate_masterV2.py ───────────────────────────────────
    print("\n[1/4] Genererer Borregaard_SA_Master_v2.xlsx...")
    subprocess.run([sys.executable, "generate_masterV2.py"], check=True)
    print("✅ MV2 generert")

    # ── Steg 2: Les Excel-filer og bygg JSON ────────────────────────────────
    print("\n[2/4] Konverterer Excel til JSON...")

    master = pd.read_excel(
        "Borregaard_SA_Master_v2.xlsx",
        sheet_name="SA-Oversikt",
        dtype=str
    ).fillna("")

    orders = pd.read_excel("Ordrer_Jeeves.xlsx", dtype=str).fillna("")
    best   = pd.read_excel("bestillinger.xlsx",  dtype=str).fillna("")

    data = {
        "generert":      datetime.now().strftime("%Y-%m-%d %H:%M"),
        "master":        master.to_dict(orient="records"),
        "orders":        orders.to_dict(orient="records"),
        "bestillinger":  best.to_dict(orient="records")
    }

    os.makedirs("data", exist_ok=True)
    with open("data/dashboard-data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)

    size_kb = os.path.getsize("data/dashboard-data.json") / 1024
    print(f"✅ JSON generert ({size_kb:.0f} KB, {len(master)} artikler)")

    # ── Steg 3: Git push ────────────────────────────────────────────────────
    print("\n[3/4] Pusher til GitHub...")
    subprocess.run(["git", "add", "data/dashboard-data.json"], check=True)
    subprocess.run(
        ["git", "commit", "-m",
         f"Data oppdatert {datetime.now().strftime('%Y-%m-%d %H:%M')}"],
        check=True
    )
    subprocess.run(["git", "push"], check=True)
    print("✅ Pushet til GitHub")

    # ── Steg 4: Ferdig ──────────────────────────────────────────────────────
    print("\n[4/4] Netlify redeployer automatisk (~10 sekunder)")
    print("\n🎉 Dashboard oppdatert! Kollega kan åpne linken nå.")

except subprocess.CalledProcessError as e:
    print(f"\n❌ Kommandofeil: {e}")
    print("   Sjekk at git er konfigurert og at du har tilgang til repoet.")
    sys.exit(1)
except Exception as e:
    print(f"\n❌ Uventet feil: {e}")
    sys.exit(1)
