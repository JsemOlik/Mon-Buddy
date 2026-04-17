import { chromium, type Browser } from "playwright";
import type { Subprocess } from "bun";

let _browser: Browser | null = null;
let _proc: Subprocess | null = null;
let _initPromise: Promise<Browser> | null = null;

async function waitForCDP(port: number): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {}
    await Bun.sleep(200);
  }
  throw new Error("Chromium CDP endpoint did not start within 6s");
}

async function launch(): Promise<Browser> {
  const port = 9222;
  const execPath = chromium.executablePath();

  console.log(`[browser] Spawning Chromium on port ${port}`);

  // Use Bun.spawn instead of Playwright's launch() — chromium.launch() hangs
  // in Bun because Playwright's Node.js child_process subprocess stderr reading
  // is not compatible with Bun's child_process emulation.
  _proc?.kill();
  _proc = Bun.spawn(
    [
      execPath,
      "--headless=new",
      `--remote-debugging-port=${port}`,
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-background-networking",
    ],
    { stdout: "ignore", stderr: "ignore" },
  );

  await waitForCDP(port);
  console.log(`[browser] CDP ready, connecting`);

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  _browser = browser;
  return browser;
}

export async function getBrowser(): Promise<Browser> {
  if (_browser?.isConnected()) return _browser;
  // Deduplicate concurrent launch attempts — all callers wait on the same promise
  if (!_initPromise) {
    _initPromise = launch().finally(() => { _initPromise = null; });
  }
  return _initPromise;
}

export async function closeBrowser(): Promise<void> {
  try { await _browser?.close(); } catch {}
  _browser = null;
  _proc?.kill();
  _proc = null;
}
