#!/bin/sh
# Headless Chromium on a GPU-less Linux box: WebGL needs SwiftShader, and root
# needs --no-sandbox. A wrapper keeps every puppeteer tool unchanged.
exec /opt/pw-browsers/chromium --no-sandbox --enable-unsafe-swiftshader --use-angle=swiftshader --ignore-gpu-blocklist --disable-features=CanvasNoise,EnableCanvasNoise "$@"
