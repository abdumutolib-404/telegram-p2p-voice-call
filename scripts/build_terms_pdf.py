"""Export the published PairTalk terms and recording policy as a versioned bot PDF.

Requires reportlab and pypdf. Run from any directory. Publishing a new legal
version requires changing VERSION, reviewing the PDF, and committing the asset
and manifest together. This command never changes the website's policies.
"""
from pathlib import Path
import hashlib
import html
import json
import re
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
VERSION = "2026-10-07"
manifest_path = ROOT / "server/assets/terms-manifest.json"
if manifest_path.exists() and json.loads(manifest_path.read_text(encoding="utf-8"))["version"] == VERSION:
    raise SystemExit("This terms version is already published. Review the changes and choose a new VERSION before exporting; existing accepted documents must not be overwritten.")
source = (ROOT / "landing/src/content.tsx").read_text(encoding="utf-8")

def sections(route):
    block = source.split(f'"{route}": {{', 1)[1].split('\n  },', 1)[0]
    result = {}
    for match in re.finditer(r'id: "([^"]+)",\s*title: "([^"]+)",\s*body: \((.*?)\n\s*\),', block, re.S):
        paragraphs = []
        for text in re.findall(r"<p>(.*?)</p>", match[3], re.S):
            text = re.sub(r'\{\s*" "\s*\}', " ", text)
            text = html.unescape(re.sub(r"<[^>]+>", "", text))
            text = " ".join(text.split()).translate(str.maketrans({"\u2013": "-", "\u2014": "-", "\u2011": "-", "\u2019": "'", "\u201c": '"', "\u201d": '"'}))
            paragraphs.append(text)
        result[match[1]] = (match[2], paragraphs)
    return result

terms, privacy = sections("/terms"), sections("/privacy")
assert len(terms) == 6 and len(privacy) == 5, "Published policy format changed; review the exporter."
# Verify that the public wording still matches the implemented refund rule.
refund = terms['payments'][1][1]
refund_rule = 'The current bot refund policy allows a request within 48 hours of purchase or when less than 10% of the purchased allowance has been used.'
assert refund_rule in refund, 'Review the published refund rule before exporting a new agreement.'
output = ROOT / "output/pdf/pairtalk-terms-of-use.pdf"
output.parent.mkdir(parents=True, exist_ok=True)
asset = ROOT / "server/assets/pairtalk-terms-of-use.pdf"
asset.parent.mkdir(parents=True, exist_ok=True)
ink, mint = colors.HexColor("#182523"), colors.HexColor("#B8EFCE")
body = ParagraphStyle("Body", fontName="Helvetica", fontSize=10.2, leading=15.4, textColor=ink, spaceAfter=10)
heading = ParagraphStyle("Heading", parent=body, fontName="Helvetica-Bold", fontSize=13, leading=18, spaceBefore=16, spaceAfter=8, keepWithNext=True)
small = ParagraphStyle("Small", parent=body, fontSize=9, leading=13, textColor=colors.HexColor("#52635C"))
title = ParagraphStyle("Title", parent=body, fontName="Helvetica-Bold", fontSize=29, leading=34, spaceAfter=16)
story = []

def section(item):
    label, paragraphs = item
    story.append(Paragraph(escape(label), heading))
    story.extend(Paragraph(escape(text), body) for text in paragraphs)

story.extend([Paragraph("TERMS OF USE", small), Paragraph("Practicing together,<br/>with clear terms.", title), Paragraph(f"PairTalk | Document version {VERSION}", small), Spacer(1, 10), Paragraph("Read this document before registering. In the Telegram bot, choose Agree and continue to accept this version, or Decline to stop registration. Your acceptance does not replace the separate agreement required for recording a call.", body)])
section(terms["eligibility"])
story.append(Paragraph('You must also meet <link href="https://telegram.org/tos" color="#245C43">Telegram\'s account eligibility rules</link>. Where Telegram requires a higher minimum age, that minimum applies; guardian permission does not bypass it.', body))
section(terms["service"])
story.append(PageBreak())
story.append(Paragraph("Payments & service conditions", title))
section(terms["payments"])
section(terms["intellectual-property"])
story.append(Spacer(1, 16))
story.append(Paragraph('Published policies: <link href="https://pairtalk.online/terms" color="#245C43">pairtalk.online/terms</link> and <link href="https://pairtalk.online/privacy#refunds" color="#245C43">pairtalk.online/privacy#refunds</link>. The refund eligibility in this PDF reflects the current bot rule. Current allowances and prices must be checked before purchase.', small))
story.append(PageBreak())
story.append(Paragraph("Privacy, recordings & support", title))
section(privacy["account-data"])
section(privacy["audio"])
section(terms["liability"])
section(terms["changes"])
story.append(Paragraph('Read the complete <link href="https://pairtalk.online/privacy" color="#245C43">privacy policy</link>, <link href="https://pairtalk.online/community-guidelines" color="#245C43">community guidelines</link> and <link href="https://pairtalk.online/safety" color="#245C43">safety guide</link>. Contact: <link href="https://t.me/PairTalkSupport" color="#245C43">@PairTalkSupport</link>. These links are part of the published policy references.', small))

def decorate(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(ink)
    canvas.rect(0, 800, 595.28, 42, fill=1, stroke=0)
    canvas.setFillColor(mint)
    canvas.setFont("Helvetica-Bold", 12)
    canvas.drawString(48, 815, "PairTalk")
    canvas.setFont("Helvetica", 9)
    canvas.drawRightString(547, 815, "TERMS OF USE")
    canvas.setStrokeColor(colors.HexColor("#DFE8E1"))
    canvas.line(48, 44, 547, 44)
    canvas.setFillColor(colors.HexColor("#52635C"))
    canvas.setFont("Helvetica", 8)
    canvas.drawString(48, 29, f"Version {VERSION} | PairTalk speaking practice")
    canvas.drawRightString(547, 29, f"{doc.page}")
    canvas.restoreState()

doc = SimpleDocTemplate(str(output), pagesize=(595.28, 841.89), leftMargin=48, rightMargin=48, topMargin=70, bottomMargin=60, title="PairTalk Terms of Use", author="PairTalk", pageCompression=1, invariant=1)
doc.build(story, onFirstPage=decorate, onLaterPages=decorate)
reader = PdfReader(output)
text = "\n".join(page.extract_text() for page in reader.pages)
assert len(reader.pages) == 3, "Review page layout: expected three pages."
for label, paragraphs in list(terms.values()) + [privacy["account-data"], privacy["audio"]]:
    assert label in text, f"Missing section: {label}"
    for paragraph in paragraphs:
        assert " ".join(paragraph.split()) in " ".join(text.split()), f"Missing policy text: {label}"
asset.write_bytes(output.read_bytes())
manifest = {"version": VERSION, "filename": asset.name, "sha256": hashlib.sha256(asset.read_bytes()).hexdigest(), "source": "landing/src/content.tsx", "termsUrl": "https://pairtalk.online/terms", "privacyUrl": "https://pairtalk.online/privacy"}
(asset.parent / "terms-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
(ROOT / "gateway/internal/auth/terms.go").write_text(f'package auth\n\n// Matches the deployed PDF manifest. Update using scripts/build_terms_pdf.py.\nconst TermsVersion = "{VERSION}"\nconst TermsDocumentSHA256 = "{manifest["sha256"]}"\n', encoding="utf-8")
print(f"Created {len(reader.pages)} pages. Version {VERSION}; SHA-256 {manifest['sha256']}")
