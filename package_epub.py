"""Zip ./out into an EPUB and run structural checks (epubcheck needs Java, which is not installed)."""
import os, re, sys, zipfile
import xml.etree.ElementTree as ET

OUT, DEST = "epub-out", sys.argv[1]
errors = []

# Every XML/XHTML file must be well-formed.
for root, _, files in os.walk(OUT):
    for f in files:
        if f.endswith((".xhtml", ".opf", ".xml")):
            p = os.path.join(root, f)
            try:
                ET.parse(p)
            except ET.ParseError as e:
                errors.append(f"not well-formed: {p}: {e}")

# Manifest must list every file, and every listed file must exist.
opf = ET.parse(os.path.join(OUT, "OEBPS/content.opf")).getroot()
ns = {"o": "http://www.idpf.org/2007/opf"}
listed = {i.get("href") for i in opf.findall(".//o:item", ns)}
present = set()
for root, _, files in os.walk(os.path.join(OUT, "OEBPS")):
    for f in files:
        rel = os.path.relpath(os.path.join(root, f), os.path.join(OUT, "OEBPS"))
        if rel != "content.opf":
            present.add(rel)
for m in sorted(listed - present): errors.append(f"listed but missing: {m}")
for m in sorted(present - listed): errors.append(f"present but not listed: {m}")

# Every local href/src in content documents must resolve.
for f in [p for p in present if p.endswith(".xhtml") or p.endswith(".css")]:
    txt = open(os.path.join(OUT, "OEBPS", f), encoding="utf8").read()
    for ref in re.findall(r'(?:href|src)="([^"#:]+)"|url\(([^)#:]+)\)', txt):
        r = ref[0] or ref[1]
        target = os.path.normpath(os.path.join(os.path.dirname(f), r))
        if target not in present:
            errors.append(f"broken reference in {f}: {r}")

if errors:
    print("\n".join(errors)); sys.exit(1)

# mimetype first and stored uncompressed (EPUB OCF rule).
with zipfile.ZipFile(DEST, "w") as z:
    z.write(os.path.join(OUT, "mimetype"), "mimetype", compress_type=zipfile.ZIP_STORED)
    for root, _, files in os.walk(OUT):
        for f in sorted(files):
            p = os.path.join(root, f); arc = os.path.relpath(p, OUT)
            if arc != "mimetype":
                z.write(p, arc, compress_type=zipfile.ZIP_DEFLATED)
with zipfile.ZipFile(DEST) as z:
    first = z.infolist()[0]
    assert first.filename == "mimetype" and first.compress_type == zipfile.ZIP_STORED
print(f"OK: {DEST} ({os.path.getsize(DEST)//1024} KB), {len(present)} files, all checks passed")
