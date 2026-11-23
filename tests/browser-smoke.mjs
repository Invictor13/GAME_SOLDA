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
            if (message.error) request.reject(Error(`${request.method}: ${message.error.message}`));
            else request.resolve(message.result);
        }
        if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) logged.push(message.params.args.map(arg => arg.description || arg.value));
        if (message.method === 'ServiceWorker.workerErrorReported') logged.push(message.params);
        if (message.method === 'Runtime.exceptionThrown') uncaught.push(message.params.exceptionDetails);
    });
    function send(method, params = {}) {
        return new Promise((resolve, reject) => {
            requests.set(++nextId, { method, resolve, reject });
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
    if (process.argv.includes('--mobile')) {
        await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
        await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
        await send('Page.navigate', { url: new URL('../index.html', import.meta.url).href });
        await until('Boolean(document.querySelector("#canvas-container canvas")) && document.readyState === "complete"', 'Mobile startup');
        await click('[data-page=settings]');
        await evaluate(`(() => {
            const fields = document.querySelectorAll('#menu-content select');
            fields[1].value = 'low';
            fields[1].dispatchEvent(new Event('change'));
            fields[2].value = 'true';
            fields[2].dispatchEvent(new Event('change'));
        })()`);
        await click('#menu-back');
        await click('[data-page=career]');
        await click('.arc-primary');
        await until('mobileCursorReady && camState.radius > 12', 'Portrait overview and indirect aim settle');
        const bounds = selector => evaluate(`(() => {
            const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width };
        })()`);
        const joystick = await bounds('#mobile-stick');
        const button = await bounds('#mobile-arc');
        assert.ok(joystick.width >= 44 && button.width >= 44 && joystick.x < 120 && button.x > 270);
        const touch = (type, touchPoints) => send('Input.dispatchTouchEvent', { type, touchPoints });
        const beforePan = await evaluate('camState.desiredTarget.x');
        await touch('touchStart', [{ x: 195, y: 420, id: 11 }]);
        await touch('touchMove', [{ x: 221, y: 420, id: 11 }]);
        await touch('touchEnd', []);
        assert.equal(await evaluate('isWelding'), false);
        assert.notEqual(await evaluate('camState.desiredTarget.x'), beforePan);
        await click('[data-mobile-camera="1"]');
        await until('mobileCursorReady && Math.abs(camState.target.x) < .02', 'Overview returns to piece');
        const startU = await evaluate('aimUV.u');
        const startCamera = await evaluate('camState.desiredTarget.x');
        const trigger = { x: button.x, y: button.y, id: 1 };
        const direction = { x: joystick.x + joystick.width * .26, y: joystick.y, id: 2 };
        await touch('touchStart', [trigger]);
        await until('isWelding', 'Arc button ignites the virtual target');
        await touch('touchStart', [trigger, direction]);
        try {
            await until('isWelding && aimUV.u > ' + (startU + .25) + ' && Math.abs(camState.desiredTarget.x - ' + startCamera + ') > .04',
                'Two fingers move the arc and the camera together');
            await until('isWelding && aimUV.u > 3.05', 'Two-thumb pass reaches the far end of the groove');
        } catch (error) {
            console.error(await evaluate('({ isWelding, aimUV, target: camState.target.toArray(), vector: mobileInput.vector(), pressed: mobileInput.welding(), seed: mobileAnchor.toArray(), frames: performance.now() })'));
            throw error;
        }
        await touch('touchEnd', []);
        assert.equal(await evaluate('isWelding'), false);
        await click('[data-action=inspectWeld]');
        assert.equal(await evaluate('document.querySelector("#insp-comment").textContent'), 'Ordem aprovada.',
            await evaluate('document.querySelector("#result-details").textContent'));
        await click('#result-next');
        await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
        await until('innerWidth === 844 && mobileCursorReady', 'Landscape touch layout restarts with no live arc');
        assert.equal(await evaluate('isWelding'), false);
        assert.ok((await bounds('#mobile-stick')).x < (await bounds('#mobile-arc')).x);
        await click('#leave-game');
        await click('[data-page=settings]');
        await evaluate(`(() => {
            const set = (value, option) => {
                const field = [...document.querySelectorAll('#menu-content select')]
                    .find(select => [...select.options].some(choice => choice.textContent === option));
                field.value = value;
                field.dispatchEvent(new Event('change'));
            };
            set('assisted', 'Assistida');
            set('true', 'Esquerdo');
        })()`);
        await click('#menu-back');
        await click('[data-page=career]');
        await click('.arc-primary');
        await evaluate('loadStructure(2)');
        await until('mobileCursorReady && arcade.difficulty() === "assisted"', 'Assisted curved joint is ready');
        const leftTrigger = await bounds('#mobile-arc');
        const rightStick = await bounds('#mobile-stick');
        assert.ok(leftTrigger.x < rightStick.x);
        const assistedStart = await evaluate('aimUV.u');
        await touch('touchStart', [{ ...leftTrigger, id: 4 }, { ...rightStick, id: 5 }]);
        await until('isWelding', 'Assisted arc ignites');
        await touch('touchMove', [{ ...leftTrigger, id: 4 }, { ...rightStick, x: rightStick.x + 30, id: 5 }]);
        await until(`isWelding && aimUV.u > ${assistedStart + .35} && Math.abs(aimUV.v) < .1`, 'Guided joystick follows the curve');
        await touch('touchEnd', []);
        await click('[data-action=inspectWeld]');
        assert.equal(await evaluate('document.querySelectorAll("#coverage-map button").length'), 8);
        await click('#coverage-map button:nth-child(3)');
        assert.match(await evaluate('document.getElementById("coverage-hint").textContent'), /Trecho 3/);
        await click('#inspect-piece');
        await until('arcade.allowed() && !document.getElementById("inspection-pin").hidden', 'Inspection returns to the selected section');
        assert.deepEqual(uncaught, []);
        info('Retrato e paisagem, dois polegares, curva assistida, comandos invertidos e retorno ao trecho inspecionado.');
    } else if (process.argv.includes('--multipass')) {
        await send('Page.navigate', { url: new URL('../index.html', import.meta.url).href });
        await until('Boolean(document.querySelector("#canvas-container canvas")) && document.readyState === "complete"', 'Multipass startup');
        await click('#first-service');
        await click('#fit-pieces');
        const result = await evaluate(`(() => {
            const f = weldField;
            const spec = STRUCTURES[currentLevel];
            const point = new THREE.Vector3();
            const dt = 1 / 60;
            const total = () => f.solidH.reduce((sum, value, index) => sum + value + f.liquidH[index], 0);
            const thickness = () => {
                const g = uvToGridIndices(0, 0);
                return f.solidH[g.iu * FIELD_NV + g.iv];
            };
            const pass = (from, to) => {
                aimUV.valid = true;
                surfaceTarget = null;
                arcade.begin();
                for (let i = 0; i < 240; i++) {
                    const u = from + (to - from) * i / 239;
                    spec.evalPos(u, 0, spec.rootHeight, point);
                    stepWeldPhysics(dt, u, 0, point);
                }
                arcade.stop();
                const beforeCooling = total();
                for (let i = 0; i < 330; i++) stepWeldPhysics(dt, 0, 0, point);
                return { mass: total(), thickness: thickness(), drift: Math.abs(beforeCooling - total()) };
            };
            const first = pass(-1.2, 1.2);
            const second = pass(1.2, -1.2);
            let thinnest = Infinity;
            for (let u = -.9; u < .9; u += .04) {
                const g = uvToGridIndices(u, 0);
                thinnest = Math.min(thinnest, f.solidH[g.iu * FIELD_NV + g.iv]);
            }
            return { first, second, thinnest };
        })()`);
        assert.ok(result.first.mass > 0 && result.second.mass > result.first.mass, JSON.stringify(result));
        assert.ok(result.second.thickness > result.first.thickness && result.thinnest > 0, JSON.stringify(result));
        assert.ok(result.first.drift < .001 && result.second.drift < .001, JSON.stringify(result));
        assert.deepEqual(uncaught, []);
        info('Dois passes sobrepostos: mais metal e altura no segundo, sem lacuna no centro nem perda no resfriamento.');
    } else if (process.argv.includes('--jobs')) {
        await send('Page.navigate', { url: new URL('../index.html', import.meta.url).href });
        await until('Boolean(document.querySelector("#canvas-container canvas")) && document.readyState === "complete"', 'Jobs startup');
        await click('#first-service');
        assert.equal(await evaluate('arcade.current().job.name'), 'Cantoneira quebrada');
        await click('[data-action=inspectWeld]');
        assert.match(await evaluate('document.querySelector("#insp-comment").textContent'), /Preencha/);
        await click('#result-next');
        assert.equal(await evaluate('arcade.allowed() && !assembly.aligned'), true);
        await click('#fit-pieces');
        await evaluate(`for (let i = 0; i < weldField.solidH.length; i++) {
            weldField.solidH[i] = Math.max(0, weldField.spec.height - weldField.baseH[i]);
        }`);
        await click('[data-action=inspectWeld]');
        assert.equal(await evaluate('Boolean(arcade.card())'), true);
        assert.match(await evaluate('JSON.parse(localStorage.getItem("welding-master-arcade-v1")).completedJobs[0].image'), /^data:image\/jpeg/);
        await click('#result-next');
        assert.equal(await evaluate('arcade.current().job.name'), 'Moldura empenada');
        await click('#leave-game');
        await click('[data-page=workshop]');
        assert.equal(await evaluate('document.querySelectorAll(".job-gallery figure").length'), 1);
        await click('#menu-back');
        await click('.home-links [data-page=jobs]');
        await evaluate(`[...document.querySelectorAll('#menu-content button')].find(button => button.textContent.includes('começar pela chapa')).click()`);
        assert.equal(await evaluate('currentLevel === 5 && arcade.current().reverse'), true);
        await click('#leave-game');
        await click('[data-page=modes]');
        await evaluate(`[...document.querySelectorAll('#menu-content button')].find(button => button.textContent.includes('Desafio de bancada')).click()`);
        assert.equal(await evaluate('arcade.current().remaining === 50 && document.querySelector("#amp-slider").disabled'), true);
        await click('[data-action=inspectWeld]');
        assert.equal(await evaluate('JSON.parse(localStorage.getItem("welding-master-arcade-v1")).benchBest[0]'), 0);
        assert.deepEqual(uncaught, []);
        info('Serviço incompleto retomável, entrega e exposição, ordem da moldura e desafio local verificados.');
    } else if (process.argv.includes('--surface')) {
        await send('Page.navigate', { url: new URL('../index.html', import.meta.url).href });
        await until('Boolean(document.querySelector("#canvas-container canvas")) && document.readyState === "complete"', 'Surface test startup');
        await click('[data-page=modes]');
        await click('[data-page=zen]');
        await evaluate(`(() => {
            const select = document.querySelector('#menu-content select');
            if (select.options.length !== 7) throw Error('Expected seven pieces');
            select.value = '5';
            select.dispatchEvent(new Event('change'));
        })()`);
        await click('.arc-primary');
        const result = await evaluate(`(() => {
            const spec = STRUCTURES[currentLevel];
            camera.position.set(7.2, 5.2, 6.5);
            camera.lookAt(0, .4, 0);
            camera.updateMatrixWorld(true);
            function aim(point) {
                point.project(camera);
                updateAimFromPointer((point.x + 1) * innerWidth / 2, (1 - point.y) * innerHeight / 2);
            }
            const right = assembly.parts[1];
            aim(new THREE.Vector3().copy(right.position).add(new THREE.Vector3(0, spec.height / 2, 0)));
            if (!aimUV.valid || surfaceTarget !== right) throw Error('Free plate top did not accept aim');
            updateWeldReticle();
            const reticleBounds = document.getElementById('weld-reticle').getBoundingClientRect();
            const aimNdc = aimWorldPos.clone().project(camera);
            if (reticleBounds.width < 10 || Math.abs(reticleBounds.left + reticleBounds.width / 2 - (1 + aimNdc.x) * innerWidth / 2) > 1) {
                throw Error('Reticle is missing or detached from the logical aim');
            }
            for (const tool of [torchGroup, electrodeGroup]) tool.traverse(part => {
                if (part.isMesh && (!part.material.transparent || part.material.opacity >= .6 || part.castShadow)) {
                    throw Error('Tool still obscures the weld');
                }
            });

            arcade.begin();
            runSimulation(1 / 30, spec);
            if (!surfaceLayers.has(right)) throw Error('Free plate did not receive a bead');
            if (weldField.liquidH.some(value => value > 0)) throw Error('Free pass deposited on the hidden seam');
            arcade.stop();
            aim(new THREE.Vector3().copy(right.position).add(new THREE.Vector3(spec.length / 2, 0, 0)));
            if (!aimUV.valid || surfaceTarget !== right || Math.abs(aimNormal.x) < .9) throw Error('End face did not accept aim');
            arcade.begin();
            runSimulation(1 / 60, spec);
            arcade.stop();
            document.querySelector('#fit-pieces').click();
            if (!assembly.aligned || !surfaceLayers.has(right)) throw Error('Alignment failed or lost the existing bead');
            camera.position.set(0, 8, .1);
            camera.lookAt(0, 0, 0);
            camera.updateMatrixWorld(true);
            aim(new THREE.Vector3(0, spec.rootHeight, 0));
            if (!aimUV.valid || surfaceTarget || Math.abs(aimWorldPos.y - spec.rootHeight) > .07) {
                throw Error('The aligned joint did not aim at its root');
            }
            for (let i = 1; i < 32; i++) {
                const u = spec.uMin + (spec.uMax - spec.uMin) * i / 32;
                aim(new THREE.Vector3(u, spec.rootHeight, 0));
                if (!aimUV.valid || surfaceTarget) throw Error('Aligned seam did not accept aim');
                if (i === 1) arcade.begin();
                runSimulation(1 / 60, spec);
            }
            arcade.stop();
            updateHUDMetrics();
            if (assembly.joined) throw Error('A quick superficial pass incorrectly completed the joint');
            // Exercise completion with a fully deposited groove, independently of input speed.
            for (let i = 0; i < weldField.solidH.length; i++) {
                weldField.solidH[i] = spec.height - weldField.baseH[i];
            }
            updateHUDMetrics();
            return { joined: assembly.joined, label: document.querySelector('#fit-pieces').textContent };
        })()`);
        assert.equal(result.joined, true, JSON.stringify(result));
        assert.match(result.label, /unidas/);
        assert.deepEqual(uncaught, []);
        info('Solda livre preservada, mira na raiz confirmada e conclusão condicionada ao preenchimento.');
    } else if (process.argv.includes('--benchmark')) {
        await send('Emulation.setDeviceMetricsOverride', { width: 480, height: 320, deviceScaleFactor: 1, mobile: false });
        const current = new URL('../index.html', import.meta.url).href;
        const baseline = process.env.WELDING_BASELINE_URL;
        for (const [label, url] of (baseline ? [['baseline', baseline], ['optimized', current]] : [['optimized', current]])) {
            await send('Page.navigate', { url });
            await until('Boolean(document.querySelector("#canvas-container canvas")) && document.readyState === "complete"', 'Benchmark startup');
            await click('[data-page=settings]');
            await evaluate(`(() => {
                const quality = document.querySelectorAll('#menu-content select')[1];
                quality.value = 'low';
                quality.dispatchEvent(new Event('change'));
                const reduced = document.querySelectorAll('#menu-content select')[2];
                reduced.value = 'true';
                reduced.dispatchEvent(new Event('change'));
                const adaptive = [...document.querySelectorAll('#menu-content select')].find(select => select.parentElement.textContent.startsWith('Resolução dinâmica'));
                if (adaptive) {
                    adaptive.value = 'false';
                    adaptive.dispatchEvent(new Event('change'));
                }
            })()`);
            await click('#menu-back');
            await click('[data-page=career]');
            await click('.arc-primary');
            await delay(500);
            const result = await evaluate(`new Promise(resolve => {
                const rows = { frame: [], logic: [], ray: [], mesh: [], hud: [], input: [], lag: [] };
                let previous = performance.now();
                let frame = 0;
                let input = null;
                const measure = (name, fn) => (...args) => {
                    const t = performance.now();
                    const result = fn(...args);
                    rows[name].push(performance.now() - t);
                    return result;
                };
                let geometryPerStep = 0;
                const originalMesh = refreshWeldMeshRegion;
                refreshWeldMeshRegion = (...args) => {
                    const t = performance.now();
                    const result = originalMesh(...args);
                    const elapsed = performance.now() - t;
                    geometryPerStep += elapsed;
                    rows.mesh.push(elapsed);
                    return result;
                };
                const originalPhysics = stepWeldPhysics;
                stepWeldPhysics = (...args) => {
                    geometryPerStep = 0;
                    const t = performance.now();
                    originalPhysics(...args);
                    rows.logic.push(Math.max(0, performance.now() - t - geometryPerStep));
                };
                updateHUDMetrics = measure('hud', updateHUDMetrics);
                const originalRender = renderer.render.bind(renderer);
                renderer.render = (...args) => {
                    if (input !== null) rows.lag.push(filteredAimPos.distanceTo(aimWorldPos));
                    originalRender(...args);
                    if (input !== null) {
                        rows.input.push(performance.now() - input);
                        input = null;
                    }
                };
                function point(u) {
                    const spec = STRUCTURES[0];
                    const v = Math.sin(u * 3) * .06;
                    const p = spec.evalPos(u, v, spec.baseH(u, v), new THREE.Vector3()).project(camera);
                    return [(p.x + 1) * innerWidth / 2, (1 - p.y) * innerHeight / 2];
                }
                function tick(now) {
                    if (!frame) {
                        previous = now;
                        const [x, y] = point(-2.45);
                        updateAimFromPointer(x, y);
                        filteredAimPos.copy(aimWorldPos);
                        arcade.begin();
                    } else rows.frame.push(now - previous);
                    previous = now;
                    const u = -2.45 + frame * .105;
                    if (frame++ >= 42) {
                        arcade.stop();
                        const summary = values => {
                            const sorted = values.slice().sort((a,b) => a-b);
                            const p95 = sorted[Math.ceil(.95 * sorted.length) - 1] ?? 0;
                            return { count: values.length, mean: +(values.reduce((a,b) => a+b,0) / Math.max(1,values.length)).toFixed(3), p95: +p95.toFixed(3) };
                        };
                        resolve({ ...Object.fromEntries(Object.entries(rows).map(([key, values]) => [key, summary(values)])), engine: renderer.getContext().getParameter(renderer.getContext().RENDERER) });
                        return;
                    }
                    input = performance.now();
                    updateAimFromPointer(...point(u));
                    rows.ray.push(performance.now() - input);
                    requestAnimationFrame(tick);
                }
                requestAnimationFrame(tick);
            })`);
            assert.ok(result.frame.count >= 40 && result.ray.count >= 40, JSON.stringify(result));
            info(label + ' ' + JSON.stringify(result));
        }
        assert.deepEqual(uncaught, []);
    } else {
    if (!process.argv.includes('--web-only')) {
        const url = process.env.WELDING_TEST_URL || new URL('../index.html', import.meta.url).href;
        await send('Page.navigate', { url });
        await until('typeof renderer !== "undefined" && Boolean(renderer) && document.readyState === "complete"', 'Engine initialized');
        assert.equal(await evaluate('document.getElementById("startup-error").hidden'), true);
        assert.equal(await evaluate('document.querySelector("#first-service").textContent.includes("Jogar primeiro serviço")'), true);
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
        await until(`(() => {
            const point = ${groove}(0);
            return point.x > 0 && point.x < innerWidth && point.y > 0 && point.y < innerHeight;
        })()`, 'Arcade camera frames the test joint');
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
        await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
        await send('Emulation.setDeviceMetricsOverride', { width: 414, height: 820, deviceScaleFactor: 1, mobile: true });
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
        await until('mobileCursorReady', 'Mobile cursor ready for assisted rod');
        const trigger = await evaluate(`(() => {
            const rect = document.getElementById('mobile-arc').getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        })()`);
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...trigger, id: 1 }] });
        await until('arcade.rodLength() < 99 && isWelding', 'Touch starts and consumes the assisted rod');
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        assert.equal(await evaluate('isWelding'), false);
        info('Toque em viewport móvel abriu e apagou o arco assistido.');
        }
    }
    await send('ServiceWorker.enable');
    const received = [];
    let currentRelease = false;
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
            let bytes = await readFile(new URL('../' + file, import.meta.url));
            if (file === 'sw.js' && !currentRelease) {
                bytes = bytes.toString().replace(/welding-master-v\d+/, 'welding-master-fixture-old').replace('await self.skipWaiting();', '');
            }
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
    await click('[data-page=career]');
    await click('.arc-primary');
    const beforeSave = await evaluate('localStorage.getItem("welding-master-arcade-v1")');
    assert.equal(JSON.parse(beforeSave).last.mode, 'career');
    currentRelease = true;
    await evaluate("navigator.serviceWorker.getRegistration().then(registration => registration.update())");
    await until('!document.getElementById("update-notice").hidden', 'An existing tab receives the update notice');
    assert.equal(await evaluate('localStorage.getItem("welding-master-arcade-v1")'), beforeSave);
    await send('Network.enable');
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    const beforeOffline = await evaluate('performance.timeOrigin');
    await click('#update-reload');
    await until('performance.timeOrigin !== ' + beforeOffline + ' && document.readyState === "complete" && Boolean(document.querySelector("#canvas-container canvas")) && document.querySelector("#startup-error").hidden', 'Offline static reload initializes WebGL');
    assert.equal(await evaluate('localStorage.getItem("welding-master-arcade-v1")'), beforeSave);
    assert.equal(await evaluate('document.getElementById("resume-game").hidden'), false);
    info('Publicação estática em subpasta, recarregamento offline e progresso preservado.');
    assert.deepEqual(uncaught, []);
    }
} finally {
    clearTimeout(killTimer);
    socket?.close();
    chrome.kill();
    server?.close();
}
