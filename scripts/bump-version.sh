#!/bin/sh
# Stamp every local asset reference with a fresh ?v= so a deploy is fetched
# as one consistent set (GitHub Pages lets browsers cache files for 10 min,
# and a page mixing old and new files can break).
set -e
cd "$(dirname "$0")/.."
V=$(date +%Y%m%d%H%M%S)
for f in index.html nights/index.html log/index.html; do
  sed -i '' -E "s#(href|src)=\"([^\":]*\.(css|js))(\?v=[0-9]+)?\"#\1=\"\2?v=$V\"#g" "$f"
done
for f in nights/app.js log/app.js assets/*.js; do
  sed -i '' -E "s#from \"(\.{1,2}/[^\"?]+\.js)(\?v=[0-9]+)?\"#from \"\1?v=$V\"#g" "$f"
done
echo "$V"
