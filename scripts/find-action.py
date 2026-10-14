#!/usr/bin/env python3
"""Print the hidden server-action field name for an action in an HTML page.

vinext renders server-action forms with a hidden input named
`$ACTION_ID_<hash>#<actionName>`, so the field name identifies which action a
form calls. Usage: find-action.py <page.html> <actionName>
"""
import re
import sys

html, name = open(sys.argv[1]).read(), sys.argv[2]
pattern = r'name="(\$ACTION_ID_[^"#]*#' + re.escape(name) + r')"'
match = re.search(pattern, html)
print(match.group(1) if match else "")
