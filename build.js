const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer');
const sass = require('sass');

const PUBLIC_DIR = path.resolve(__dirname, 'public');
const DEFAULT_LOCAL_PORT = 5000;

function debugServerLog(...args) {
    if (process.env.DEBUG_SERVER === '1' || process.env.DEBUG_SERVER === 'true') {
        console.log('[server]', ...args);
    }
}

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.html': return 'text/html; charset=utf-8';
        case '.css': return 'text/css; charset=utf-8';
        case '.js': return 'text/javascript; charset=utf-8';
        case '.json': return 'application/json; charset=utf-8';
        case '.svg': return 'image/svg+xml';
        case '.png': return 'image/png';
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.gif': return 'image/gif';
        case '.woff': return 'font/woff';
        case '.woff2': return 'font/woff2';
        case '.ttf': return 'font/ttf';
        case '.eot': return 'application/vnd.ms-fontobject';
        case '.pdf': return 'application/pdf';
        default: return 'application/octet-stream';
    }
}

function startStaticServer(port) {
    const server = http.createServer((req, res) => {
        try {
            const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
            const rawPath = decodeURIComponent(url.pathname);

            debugServerLog('request', {
                method: req.method,
                url: req.url,
                pathname: url.pathname,
                host: req.headers.host,
                remoteAddress: req.socket.remoteAddress
            });

            const requestPath = rawPath === '/' ? 'index.html' : rawPath.replace(/^\/+/, '');
            const normalizedPath = path.normalize(requestPath);
            const safePath = normalizedPath.replace(/^(?:\.\.(?:\/|\\|$))+/, '');
            const resolved = path.resolve(PUBLIC_DIR, safePath);

            const relativePath = path.relative(PUBLIC_DIR, resolved);
            if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
                debugServerLog('forbidden', {
                    rawPath,
                    requestPath,
                    normalizedPath,
                    safePath,
                    resolved,
                    publicDir: PUBLIC_DIR,
                    relativePath
                });
                res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Forbidden');
                return;
            }

            fs.stat(resolved, (err, stats) => {
                if (err) {
                    debugServerLog('not-found', { resolved, err: String(err) });
                    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end('Not found');
                    return;
                }

                const fileToServe = stats.isDirectory() ? path.join(resolved, 'index.html') : resolved;
                fs.stat(fileToServe, (err2, stats2) => {
                    if (err2 || !stats2.isFile()) {
                        debugServerLog('not-found', { fileToServe, err: err2 ? String(err2) : 'not-a-file' });
                        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                        res.end('Not found');
                        return;
                    }
                    debugServerLog('serve', { fileToServe });
                    res.writeHead(200, { 'Content-Type': getContentType(fileToServe) });
                    fs.createReadStream(fileToServe).pipe(res);
                });
            });
        } catch (e) {
            debugServerLog('error', String(e));
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Server error');
        }
    });

    return new Promise((resolve, reject) => {
        server.on('error', reject);
        // Bind to all interfaces so both IPv4/IPv6 localhost work.
        server.listen(port, () => {
            const address = server.address();
            debugServerLog('listening', address);
            resolve({ server, port, baseUrl: `http://127.0.0.1:${port}` });
        });
    });
}

async function startLocalServerWithFallback(startPort = DEFAULT_LOCAL_PORT, maxAttempts = 20) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const port = startPort + attempt;
        try {
            const handle = await startStaticServer(port);
            return handle;
        } catch (err) {
            if (err && err.code === 'EADDRINUSE') {
                console.warn(`Port ${port} is already in use; trying ${port + 1}...`);
                continue;
            }
            throw err;
        }
    }
    throw new Error(`Could not find a free port starting at ${startPort}`);
}

function buildCss() {
    try {
        const output = sass.compile('public/clear.scss', { style: 'compressed' });
        fs.writeFileSync('public/clear.css', output.css);
        console.log("CSS Built");
    } catch (error) {
        console.error('Error during sass build:', error);
    }
}

async function buildPDF(targetUrl) {
    const browser = await puppeteer.launch({ headless: 'new' });
    //const CHROME = '/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome';
    const page = await browser.newPage();

    const response = await page.goto(targetUrl, { waitUntil: 'networkidle0' });
    if (!response || !response.ok()) {
        const status = response ? response.status() : 'NO_RESPONSE';
        let pageText = '';
        try {
            pageText = await page.evaluate(() => (document.body && (document.body.innerText || '')) || '');
        } catch {}
        throw new Error(`Failed to load ${targetUrl} (status: ${status})${pageText ? `\n\nPage text:\n${pageText.slice(0, 400)}` : ''}`);
    }
    await page.pdf({ path: 'public/Valentyn\ Shybanov\ Personal\ profile.pdf',
         margin: { top: "40", right: "40", bottom: "40", left: "40" },
         displayHeaderFooter: true, 
         headerTemplate: `<div style="font-size:10px; text-align:center; width:100%; padding-top:10px;"><span class="title">Valentyn Shybanov - Personal profile</span></div>`,
                footerTemplate: `<div style="font-size:10px; width:100%; padding:0 40px 10px 40px; box-sizing:border-box; display:flex; justify-content:space-between; align-items:flex-end;">
                <a href="https://olostan.me/" style="color: #888; text-decoration: none;">https://olostan.me</a>
                <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
         format: 'A4' });
    await browser.close();
    console.log("PDF created");
}

const args = new Set(process.argv.slice(2));
const isWatch = args.has('watch');
const isLocal = args.has('local');

// Modes:
// - default (no mode): build both CSS and PDF
// - css: build CSS only
// - pdf: build PDF only
const isCssOnly = args.has('css');
const isPdfOnly = args.has('pdf');
const shouldBuildCss = isCssOnly || (!isCssOnly && !isPdfOnly);
const shouldBuildPdf = isPdfOnly || (!isCssOnly && !isPdfOnly);

function buildSelectedOnce() {
    if (shouldBuildCss) buildCss();
    if (shouldBuildPdf) buildPDF(isLocal);
}

async function main() {
    let serverHandle = null;
    const localTargetUrl = () => (serverHandle ? serverHandle.baseUrl : `http://127.0.0.1:${DEFAULT_LOCAL_PORT}`);
    const remoteTargetUrl = 'https://olostan.me/';

    if ((isLocal || isWatch) && shouldBuildPdf) {
        serverHandle = await startLocalServerWithFallback(DEFAULT_LOCAL_PORT);
        console.log(`Serving ./public at ${serverHandle.baseUrl}`);
    }

    try {
        if (!isWatch) {
            if (shouldBuildCss) buildCss();
            if (shouldBuildPdf) await buildPDF(isLocal ? localTargetUrl() : remoteTargetUrl);
            return;
        }

        console.log("watching...");
        // Watch mode always uses localhost PDF generation.
        if (shouldBuildCss) buildCss();
        if (shouldBuildPdf) await buildPDF(localTargetUrl());

        if (shouldBuildCss) {
            fs.watch('public/clear.scss', {}, function (eventType, filename) {
                if (eventType == 'change') {
                    console.log("Css changed");
                    buildCss();
                    if (shouldBuildPdf) buildPDF(localTargetUrl());
                }
            });
        }

        if (shouldBuildPdf) {
            fs.watch('public/index.html', {}, function (eventType, filename) {
                if (eventType == 'change') {
                    console.log("HTML changed");
                    buildPDF(localTargetUrl());
                }
            });
        }
    } finally {
        if (!isWatch && serverHandle && serverHandle.server) {
            await new Promise((resolve) => serverHandle.server.close(resolve));
        }
    }
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});