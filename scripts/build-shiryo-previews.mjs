import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../frontend", import.meta.url));
const directory = new URL("../frontend/previews/shiryo/", import.meta.url);
const server = await createServer({ root, server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false, watch: null } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/shiryo.html`);
  await page.locator('[data-sheet="worksheet"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const previews = await page.evaluate(async () => {
    const { SHEETS, buildSheet } = await import("/src/cheatsheet-data.js");
    const { toSVG } = await import("/src/cheatsheet-export.js");
    const { PAGE, paginateReference } = await import("/src/cheatsheet-layout.js");
    const { worksheetSVG } = await import("/src/worksheet.js");
    const samples = SHEETS.map(({ id }) => {
      const sheet = buildSheet(id);
      const rows = ["ambiguities", "grammar-contrasts"].includes(id) ? 4 : id === "radicals" ? 18 : 12;
      const first = ["kana", "verb", "adjective"].includes(id) ? sheet : paginateReference(sheet, rows, PAGE)[0];
      return { id, title: sheet.title, svg: toSVG(first, { page: PAGE }) };
    });
    samples.push({ id: "worksheet", title: "Handwriting Practice", svg: worksheetSVG(["日", "本", "語", "学", "生", "大", "山", "川", "田", "人", "月", "火"], { font: "" }) });
    const results = [];
    for (const { id, title, svg } of samples) {
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        // Only these pixels leave the build machine; no full image or removable overlay is published.
        const canvas = document.createElement("canvas");
        canvas.width = 794;
        canvas.height = 450;
        const context = canvas.getContext("2d");
        context.fillStyle = "white";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);
        context.font = "bold 27px sans-serif";
        context.fillStyle = "rgba(110, 45, 45, 0.52)";
        for (let y = 85; y < 500; y += 75) {
          for (let x = -90; x < 800; x += 300) {
            context.save();
            context.translate(x, y);
            context.rotate(-Math.PI / 9);
            context.fillText("NIHONGO · SAMPLE", 0, 0);
            context.restore();
          }
        }
        const tab = document.querySelector(`#sheetPicker [data-sheet="${id}"]`);
        results.push({ id, title, label: tab.lastElementChild.textContent, icon: tab.querySelector(".sheet-tab-icon").textContent,
          hue: tab.style.getPropertyValue("--tab-hue"), png: canvas.toDataURL("image/png").split(",")[1] });
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    return results;
  });
  await mkdir(directory, { recursive: true });
  for (const { id, png } of previews) await writeFile(new URL(`${id}.png`, directory), Buffer.from(png, "base64"));
  await writeFile(new URL("manifest.json", directory), `${JSON.stringify(previews.map(({ png, ...metadata }) => metadata), null, 2)}\n`);
  console.log(`Generated ${previews.length} cropped, watermarked previews.`);
} finally {
  await browser?.close();
  await server.close();
}
