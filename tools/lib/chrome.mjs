/**
 * Where headless Chrome lives. Every tool used to hard-code the macOS path,
 * which made the whole toolchain dead on a Linux box (the cloud sessions).
 * Order: $CHROME, the macOS app, the Playwright Chromium, the usual Linux names.
 */
import { existsSync } from 'node:fs';

const CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  // wrapper adds --no-sandbox + SwiftShader; see chrome-linux.sh
  existsSync('/opt/pw-browsers/chromium') ? new URL('./chrome-linux.sh', import.meta.url).pathname : null,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

export const CHROME = CANDIDATES.find((p) => existsSync(p)) || CANDIDATES[0];
