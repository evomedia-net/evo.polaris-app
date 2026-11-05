#!/usr/bin/env bash
# evomedia.net evo.polaris-app — https://github.com/evomedia-net/evo.polaris-app
# Created by Kelly Michels · dev@evomedia.net
# Licensed under the MIT License. See LICENSE.
#
# Run the Appium suite against the emulator that is already booted: start the
# Appium server, wait until it answers, run pytest, stop the server, and exit
# with pytest's status. CI calls it from the repository root with the APK path;
# it works the same from a terminal on any machine with a device attached.
#
#   bash e2e/run-ci.sh path/to/app-debug.apk
#
# Needs JAVA_HOME: Appium verifies the APK's signature with Java's tools.

set -u
apk="$(realpath "${1:?usage: run-ci.sh path/to/app.apk}")"
cd "$(dirname "$0")"
mkdir -p artifacts

# A server already on the port would answer for this run with whatever
# environment it was started in, so refuse rather than test against it.
if curl -fs http://127.0.0.1:4723/status > /dev/null; then
  echo "Something is already answering on port 4723; stop it first."
  exit 1
fi

# node itself, not npm run: killing npm leaves the server running underneath it.
node node_modules/appium/index.js --port 4723 \
  --allow-insecure uiautomator2:chromedriver_autodownload \
  --log-timestamp --log-no-colors > artifacts/appium.log 2>&1 &
appium=$!
trap 'kill "$appium" 2>/dev/null' EXIT

for _ in $(seq 1 60); do
  curl -fs http://127.0.0.1:4723/status > /dev/null && break
  sleep 1
done
curl -fs http://127.0.0.1:4723/status > /dev/null || { echo "Appium did not start; see artifacts/appium.log"; exit 1; }

POLARIS_APK="$apk" python -m pytest -v -p no:cacheprovider --junitxml=artifacts/junit.xml
