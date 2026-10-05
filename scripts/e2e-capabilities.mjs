/** Read-only runtime preflight: fail clearly if a required port lacks WebRTC. */
import { strict as assert } from "node:assert";
import { chromium, webkit } from "playwright";

const origin = new URL(process.env.APP_URL ?? "http://127.0.0.1:4173").origin;
const required = (process.env.E2E_RTC_ENGINES ?? "chromium,webkit").split(",");
for (const [engine, type] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const browser = await type.launch(
    engine === "chromium"
      ? { channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" }
      : {},
  );
  try {
    const page = await browser.newPage();
    await page.goto(origin);
    const capabilities = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      secureContext: isSecureContext,
      webCrypto: typeof crypto?.subtle?.digest === "function",
      peerConnection: typeof RTCPeerConnection === "function",
      dataChannel:
        typeof RTCPeerConnection !== "undefined" &&
        typeof RTCPeerConnection.prototype.createDataChannel === "function",
    }));
    console.log(
      JSON.stringify({
        platform: process.platform,
        engine,
        required: required.includes(engine),
        ...capabilities,
      }),
    );
    if (required.includes(engine)) {
      assert(
        capabilities.secureContext && capabilities.webCrypto,
        `${engine}: secure WebCrypto is required`,
      );
      assert(
        capabilities.peerConnection && capabilities.dataChannel,
        `${engine}: this browser port lacks native WebRTC; use a supported port for transfer verification`,
      );
    }
  } finally {
    await browser.close();
  }
}
