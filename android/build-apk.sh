#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
sdk="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
: "${sdk:?Set ANDROID_SDK_ROOT to your Android SDK directory}"
: "${JAVA_HOME:?Set JAVA_HOME to your JDK directory}"
tools="$sdk/build-tools/35.0.0"
platform="$sdk/platforms/android-35/android.jar"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

mkdir -p "$scratch/classes" "$scratch/dex" output
"$tools/aapt2" compile --dir res -o "$scratch/resources.zip"
"$tools/aapt2" link -I "$platform" --manifest AndroidManifest.xml \
  --java "$scratch" -o "$scratch/unsigned.apk" "$scratch/resources.zip"
"$JAVA_HOME/bin/javac" --release 8 -classpath "$platform" -d "$scratch/classes" \
  "$scratch/in/moneypayee/app/R.java" src/in/moneypayee/app/MainActivity.java
"$JAVA_HOME/bin/jar" cf "$scratch/classes.jar" -C "$scratch/classes" .
"$tools/d8" --lib "$platform" --min-api 24 --output "$scratch/dex" "$scratch/classes.jar"
(cd "$scratch/dex" && zip -q -j "$scratch/unsigned.apk" classes.dex)
"$tools/zipalign" -f 4 "$scratch/unsigned.apk" "$scratch/aligned.apk"

keystore="${MONEYPAYEE_DEBUG_KEYSTORE:-${TMPDIR:-/tmp}/moneypayee-debug.keystore}"
if [[ ! -f "$keystore" ]]; then
  "$JAVA_HOME/bin/keytool" -genkeypair -noprompt -keystore "$keystore" \
    -storepass android -keypass android -alias androiddebugkey -keyalg RSA -keysize 2048 \
    -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
fi
"$tools/apksigner" sign --ks "$keystore" --ks-key-alias androiddebugkey \
  --ks-pass pass:android --key-pass pass:android --out "$scratch/MoneyPayee.apk" "$scratch/aligned.apk"
"$tools/apksigner" verify --verbose "$scratch/MoneyPayee.apk"
cp "$scratch/MoneyPayee.apk" output/MoneyPayee.apk
