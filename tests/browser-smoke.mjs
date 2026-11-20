import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = await mkdtemp(join(tmpdir(), 'welding-smoke-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1100,800', '--user-data-dir=' + profile, 'about:blank'
], { windowsHide: true, stdio: 'ignore' });
let socket;
let server;
const killTimer = setTimeout(() => {
    console.error('Chrome smoke test timed out');
    chrome.kill();
    process.exit(1);
}, 180000);
try {
    let port;
    for (let attempt = 0; attempt < 80 && !port; attempt++) {
        try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; }
        catch { await delay(125); }
    }
    assert.ok(port, 'Chrome started with remote debugging');
    const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    const page = pages.find(target => target.type === 'page' && target.url === 'about:blank');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });
    const requests = new Map();
    const uncaught = [];
    const logged = [];
    let nextId = 0;
    socket.addEventListener('message', ({ data }) => {
        const message = JSON.parse(data);
        if (message.id) {
            const request = requests.get(message.id);
            requests.delete(message.id);
            if (message.error) request.reject(Error(message.error.message));
            else request.resolve(message.result);
        }
        if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) logged.push(message.params.args.map(arg => arg.description || arg.value));
        if (message.method === 'ServiceWorker.workerErrorReported') logged.push(message.params);
        if (message.method === 'Runtime.exceptionThrown') uncaught.push(message.params.exceptionDetails);
    });
    function send(method, params = {}) {
        return new Promise((resolve, reject) => {
            requests.set(++nextId, { resolve, reject });
            socket.send(JSON.stringify({ id: nextId, method, params }));
        });
    }
    async function evaluate(expression) {
        const data = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (data.exceptionDetails) throw Error(data.exceptionDetails.exception?.description || data.exceptionDetails.text);
        return data.result.value;
    }
    async function until(expression, label) {
        for (let i = 0; i < 160; i++) {
            if (await evaluate(expression)) return;
            await delay(100);
        }
        const context = await evaluate('({ href: location.href, ready: document.readyState, renderer: typeof renderer, arcade: typeof arcade, canvas: Boolean(document.querySelector("canvas")) })');
        throw Error(label + ' ' + JSON.stringify({ context, logged, uncaught }));
    }
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const info = text => console.log(text);
    async function screenshot(name) {
        if (!process.env.WELDING_SCREEN_DIR) return;
        await delay(240);
        const { data } = await send('Page.captureScreenshot', { format: 'png' });
        await writeFile(join(process.env.WELDING_SCREEN_DIR, name + '.png'), Buffer.from(data, 'base64'));
    }
    await send('Runtime.enable');
    await send('Page.enable');
    if (!process.argv.includes('--web-only')) {
        const url = process.env.WELDING_TEST_URL || new URL('../index.html', import.meta.url).href;
        await send('Page.navigate', { url });
        await until('typeof renderer !== "undefined" && Boolean(renderer) && document.readyState === "complete"', 'Engine initialized');
        assert.equal(await evaluate('document.getElementById("startup-error").hidden'), true);
        assert.equal(await evaluate('document.querySelector(".home-play").textContent.includes("Iniciar carreira")'), true);
        await screenshot('workshop-desktop');
        await click('[data-page=modes]');
        assert.equal(await evaluate('document.querySelectorAll("[data-page=arcade], [data-page=zen], [data-page=pro]").length'), 3);
        await click('#menu-back');
        await click('[data-page=settings]');
        await evaluate(`(() => {
            const fields = document.querySelectorAll('#menu-content select');
            fields[1].value = 'low';
            fields[1].dispatchEvent(new Event('change'));
            fields[2].value = 'true';
            fields[2].dispatchEvent(new Event('change'));
        })()`);
        await evaluate(`(() => {
            const slider = document.querySelector('#aim-sensitivity');
            slider.value = '175';
            slider.dispatchEvent(new Event('input'));
        })()`);
        assert.equal(await evaluate('arcade.sensitivity()'), 1.75);
        assert.equal(await evaluate('JSON.parse(localStorage.getItem("welding-master-arcade-v1")).settings.sensitivity'), 175);
        await evaluate(`(() => {
            const slider = document.querySelector('#aim-sensitivity');
            slider.value = '100';
            slider.dispatchEvent(new Event('input'));
        })()`);
        await click('#menu-back');
        await click('[data-page=career]');
        assert.equal(await evaluate('document.querySelectorAll(".mission-card").length'), 10);
        assert.equal(await evaluate('document.querySelectorAll(".mission-card:disabled").length'), 9);
        await screenshot('career-desktop');
        await click('.arc-primary');
        assert.equal(await evaluate('getComputedStyle(document.getElementById("bench-header")).display'), 'none');
        await click('#bench-toggle');
        assert.equal(await evaluate('arcade.controlsOpen() && !arcade.allowed()'), true);
        await click('#bench-toggle');
        await screenshot('bench-desktop');
        await click('[data-action=inspectWeld]');
        assert.equal(await evaluate('document.querySelector("#insp-grade").textContent'), '0/100');
        assert.match(await evaluate('document.querySelector("#insp-comment").textContent'), /Meta 40/);
        info('Menu, dez ordens, bloqueio sequencial, painel da bancada e inspeção vazia.');
        if (process.argv.includes('--ui-only')) {
            await click('#result-next');
            await send('Emulation.setDeviceMetricsOverride', { width: 414, height: 820, deviceScaleFactor: 1, mobile: true });
            await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
            assert.equal(await evaluate('document.querySelector("#game-menu").scrollWidth <= innerWidth'), true);
            await screenshot('workshop-mobile');
            await click('[data-page=career]');
            await screenshot('career-mobile');
            assert.equal(await evaluate('Boolean(document.querySelector(".mission-preview").getContext("2d").getImageData(192, 72, 1, 1).data[3])'), true);
            assert.deepEqual(uncaught, []);
            info('Menu e prévia 3D verificados em 414 × 820.');
        } else {
        const groove = `(u => {
            camera.updateMatrixWorld(true);
            const spec = STRUCTURES[currentLevel];
            const point = new THREE.Vector3();
            spec.evalPos(u, 0, spec.baseH(u, 0), point);
            workpieceGroup.localToWorld(point);
            point.project(camera);
            return { x: Math.round((point.x + 1) * innerWidth / 2), y: Math.round((1 - point.y) * innerHeight / 2) };
        })`;
        const project = u => evaluate(groove + '(' + u + ')');
        if (process.argv.includes('--full-pass')) {
            await click('[data-action=closeInspectAndRetry]');
            await delay(350);
            const from = await project(-3.0);
            await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...from, button: 'left', buttons: 1, clickCount: 1 });
            await until('isWelding', 'Career pass starts on the groove');
            const to = await project(3.0);
            await evaluate(`new Promise(resolve => {
                let previousTime = performance.now();
                let progress = 0;
                function move(time) {
                    progress = Math.min(1, progress + Math.min(0.05, (time - previousTime) / 1000) * 0.33);
                    previousTime = time;
                    window.dispatchEvent(new PointerEvent('pointermove', {
                        pointerType: 'mouse', pointerId: 1, buttons: 1,
                        clientX: ${from.x} + (${to.x} - ${from.x}) * progress,
                        clientY: ${from.y} + (${to.y} - ${from.y}) * progress
                    }));
                    if (progress < 1) requestAnimationFrame(move);
                    else resolve();
                }
                requestAnimationFrame(move);
            })`);
            await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...to, button: 'left', buttons: 0, clickCount: 1 });
            await click('[data-action=inspectWeld]');
            assert.equal(await evaluate('document.querySelector("#insp-comment").textContent'), 'Ordem aprovada.',
                await evaluate('document.querySelector("#insp-grade").textContent + " " + document.querySelector("#insp-comment").textContent + " " + document.querySelector("#result-details").textContent'));
            await click('#result-next');
            assert.equal(await evaluate('arcade.current().index'), 1);
            assert.equal(await evaluate('JSON.parse(localStorage.getItem("welding-master-arcade-v1")).xp'), 80);
            info('Passe com mouse aprovou Primeiro Arco, concedeu XP e liberou Mão Firme.');
            await click('#leave-game');
        } else {
            await click('#result-next');
        }
        await click('[data-page=modes]');
        await click('[data-page=zen]');
        await evaluate(`(() => {
            const selects = document.querySelectorAll('#menu-content select');
            selects[1].value = 'E6013';
            selects[1].dispatchEvent(new Event('change'));
        })()`);
        await click('.arc-primary');
        await delay(350);
        const point = await evaluate(groove + '(0)');
        const hit = await evaluate(`(() => {
            updateAimFromPointer(${point.x}, ${point.y});
            return { point: [${point.x}, ${point.y}], allowed: arcade.allowed(), aim: aimUV, target: document.elementFromPoint(${point.x}, ${point.y})?.outerHTML.slice(0, 180), job: arcade.current().job.process };
        })()`);
        assert.ok(hit.allowed && hit.aim.valid && Math.abs(hit.aim.v) < 0.4 && hit.target.startsWith('<canvas'), JSON.stringify(hit));
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
        await until('arcade.rodLength() < 99 && isWelding', 'Assisted SMAW arc consumes rod');
        assert.equal(await evaluate('electrodeGroup.visible && !torchGroup.visible'), true);
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
        assert.equal(await evaluate('isWelding'), false);
        await click('#replace-rod');
        assert.equal(await evaluate('arcade.rodLength()'), 100);
        await click('[data-action=inspectWeld]');
        assert.equal(await evaluate('document.querySelector("#insp-grade").textContent'), 'Solda livre');
        await click('#result-next');
        assert.equal(await evaluate('arcade.current().mode === "zen" && arcade.allowed()'), true);
        for (let piece = 0; piece < 4; piece++) {
            assert.equal(await evaluate('currentLevel'), piece);
            assert.ok(await evaluate('Boolean(weldField && workpieceGroup.children.length > 3)'));
            if (piece < 3) await click('#free-piece');
        }
        info('Mouse, arco assistido, consumo, troca, Zen e quatro peças.');
        await send('Page.reload', { ignoreCache: true });
        await until('document.readyState === "complete" && !document.querySelector("#resume-game").hidden', 'Saved session returned on reload');
        await click('#resume-game');
        assert.equal(await evaluate('currentLevel'), 3);
        assert.equal(await evaluate('arcade.current().job.process'), 'E6013');
        await click('#leave-game');
        await click('[data-page=modes]');
        await click('[data-page=arcade]');
        await click('.arc-primary');
        const arcadePoint = await evaluate(groove + '(0)');
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...arcadePoint, button: 'left', buttons: 1, clickCount: 1 });
        await until('arcade.current().remaining < 39.5', 'Arcade clock advances after a weld gesture');
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...arcadePoint, button: 'left', buttons: 0, clickCount: 1 });
        await click('#leave-game');
        await click('[data-page=modes]');
        await click('[data-page=pro]');
        await click('.arc-primary');
        assert.match(await evaluate('document.querySelector("#rod-help").textContent'), /Q aproxima/);
        await click('#leave-game');
        info('Retomada após recarregar, relógio Arcade e bancada Profissional.');
        await send('Emulation.setDeviceMetricsOverride', { width: 414, height: 820, deviceScaleFactor: 1, mobile: true });
        await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
        assert.equal(await evaluate('document.querySelector("#game-menu").scrollWidth <= innerWidth'), true);
        await screenshot('workshop-mobile');
        await click('[data-page=modes]');
        await click('[data-page=zen]');
        await evaluate(`(() => {
            const select = document.querySelectorAll('#menu-content select')[1];
            select.value = 'E6013';
            select.dispatchEvent(new Event('change'));
        })()`);
        await click('.arc-primary');
        await delay(400);
        const touch = await project(0);
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...touch, id: 1 }] });
        await until('arcade.rodLength() < 99 && isWelding', 'Touch starts and consumes the assisted rod');
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        assert.equal(await evaluate('isWelding'), false);
        info('Toque em viewport móvel abriu e apagou o arco assistido.');
        }
    }
    await send('ServiceWorker.enable');
    const received = [];
    const mime = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', webmanifest: 'application/manifest+json', png: 'image/png' };
    server = createServer(async (request, response) => {
        const path = new URL(request.url, 'http://localhost').pathname;
        received.push(path);
        const file = path === '/GAME_SOLDA/' ? 'index.html' : path.slice('/GAME_SOLDA/'.length);
        if (!path.startsWith('/GAME_SOLDA/') || !/^(index[.]html|sw[.]js|manifest[.]webmanifest|assets\/[a-z0-9.-]+)$/.test(file)) {
            response.writeHead(404).end();
            return;
        }
        try {
            const bytes = await readFile(new URL('../' + file, import.meta.url));
            response.writeHead(200, { 'Content-Type': mime[file.split('.').pop()] }).end(bytes);
        } catch { response.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const staticUrl = 'http://127.0.0.1:' + server.address().port + '/GAME_SOLDA/';
    await send('Page.navigate', { url: staticUrl });
    await until('location.protocol === "http:" && document.readyState === "complete"', 'Static entry loads');
    const worker = await evaluate(`navigator.serviceWorker.register('./sw.js').then(registration => ({
        scope: registration.scope, installing: registration.installing?.state, active: registration.active?.state
    })).catch(error => ({ error: String(error) }))`);
    assert.ok(worker.scope, JSON.stringify(worker));
    try {
        await until('Boolean(navigator.serviceWorker.controller)', 'Service worker controls the static subpath');
    } catch (error) {
        console.error({ worker, received, caches: await evaluate('caches.keys()') });
        throw error;
    }
    await send('Network.enable');
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    const beforeOffline = await evaluate('performance.timeOrigin');
    await send('Page.reload');
    await until('performance.timeOrigin !== ' + beforeOffline + ' && document.readyState === "complete" && Boolean(document.querySelector("#canvas-container canvas")) && document.querySelector("#startup-error").hidden', 'Offline static reload initializes WebGL');
    info('Publicação estática em subpasta e recarregamento offline com service worker.');
    assert.deepEqual(uncaught, []);
} finally {
    clearTimeout(killTimer);
    socket?.close();
    chrome.kill();
    server?.close();
}
