import re, json, html

path = r"C:\Users\ADMINI~1\AppData\Local\Temp\trending.html"
with open(path, "r", encoding="utf-8") as f:
    data = f.read()

rows = re.split(r'<article class="Box-row">', data)[1:]
results = []
for row in rows:
    m = re.search(r'<h2 class="h3 lh-condensed">(.*?)</h2>', row, re.S)
    if not m:
        continue
    hm = re.search(r'href="/([^"]+)"', m.group(1))
    if not hm:
        continue
    full = hm.group(1).strip().strip("/")
    lang = None
    lm = re.search(r'itemprop="programmingLanguage">([^<]+)<', row)
    if lm:
        lang = lm.group(1).strip()
    total = None
    sm = re.search(r'href="/' + re.escape(full) + r'/stargazers"[^>]*>\s*([\d,]+)', row)
    if sm:
        total = sm.group(1).replace(",", "")
    today = 0
    tm = re.search(r'([\d,]+)\s+stars today', row)
    if tm:
        today = int(tm.group(1).replace(",", ""))
    desc = None
    dm = re.search(r'<p class="col-9[^"]*"[^>]*>(.*?)</p>', row, re.S)
    if dm:
        desc = re.sub(r'<[^>]+>', '', dm.group(1))
        desc = html.unescape(desc).strip()
        desc = re.sub(r'\s+', ' ', desc)
    results.append({
        "full": full,
        "lang": lang,
        "total": total,
        "today": today,
        "desc": desc,
    })

out = r"C:\Users\ADMINI~1\AppData\Local\Temp\trending_parsed.json"
with open(out, "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print("parsed", len(results))
