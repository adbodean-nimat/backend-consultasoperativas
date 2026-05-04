import dotenv from 'dotenv';
import puppeteer from 'puppeteer';
import path from 'node:path';
import fs from 'node:fs';
dotenv.config();

export async function generarPdfDesdeHtml(html, nombreArchivo = 'aviso-deuda.pdf') {
    const route = `${process.env.PDF_STORAGE_PATH}`;
    const routePath = path.normalize(route);
    const outputDir = path.join(routePath, '/pdf');

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, nombreArchivo);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
        const page = await browser.newPage();

        await page.setContent(html, {
            waitUntil: 'networkidle0',
        });

        //await page.waitForTimeout(200);

        await page.pdf({
            path: outputPath,
            format: 'A4',
            printBackground: true,
            margin: {
                top: '15mm',
                right: '12mm',
                bottom: '15mm',
                left: '12mm',
            },
        });

        return outputPath;
    } finally {
        await browser.close();
    }
}
