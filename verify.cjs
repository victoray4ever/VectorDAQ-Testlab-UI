const { writeFileSync } = require("node:fs");
const { chromium } = require("/Users/mathewlittle/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const { PNG } = require("/Users/mathewlittle/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pngjs");

const url = "http://127.0.0.1:4173";

function analyzePng(buffer) {
  const png = PNG.sync.read(buffer);
  let bright = 0;
  let cyan = 0;
  let yellowRed = 0;
  let nonDark = 0;
  const buckets = new Set();

  for (let y = 0; y < png.height; y += 3) {
    for (let x = 0; x < png.width; x += 3) {
      const idx = (png.width * y + x) << 2;
      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum > 32) nonDark += 1;
      if (lum > 95) bright += 1;
      if (b > 120 && g > 105 && r < 80) cyan += 1;
      if ((r > 170 && g > 115 && b < 95) || (r > 170 && g < 95 && b < 80)) yellowRed += 1;
      buckets.add(`${r >> 4},${g >> 4},${b >> 4}`);
    }
  }

  return { width: png.width, height: png.height, bright, cyan, yellowRed, nonDark, colorBuckets: buckets.size };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("#waterfallMount canvas");
  await page.waitForTimeout(900);

  const chartBox = await page.locator(".chart-frame").boundingBox();
  const canvasBox = await page.locator("#waterfallMount canvas").boundingBox();
  const desktopShot = await page.screenshot({ path: "verification-desktop.png", fullPage: true });
  const chartShot = await page.screenshot({ clip: chartBox });
  writeFileSync("verification-chart.png", chartShot);
  const chartStats = analyzePng(chartShot);

  const sceneState = await page.evaluate(() => {
    const canvas = document.querySelector("#waterfallMount canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    return {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      webgl: Boolean(gl),
      rpm: document.querySelector("#rpmReadout").textContent,
      freq: document.querySelector("#freqReadout").textContent,
      amp: document.querySelector("#ampReadout").textContent
    };
  });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 900 }, isMobile: true });
  await mobile.goto(url, { waitUntil: "networkidle" });
  await mobile.waitForSelector("#waterfallMount canvas");
  await mobile.waitForTimeout(700);
  await mobile.screenshot({ path: "verification-mobile.png", fullPage: true });
  const mobileState = await mobile.evaluate(() => {
    const canvas = document.querySelector("#waterfallMount canvas");
    const overflow = [...document.querySelectorAll("button, .metric, .chart-readouts span")]
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .map((el) => el.textContent.trim().slice(0, 40));
    return { canvasWidth: canvas.width, canvasHeight: canvas.height, overflow };
  });

  await browser.close();

  const result = { consoleErrors, canvasBox, chartStats, sceneState, mobileState };
  console.log(JSON.stringify(result, null, 2));

  if (consoleErrors.length) process.exitCode = 1;
  if (!sceneState.webgl || sceneState.canvasWidth < 500 || sceneState.canvasHeight < 300) process.exitCode = 1;
  if (chartStats.bright < 180 || chartStats.cyan < 60 || chartStats.yellowRed < 10 || chartStats.colorBuckets < 80) process.exitCode = 1;
  if (mobileState.canvasWidth < 300 || mobileState.canvasHeight < 360) process.exitCode = 1;
})();
