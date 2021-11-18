#!/bin/bash

set -e

npm run build

TMP="$(mktemp -d)"

cleanup()
{
    echo "Cleaning up temporary directory $TMP"
    rm -r "$TMP"
}

trap cleanup EXIT

cp "./dist/main.js" "$TMP/index.js"

cd "$TMP" || exit 1
tar c . > "$OLDPWD/bbcp-build.tar" || exit 1

echo "[+] Built bbcp-build.tar"
