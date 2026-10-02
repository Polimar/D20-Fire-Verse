#!/usr/bin/env bash
# Fetch the Login with Amazon Android SDK into firetv/app/libs/.
#
# The SDK ships under Amazon's LWA Service Agreement and may not be redistributed, so it stays out
# of git. Without it the app still builds (with a stub) and the table offers the test account.
# The SDK also needs firetv/app/src/main/assets/api_key.txt — see docs/AMAZON_LOGIN.md.

set -euo pipefail

VERSION="${LWA_SDK_VERSION:-3.1.6}"
URL="https://amzndevresources.com/login-with-amazon/sdk/LoginWithAmazon-Android-${VERSION}.zip"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIBS="${HERE}/../app/libs"
JAR="${LIBS}/login-with-amazon-sdk.jar"

if [ -f "$JAR" ] && [ "${1:-}" != "--force" ]; then
  echo "Already there: ${JAR} (use --force to fetch again)"
  exit 0
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "Downloading Login with Amazon SDK ${VERSION}…"
curl -fsSL "$URL" -o "${WORK}/lwa.zip"

mkdir -p "$LIBS"
python3 - "${WORK}/lwa.zip" "$JAR" <<'PY'
import sys, zipfile
src, dest = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(src) as z:
    names = [n for n in z.namelist() if n.endswith("/lib/login-with-amazon-sdk.jar")]
    if not names:
        sys.exit("login-with-amazon-sdk.jar not found in the SDK archive")
    with z.open(names[0]) as jar, open(dest, "wb") as out:
        out.write(jar.read())
PY

echo "Saved ${JAR}"
echo "By using it you accept the Login with Amazon Service Agreement included in the SDK archive."
