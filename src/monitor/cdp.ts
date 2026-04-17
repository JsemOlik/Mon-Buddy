const CDP_BASE = "http://127.0.0.1:9222";

interface CdpMsg {
  id?: number;
  method?: string;
  result?: unknown;
  error?: { message: string };
  params?: unknown;
}

export interface CdpPage {
  goto(url: string, timeoutMs?: number): Promise<void>;
  waitForSelector(selector: string, timeoutMs?: number): Promise<void>;
  content(): Promise<string>;
  close(): Promise<void>;
}

class CdpPageImpl implements CdpPage {
  private msgId = 1;
  private callbacks = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private eventHandlers = new Map<string, Array<(params: unknown) => void>>();

  constructor(
    private ws: WebSocket,
    private targetId: string,
  ) {
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data as string) as CdpMsg;

      if (msg.id !== undefined) {
        const cb = this.callbacks.get(msg.id);
        if (cb) {
          this.callbacks.delete(msg.id);
          if (msg.error) cb.reject(new Error(msg.error.message));
          else cb.resolve(msg.result);
        }
      }

      if (msg.method) {
        for (const handler of this.eventHandlers.get(msg.method) ?? []) {
          handler(msg.params);
        }
      }
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  private waitForEvent(event: string, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const handlers = this.eventHandlers.get(event) ?? [];
      this.eventHandlers.set(event, handlers);

      const handler = (params: unknown) => {
        clearTimeout(timer);
        const idx = handlers.indexOf(handler);
        if (idx !== -1) handlers.splice(idx, 1);
        resolve(params);
      };

      const timer = setTimeout(() => {
        const idx = handlers.indexOf(handler);
        if (idx !== -1) handlers.splice(idx, 1);
        reject(new Error(`Timeout waiting for CDP event: ${event}`));
      }, timeoutMs);

      handlers.push(handler);
    });
  }

  async goto(url: string, timeoutMs = 20_000): Promise<void> {
    // Register listener BEFORE sending navigate to avoid missing a fast-firing event
    const domReady = this.waitForEvent("Page.domContentEventFired", timeoutMs);
    await this.send("Page.navigate", { url });
    await domReady;
  }

  async waitForSelector(selector: string, timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await this.send("Runtime.evaluate", {
        expression: `document.querySelector(${JSON.stringify(selector)}) !== null`,
        returnByValue: true,
      }) as { result?: { value?: boolean } };
      if (res?.result?.value === true) return;
      await Bun.sleep(300);
    }
    throw new Error(`Selector "${selector}" not found within ${timeoutMs}ms`);
  }

  async content(): Promise<string> {
    const res = await this.send("Runtime.evaluate", {
      expression: "document.documentElement.outerHTML",
      returnByValue: true,
    }) as { result?: { value?: string } };
    return res?.result?.value ?? "";
  }

  async close(): Promise<void> {
    this.ws.close();
    await fetch(`${CDP_BASE}/json/close/${this.targetId}`).catch(() => {});
  }
}

export async function openPage(): Promise<CdpPage> {
  const res = await fetch(`${CDP_BASE}/json/new`);
  const tab = await res.json() as { id: string; webSocketDebuggerUrl: string };

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("CDP WebSocket timed out")), 5_000);
    ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP WebSocket error")); }, { once: true });
  });

  const page = new CdpPageImpl(ws, tab.id);
  await page.send("Page.enable");
  return page;
}
