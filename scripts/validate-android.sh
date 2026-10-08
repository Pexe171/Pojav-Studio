#!/bin/sh
set -eu
android --no-metrics sdk install platforms/android-37.0
test -f /opt/android-sdk/platforms/android-37.0/android.jar
if [ ! -f /secrets/studio.jks ]; then
  keytool -genkeypair -keystore /secrets/studio.jks -storepass:env APK_KEYSTORE_PASSWORD -keypass:env APK_KEY_PASSWORD -alias studio -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Pojav Studio'
fi
node /app/scripts/validate-android.mjs
