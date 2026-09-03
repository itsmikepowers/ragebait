#!/usr/bin/env node
/**
 * Screenshot the landing page at several viewports and timestamps.
 *
 * Captures the same page at two different times so the diff proves the ASCII
 * field is actually animating rather than rendering one static frame.
 */
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const crypto = require("crypto");

const BASE = "http://localhost:3111";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9471;

function cdp(path, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: PORT, path, method }, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => {
        try { resolve(JSON.parse(b)); } catch { reject(new Error(b.slice(0, 100))); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect(wsUrl) {
  const { WebSocket } = require("ws");
  const socket = new WebSocket(wsUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => { socket.once("open", res); socket.once("error", rej); });
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") {
      errors.push(m.params.exceptionDetails.text + " " + (m.params.exceptionDetails.exception?.description || ""));
    }
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      errors.push("console.error: " + m.params.args.map((a) => a.value ?? a.description ?? "?").join(" "));
    }
  });
  return {
    errors,
    send: (method, params = {}) =>
      new Promise((res) => { const mid = ++id; pending.set(mid, res); socket.send(JSON.stringify({ id: mid, method, params })); }),
  };
}

(async () => {
  fs.mkdirSync("/tmp/shots", { recursive: true });
  const profile = `/tmp/landing-${Date.now()}`;
  const proc = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "about:blank",
  ]);

  try {
    for (let i = 0; i < 60; i++) { try { await cdp("/json/version"); break; } catch { await sleep(500); } }
    const t = await cdp("/json/new?about:blank", "PUT");
    const page = await connect(t.webSocketDebuggerUrl);
    await page.send("Page.enable");
    await page.send("Runtime.enable");

    const ev = async (e) =>
      (await page.send("Runtime.evaluate", { expression: e, returnByValue: true })).result?.result?.value;

    const shoot = async (label, w, h) => {
      await page.send("Emulation.setDeviceMetricsOverride", {
        width: w, height: h, deviceScaleFactor: 2, mobile: w < 500,
      });
      await sleep(2500);
      const shot = await page.send("Page.captureScreenshot", { format: "png" });
      const file = `/tmp/shots/${label}.png`;
      fs.writeFileSync(file, Buffer.from(shot.result.data, "base64"));
      const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 12);
      console.log(`  ${label.padEnd(24)} ${w}x${h}  sha=${hash}`);
      return hash;
    };

    await page.send("Page.navigate", { url: `${BASE}/` });
    await sleep(4000);

    console.log("landing page:");
    console.log("  path:  ", await ev("location.pathname"));
    console.log("  text:  ", JSON.stringify(await ev("document.body.innerText")));
    console.log("  canvas:", await ev(`(() => { const c = document.querySelector('canvas'); return c ? c.width + "x" + c.height : "NO CANVAS"; })()`));
    console.log("");

    const a = await shoot("landing-desktop-t1", 1440, 900);
    await sleep(1800);
    const b = await shoot("landing-desktop-t2", 1440, 900);
    console.log(`  animating: ${a !== b ? "YES (frames differ)" : "NO — static!"}`);
    console.log("");
    await shoot("landing-mobile", 390, 844);
    await shoot("landing-wide", 1920, 1080);

    console.log("\nconsole errors:", page.errors.length ? page.errors : "none");
  } finally {
    proc.kill();
    await sleep(800);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
})().catch((e) => { console.error(e); process.exit(1); });
