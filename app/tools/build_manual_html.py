"""Build manual.html from manual.md without external dependencies.

The converter intentionally supports the Markdown subset used by manual.md:
headings, paragraphs, fenced code blocks, pipe tables, ordered/unordered lists,
images, horizontal rules, and inline code. The generated HTML is meant for
browser print-to-PDF or Playwright/Chromium PDF export.
"""
from __future__ import annotations

import html
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
MD_PATH = ROOT / "manual.md"
CSS_PATH = ROOT / "manual.css"
HTML_PATH = ROOT / "manual.html"


def inline(text: str) -> str:
    escaped = html.escape(text, quote=False)
    return re.sub(r"`([^`]+)`", lambda m: f"<code>{m.group(1)}</code>", escaped)


def slugify(text: str) -> str:
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"[^\w가-힣.-]+", "-", text.strip(), flags=re.UNICODE)
    text = text.strip("-").lower()
    return text or "section"


def split_table_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def is_table_sep(line: str) -> bool:
    cells = split_table_row(line)
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", c or "") for c in cells)


def render_table(lines: list[str]) -> str:
    header = split_table_row(lines[0])
    body_lines = lines[2:] if len(lines) > 1 and is_table_sep(lines[1]) else lines[1:]
    cls = ' class="toc-table"' if header[:2] == ["장", "제목"] else ""
    out = [f"<table{cls}>", "<thead><tr>"]
    out.extend(f"<th>{inline(cell)}</th>" for cell in header)
    out.append("</tr></thead>")
    if body_lines:
        out.append("<tbody>")
        for row in body_lines:
            cells = split_table_row(row)
            out.append("<tr>")
            out.extend(f"<td>{inline(cell)}</td>" for cell in cells)
            out.append("</tr>")
        out.append("</tbody>")
    out.append("</table>")
    return "\n".join(out)


def render_image(alt: str, src: str) -> str:
    safe_alt = html.escape(alt, quote=True)
    safe_src = html.escape(src, quote=True)
    caption = inline(alt)
    return f'<figure><img src="{safe_src}" alt="{safe_alt}"><figcaption>{caption}</figcaption></figure>'


def flush_paragraph(buf: list[str], out: list[str]) -> None:
    if buf:
        out.append(f"<p>{inline(' '.join(buf))}</p>")
        buf.clear()


def flush_list(list_items: list[tuple[str, str]], out: list[str]) -> None:
    if not list_items:
        return
    tag = "ol" if list_items[0][0] == "ol" else "ul"
    out.append(f"<{tag}>")
    for _, item in list_items:
        out.append(f"<li>{inline(item)}</li>")
    out.append(f"</{tag}>")
    list_items.clear()


def convert_markdown(md: str) -> str:
    lines = md.splitlines()
    out: list[str] = []
    para: list[str] = []
    list_items: list[tuple[str, str]] = []
    i = 0
    in_code = False
    code_buf: list[str] = []

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("```"):
            flush_paragraph(para, out)
            flush_list(list_items, out)
            if not in_code:
                in_code = True
                code_buf = []
            else:
                out.append("<pre><code>" + html.escape("\n".join(code_buf)) + "</code></pre>")
                in_code = False
            i += 1
            continue

        if in_code:
            code_buf.append(line)
            i += 1
            continue

        if not stripped:
            flush_paragraph(para, out)
            flush_list(list_items, out)
            i += 1
            continue

        if stripped.startswith("|") and stripped.endswith("|"):
            flush_paragraph(para, out)
            flush_list(list_items, out)
            table_lines = [line]
            i += 1
            while i < len(lines) and lines[i].strip().startswith("|") and lines[i].strip().endswith("|"):
                table_lines.append(lines[i])
                i += 1
            out.append(render_table(table_lines))
            continue

        heading = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if heading:
            flush_paragraph(para, out)
            flush_list(list_items, out)
            level = len(heading.group(1))
            text = heading.group(2).strip()
            hid = slugify(text)
            cls = ' class="chapter"' if level == 1 and re.match(r"^\d+\.", text) else ""
            out.append(f'<h{level}{cls} id="{hid}">{inline(text)}</h{level}>')
            i += 1
            continue

        if re.fullmatch(r"-{3,}", stripped):
            flush_paragraph(para, out)
            flush_list(list_items, out)
            out.append("<hr>")
            i += 1
            continue

        image = re.match(r"^!\[([^\]]*)\]\(([^)]+)\)$", stripped)
        if image:
            flush_paragraph(para, out)
            flush_list(list_items, out)
            out.append(render_image(image.group(1), image.group(2)))
            i += 1
            continue

        ordered = re.match(r"^\d+\.\s+(.+)$", stripped)
        unordered = re.match(r"^[-*]\s+(.+)$", stripped)
        if ordered or unordered:
            flush_paragraph(para, out)
            kind = "ol" if ordered else "ul"
            if list_items and list_items[0][0] != kind:
                flush_list(list_items, out)
            list_items.append((kind, (ordered or unordered).group(1)))
            i += 1
            continue

        flush_list(list_items, out)
        para.append(stripped)
        i += 1

    flush_paragraph(para, out)
    flush_list(list_items, out)
    if in_code:
        out.append("<pre><code>" + html.escape("\n".join(code_buf)) + "</code></pre>")
    return "\n".join(out)


def main() -> None:
    md = MD_PATH.read_text(encoding="utf-8")
    body = convert_markdown(md)
    css = CSS_PATH.read_text(encoding="utf-8")
    doc = f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WOONG AI 사용자 매뉴얼</title>
  <style>
{css}
  </style>
</head>
<body>
  <main>
{body}
  </main>
</body>
</html>
"""
    HTML_PATH.write_text(doc, encoding="utf-8", newline="\n")
    print(f"written: {HTML_PATH}")


if __name__ == "__main__":
    main()
