"""One-off: verify real TradingEconomics slugs for every country name, with
fallback candidates for known-tricky cases. Writes results to /tmp for review.
Not part of the app - delete after use.
"""
import re
import time
import requests

NAMES = """Afghanistan,Albania,Algeria,Angola,Antigua and Barbuda,Argentina,Armenia,Aruba,Austria,Azerbaijan,Bahamas,Bahrain,Bangladesh,Barbados,Belgium,Belize,Benin,Bermuda,Bhutan,Bolivia,Bosnia and Herzegovina,Botswana,Brazil,Brunei,Bulgaria,Burkina Faso,Burundi,Cambodia,Cameroon,Canada,Cape Verde,Cayman Islands,Chad,Chile,China,Colombia,Congo,Costa Rica,Croatia,Cyprus,Czech Republic,Denmark,Djibouti,Dominica,Dominican Republic,East Timor,Ecuador,Egypt,El Salvador,Estonia,Ethiopia,Euro Area,European Union,Faroe Islands,Fiji,Finland,Gabon,Gambia,Georgia,Ghana,Greece,Grenada,Guatemala,Guinea,Guyana,Haiti,Honduras,Hong Kong,Hungary,Iceland,India,Indonesia,Iran,Iraq,Israel,Ivory Coast,Jamaica,Jordan,Kazakhstan,Kosovo,Kuwait,Kyrgyzstan,Laos,Latvia,Lebanon,Lesotho,Liberia,Libya,Lithuania,Luxembourg,Macau,Macedonia,Madagascar,Malawi,Malaysia,Maldives,Mali,Malta,Mauritania,Mauritius,Mexico,Moldova,Mongolia,Montenegro,Morocco,Mozambique,Namibia,Nepal,Netherlands,New Caledonia,New Zealand,Nicaragua,Niger,Nigeria,Norway,Oman,Pakistan,Palestine,Panama,Papua New Guinea,Paraguay,Peru,Philippines,Poland,Portugal,Puerto Rico,Qatar,Republic of the Congo,Romania,Russia,Rwanda,Sao Tome And Principe,Saudi Arabia,Senegal,Serbia,Seychelles,Sierra Leone,Slovakia,Slovenia,Solomon Islands,Somalia,South Korea,Spain,Sri Lanka,St Kitts and Nevis,St Lucia,Suriname,Swaziland,Sweden,Switzerland,Syria,Taiwan,Tajikistan,Tanzania,Thailand,Togo,Trinidad And Tobago,Tunisia,Turkey,Uganda,Ukraine,United Arab Emirates,Uruguay,Vanuatu,Venezuela,Vietnam,Zambia""".split(",")

# Already tracked, skip: Australia, France, Germany, Ireland, Italy, Japan, Kenya,
# Singapore, South Africa, United Kingdom, United States, Zimbabwe

OVERRIDES = {
    "Congo": ["democratic-republic-of-congo", "congo"],
    "Republic of the Congo": ["congo-republic", "republic-of-the-congo"],
    "Czech Republic": ["czech-republic"],
    "South Korea": ["south-korea"],
    "Ivory Coast": ["cote-d-ivoire", "ivory-coast"],
    "East Timor": ["timor-leste", "east-timor"],
    "Cape Verde": ["cabo-verde", "cape-verde"],
    "Swaziland": ["eswatini", "swaziland"],
    "Macedonia": ["north-macedonia", "macedonia"],
    "Macau": ["macau", "macao"],
    "Antigua and Barbuda": ["antigua-and-barbuda"],
    "Bosnia and Herzegovina": ["bosnia-and-herzegovina"],
    "Trinidad And Tobago": ["trinidad-and-tobago"],
    "Sao Tome And Principe": ["sao-tome-and-principe"],
    "St Kitts and Nevis": ["st-kitts-and-nevis", "saint-kitts-and-nevis"],
    "St Lucia": ["st-lucia", "saint-lucia"],
    "United Arab Emirates": ["united-arab-emirates"],
    "European Union": ["european-union"],
    "Euro Area": ["euro-area"],
    "Papua New Guinea": ["papua-new-guinea"],
    "New Caledonia": ["new-caledonia"],
    "New Zealand": ["new-zealand"],
    "Costa Rica": ["costa-rica"],
    "Puerto Rico": ["puerto-rico"],
    "Burkina Faso": ["burkina-faso"],
    "Cayman Islands": ["cayman-islands"],
    "Dominican Republic": ["dominican-republic"],
    "El Salvador": ["el-salvador"],
    "Faroe Islands": ["faroe-islands"],
    "Hong Kong": ["hong-kong"],
    "Sierra Leone": ["sierra-leone"],
    "Solomon Islands": ["solomon-islands"],
}


def default_slug(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"\s+", "-", s)
    return s


def candidates(name: str) -> list[str]:
    if name in OVERRIDES:
        return OVERRIDES[name]
    return [default_slug(name)]


def check(slug: str) -> tuple[int, int]:
    try:
        r = requests.get(
            f"https://tradingeconomics.com/{slug}/indicators",
            headers={"User-Agent": "economic-indicators-dashboard/1.0 (slug verification; contact: tonycowan56@gmail.com)"},
            timeout=20,
        )
        return r.status_code, len(r.content)
    except requests.RequestException as e:
        return -1, 0


def main():
    results = []
    for name in NAMES:
        found = None
        for slug in candidates(name):
            code, size = check(slug)
            ok = code == 200 and size > 50_000
            print(f"{name} -> {slug}: {code} ({size} bytes) {'OK' if ok else 'FAIL'}", flush=True)
            if ok:
                found = slug
                break
            time.sleep(0.3)
        results.append((name, found))
        time.sleep(0.3)

    print("\n\n=== SUMMARY ===")
    missing = [n for n, s in results if s is None]
    for name, slug in results:
        print(f"{name}\t{slug or 'MISSING'}")
    print(f"\n{len(results) - len(missing)}/{len(results)} verified, {len(missing)} missing: {missing}")


if __name__ == "__main__":
    main()
