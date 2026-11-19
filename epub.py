"""Package the redesigned chapter as an EPUB 3 (reuses KaTeX css+fonts from the pilot build)."""
import re, os, shutil, uuid, datetime, subprocess, xml.etree.ElementTree as ET
src = open("dist/index.html", encoding="utf8").read()
app_css = open("src/app.html", encoding="utf8").read().split("/*__KATEX_CSS__*/", 1)[1].split("</style>", 1)[0]
body = src.split("</style>", 1)[1].split("<script>", 1)[0]
# XHTML fixes: void elements, boolean attributes, svg namespace.
body = re.sub(r"<(input|br|img)\b([^>]*?)\s*/?>", r"<\1\2/>", body)
body = re.sub(r"(<[a-z][^<>]*?)\s(hidden|disabled|readonly)(?=[\s>/])(?!=)", r'\1 \2="\2"', body)
body = re.sub(r"<svg(?![^>]*xmlns)", '<svg xmlns="http://www.w3.org/2000/svg"', body)
OUT = "epub-out"; O = OUT + "/OEBPS"
shutil.rmtree(OUT, ignore_errors=True)
shutil.copytree("../pilot-build/out/OEBPS/fonts", O + "/fonts")
os.makedirs(O + "/css"); os.makedirs(O + "/js"); os.makedirs(OUT + "/META-INF")
shutil.copy("../pilot-build/out/OEBPS/css/katex.css", O + "/css/katex.css")
book_css = """
/* Book overrides: the reader supplies page margins; nothing may reach past the page edge. */
html, body { max-width: 100%; overflow-x: hidden; }
body { padding-left: 0; padding-right: 0; }
.bar { position: static; margin-inline: 0; padding-inline: 0; background: transparent; backdrop-filter: none; -webkit-backdrop-filter: none; }
.hero, .panel, .sphere-wrap, .screen-wrap, .next, .calc, .eq, .deep { max-width: 100%; }
.hero { min-height: 16rem; }
canvas, svg { max-width: 100%; }
/* The lab panel is taller than a landscape page. Let it break, but only between control groups,
   and keep the mission line, diagram, screen and fire button together. */
.lab > .panel { -webkit-column-break-inside: auto; break-inside: auto; }
.mission-now, .schematic, .screen-wrap, .fire { -webkit-column-break-after: avoid; break-after: avoid; }
.controls > * { -webkit-column-break-inside: avoid; break-inside: avoid; }
/* Books turns the page on a sideways drag, so the slider cannot be used there: the step buttons replace it. */
#energy { display: none; }
@media (max-height: 900px) { .screen-wrap { height: 200px; } .schematic { max-height: 56px; } }
/* Books did not paint the detector box; give it the same structure as the hero, which does paint. */
.screen-wrap { height: 240px; background: #05070f; }
.screen-wrap canvas, .screen-wrap #overlay { position: absolute; inset: 0; width: 100%; height: 100%; }
.screen-label, .screen-count { z-index: 2; display: block; }
/* Books shows pages: never split a panel, card or sphere across a page break. */
.panel, .mission, .card, .choice, .sphere-wrap, .screen-wrap, .flip, .next, .steps, figure, .eq { -webkit-column-break-inside: avoid; break-inside: avoid; page-break-inside: avoid; }
"""
open(O + "/css/app.css", "w").write(app_css + book_css)
shutil.copy("src/app.js", O + "/js/app.js")
xhtml = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>One Electron at a Time</title>
<link rel="stylesheet" type="text/css" href="css/katex.css"/><link rel="stylesheet" type="text/css" href="css/app.css"/></head>
<body>{body}<script src="js/app.js"></script></body></html>'''
open(O + "/chapter.xhtml", "w").write(xhtml)
open(O + "/nav.xhtml", "w").write('''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head><meta charset="UTF-8"/><title>Contents</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol><li><a href="chapter.xhtml">One electron at a time</a></li></ol></nav></body></html>''')
fonts = sorted(os.listdir(O + "/fonts"))
items = "\n    ".join(f'<item id="f{i}" href="fonts/{f}" media-type="font/woff2"/>' for i, f in enumerate(fonts))
mod = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
open(O + "/content.opf", "w").write(f'''<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="en" prefix="rendition: http://www.idpf.org/vocab/rendition/# ibooks: http://vocabulary.itunes.apple.com/rdf/ibooks/vocabulary-extensions-1.0/">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <meta property="rendition:layout">reflowable</meta><meta property="rendition:spread">none</meta><meta property="rendition:flow">scrolled-doc</meta><meta property="ibooks:specified-fonts">true</meta><meta property="ibooks:scroll-axis">vertical</meta>
    <dc:identifier id="uid">urn:uuid:{uuid.uuid4()}</dc:identifier><dc:title>One Electron at a Time</dc:title>
    <dc:language>en</dc:language><dc:creator>Quantum Book project</dc:creator><meta property="dcterms:modified">{mod}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch" href="chapter.xhtml" media-type="application/xhtml+xml" properties="scripted mathml svg"/>
    <item id="kcss" href="css/katex.css" media-type="text/css"/><item id="css" href="css/app.css" media-type="text/css"/>
    <item id="js" href="js/app.js" media-type="application/javascript"/>
    {items}
  </manifest>
  <spine><itemref idref="ch"/></spine>
</package>''')
open(OUT + "/META-INF/container.xml", "w").write('''<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>''')
open(OUT + "/META-INF/com.apple.ibooks.display-options.xml", "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<display_options><platform name="*"><option name="specified-fonts">true</option><option name="interactive">true</option></platform></display_options>')
open(OUT + "/mimetype", "w").write("application/epub+zip")
