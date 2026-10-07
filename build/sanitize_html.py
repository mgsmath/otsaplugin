"""Whitelist HTML sanitiser + footnote extractor for Sefaria's English text.

Sefaria's exported text contains inline HTML: ``<b>``/``<i>`` for the Steinsaltz
bold-lead words, ``<small>``, and footnote markup of the form::

    ...text<sup class="footnote-marker">*</sup><i class="footnote">note text</i>

Two jobs happen here, at build time:

1. **Sanitise.** Only a small tag whitelist survives, all attributes are dropped
   except ``class`` on the footnote markers, and every text node is escaped. The
   runtime re-sanitises with ``DOMParser`` before touching ``innerHTML`` — this
   is the first of two independent gates, not the only one.
2. **Extract footnotes.** ``<i class="footnote">`` blocks are pulled out into a
   separate list so the UI can render them as an optional expandable note instead
   of breaking up the reading line.
"""

from __future__ import annotations

from html import escape
from html.parser import HTMLParser
from typing import List, Optional, Tuple

# Tags that survive. Anything else is dropped (its text content is kept).
ALLOWED_TAGS = {
    "b", "strong", "i", "em", "u", "s", "small", "big", "sup", "sub", "br", "span",
}

# Tags whose content is removed entirely (never reached for Sefaria text today,
# but explicit is better than an accident).
DROP_CONTENT_TAGS = {"script", "style", "head", "title", "meta", "link"}

# Tags treated as a hard break in the reading flow.
BREAK_TAGS = {"br"}

# Class values allowed on <span>/<sup>/<i>.
FOOTNOTE_MARKER_CLASS = "footnote-marker"
FOOTNOTE_BODY_CLASS = "footnote"


class _ExtractingParser(HTMLParser):
    def __init__(self) -> None:
        # convert_charrefs=False so we see entity references verbatim and can
        # re-escape text nodes ourselves.
        super().__init__(convert_charrefs=False)
        self._out: List[str] = []
        self._notes: List[str] = []
        self._skip_depth = 0
        # None = not inside a footnote. 0 would be a depth, and `is not None`
        # would swallow the whole segment into the note buffer.
        self._note_depth: Optional[int] = None
        self._note_buf: List[str] = []
        self._depth = 0

    # -- helpers ------------------------------------------------------------
    def _emit(self, text: str) -> None:
        if self._skip_depth:
            return
        if self._note_depth is not None:
            self._note_buf.append(text)
        else:
            self._out.append(text)

    # -- HTMLParser API -----------------------------------------------------
    def handle_starttag(self, tag, attrs):
        self._depth += 1
        tag = tag.lower()
        if tag in DROP_CONTENT_TAGS:
            self._skip_depth += 1
            return
        classes = {c.strip() for c in dict(attrs).get("class", "").split() if c.strip()}
        if tag == "i" and FOOTNOTE_BODY_CLASS in classes:
            if self._note_depth is None:
                self._note_depth = self._depth
            return
        if not self._skip_depth:
            if tag in BREAK_TAGS:
                self._emit("\n")
            elif tag in ALLOWED_TAGS:
                cls = ""
                if tag in ("sup", "span") and FOOTNOTE_MARKER_CLASS in classes:
                    cls = f' class="{FOOTNOTE_MARKER_CLASS}"'
                self._emit(f"<{tag}{cls}>")

    def handle_startendtag(self, tag, attrs):
        tag = tag.lower()
        if tag in DROP_CONTENT_TAGS:
            return
        if tag in BREAK_TAGS and not self._skip_depth:
            self._emit("\n")

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in DROP_CONTENT_TAGS:
            if self._skip_depth:
                self._skip_depth -= 1
            self._depth -= 1
            return
        if self._note_depth is not None and self._depth == self._note_depth:
            note = "".join(self._note_buf).strip()
            if note:
                self._notes.append(_collapse_ws(note))
            self._note_depth = None
            self._note_buf = []
            self._depth -= 1
            return
        if tag in ALLOWED_TAGS and tag not in BREAK_TAGS:
            if not self._skip_depth:
                self._emit(f"</{tag}>")
        self._depth -= 1

    def handle_data(self, data):
        if data:
            self._emit(escape(data, quote=False))

    def handle_entityref(self, name):
        # Re-escape so "&amp;" cannot smuggle markup past the runtime gate.
        self._emit(f"&{name};")

    def handle_charref(self, name):
        self._emit(f"&#{name};")


def _collapse_ws(text: str) -> str:
    return " ".join(text.split())


def sanitize_english(raw: Optional[str]) -> Tuple[str, List[str]]:
    """Return ``(safe_html, footnotes)`` for one Sefaria English segment.

    ``safe_html`` may be empty when the segment is empty. Footnote markers that
    survive in the text are renumbered by the caller if needed.
    """
    if not raw:
        return "", []
    parser = _ExtractingParser()
    try:
        parser.feed(raw)
        parser.close()
    except Exception:
        # Malformed markup: fall back to fully escaped plain text. This can never
        # inject markup, which is the only invariant that matters here.
        return escape(raw, quote=False), []
    text = "".join(parser._out)
    text = _collapse_ws(text)
    # A stray footnote marker with no note body is noise; drop it.
    if not parser._notes:
        text = text.replace(f'<sup class="{FOOTNOTE_MARKER_CLASS}">*</sup>', "")
        text = text.replace(f'<sup class="{FOOTNOTE_MARKER_CLASS}"></sup>', "")
        text = _collapse_ws(text)
    return text, parser._notes


def plain_text(safe_html: str) -> str:
    """Text-only projection of sanitised HTML (used for search/preview/length)."""
    import re

    return _collapse_ws(re.sub(r"<[^>]*>", "", safe_html or ""))
