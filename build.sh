#!/bin/bash

set -e

npm run build

TMP="$(mktemp --suffix=-rwcp-build -d)"

cleanup()
{
    echo "Cleaning up temporary directory $TMP"
    rm -r "$TMP"
}

trap cleanup EXIT

cp "./dist/main.js" "$TMP/index.js"
cp -r ./res "$TMP/"

cd "$TMP" || exit 1
tar c . > "$OLDPWD/rwcp-build.tar" || exit 1

echo "[+] Built rwcp-build.tar"
