import dotenv from "dotenv";
import puppeteer from "puppeteer";
import path from "node:path";
import fs from "node:fs";
dotenv.config();

const PUPPETEER_LAUNCH_OPTIONS = {
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
  ],
};

export function crearNavegadorPdf() {
  return puppeteer.launch(PUPPETEER_LAUNCH_OPTIONS);
}

export async function generarPdfDesdeHtml(
  html,
  nombreArchivo = "AVISO DE DEUDA VENCIDA.pdf",
  browserExistente = null,
) {
  const date = new Date();
  const fileRoute =
    "/pdf/" +
    date.getFullYear() +
    "/" +
    (date.getMonth() + 1) +
    "/" +
    date.getDate();
  const route = `${process.env.PDF_STORAGE_PATH}`;
  const routePath = path.normalize(route);
  const outputDir = path.join(routePath, fileRoute);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, nombreArchivo);

  const browser = browserExistente || (await crearNavegadorPdf());
  const cerrarBrowser = !browserExistente;
  let page;

  try {
    page = await browser.newPage();

    page.on("requestfailed", (request) => {
      const url = request.url();
      console.warn("⚠️ Recurso fallido al generar PDF:", {
        archivo: nombreArchivo,
        error: request.failure()?.errorText,
        url: url.length > 200 ? `${url.slice(0, 200)}...` : url,
      });
    });

    await page.setContent(html, {
      waitUntil: "load",
      timeout: 30000,
    });

    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      margin: {
        top: "15mm",
        right: "12mm",
        bottom: "15mm",
        left: "12mm",
      },
    });

    return outputPath;
  } catch (error) {
    console.error("❌ Error generando PDF:", {
      archivo: nombreArchivo,
      htmlBytes: Buffer.byteLength(html, "utf8"),
      error: error?.message || error,
    });
    throw error;
  } finally {
    if (page && !page.isClosed()) {
      await page.close().catch(() => {});
    }
    if (cerrarBrowser) {
      await browser.close().catch(() => {});
    }
  }
}
