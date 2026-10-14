#!/usr/bin/env python3
"""Print a rendered page's visible text, for assertions in shell scripts.

The raw response contains the server-rendered DOM *plus* the serialized React
Server Component payload, so a plain `grep` over the response double-counts
every string and sees text split across nodes. This strips <script> and <style>
blocks and collapses tags to single spaces.

Usage: page-body.py <page.html>
"""
import html
import re
import sys

markup = open(sys.argv[1]).read()
markup = re.sub(r"<(script|style)\b.*?</\1>", " ", markup, flags=re.S)
text = html.unescape(re.sub(r"<[^>]+>", " ", markup))
print(re.sub(r"\s+", " ", text))
