'use strict';

const WeldingPerformance = (() => {
    const STEP = 1 / 60;
    const MAX_STEPS = 3;
    function makeClock() {
        let pending = 0;
        return {
            reset() { pending = 0; },
            take(seconds) {
                pending = Math.min(STEP * MAX_STEPS, pending + Math.max(0, seconds));
                const ticks = Math.min(MAX_STEPS, Math.floor((pending + 1e-9) / STEP));
                pending = Math.max(0, pending - ticks * STEP);
                return ticks;
            }
        };
    }

    const profiles = {
        low: { cap: 1, floor: .65, shadows: false, effectsHz: 24 },
        standard: { cap: 1.5, floor: .75, shadows: true, effectsHz: 40 },
        high: { cap: 2, floor: .9, shadows: true, effectsHz: 60 }
    };
    function resolutionState() {
        let scale = 1;
        let elapsed = 0;
        let slow = 0;
        let fast = 0;
        let frames = 0;
        return {
            scale() { return scale; },
            sample(ms) {
                if (ms <= 0 || ms > 180) return false;
                elapsed += ms;
                frames++;
                if (ms >= 24) slow++;
                if (ms <= 18) fast++;
                if (elapsed < 1500) return false;
                const previous = scale;
                if (slow / frames >= .55) scale = Math.max(.5, scale - .12);
                else if (fast / frames >= .94 && elapsed >= 4500) scale = Math.min(1, scale + .08);
                if (slow / frames >= .55 || fast / frames < .94 || elapsed >= 4500) elapsed = slow = fast = frames = 0;
                return previous !== scale;
            }
        };
    }
    const controls = {
        precision: { smoothing: 12, assist: 0 },
        realistic: { smoothing: 44, assist: 0 },
        assisted: { smoothing: 24, assist: .42 }
    };
    function visualBlend(smoothing, seconds) {
        return smoothing > 0 ? 1 - Math.exp(-seconds / (.008 + .14 * (smoothing / 100) ** 2)) : 1;
    }

    const sampleSize = 360;
    const series = new Map();
    let enabled = new URLSearchParams(location.search).has('perf');
    let count = 0;
    let inputTime = null;
    function sample(name, value) {
        if (!enabled || !Number.isFinite(value)) return;
        if (!series.has(name)) series.set(name, { values: new Float64Array(sampleSize), index: 0, size: 0 });
        const row = series.get(name);
        row.values[row.index] = value;
        row.index = (row.index + 1) % sampleSize;
        row.size = Math.min(row.size + 1, sampleSize);
    }
    function metrics(name) {
        const row = series.get(name);
        if (!row?.size) return null;
        const values = row.values.slice(0, row.size).sort();
        const quantile = p => values[Math.ceil(p * values.length) - 1];
        return { mean: values.reduce((a, b) => a + b, 0) / values.length, p50: quantile(.5), p95: quantile(.95), p99: quantile(.99), n: values.length };
    }
    function memory(scene) {
        const buffers = new Set(), textures = new Set();
        scene.traverse(object => {
            const geo = object.geometry;
            if (geo) for (const attr of [...Object.values(geo.attributes), geo.index]) {
                const array = attr?.array ?? attr?.data?.array;
                if (array) buffers.add(array.buffer);
            }
            for (const mat of [].concat(object.material ?? [])) {
                for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
            }
        });
        if (scene.environment?.isTexture) textures.add(scene.environment);
        return {
            geometryBytes: [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0),
            textureBytesApprox: [...textures].reduce((sum, texture) => {
                const images = Array.isArray(texture.image) ? texture.image : [texture.image];
                return sum + images.reduce((total, image) => total + (image?.width || 0) * (image?.height || 0)
                    * (texture.type === 1015 ? 4 : texture.type === 1016 ? 2 : 1) * 4 * (texture.generateMipmaps ? 4 / 3 : 1), 0);
            }, 0)
        };
    }
    let graphics = {};
    function report() {
        const frame = metrics('frame');
        return { fps: frame ? 1000 / frame.mean : null, frame, physics: metrics('physics'), geometry: metrics('geometry'),
            raycast: metrics('raycast'), hud: metrics('hud'), inputToRender: metrics('input'), ...graphics };
    }
    function rendered(renderer, scene) {
        if (!enabled) return;
        if (inputTime !== null) {
            sample('input', performance.now() - inputTime);
            inputTime = null;
        }
        if (++count % 30 !== 1) return;
        graphics = { ...memory(scene), drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
        updateReadout();
    }
    function updateReadout() {
        const output = document.getElementById('performance-readout');
        if (output) {
            const r = report();
            if (!r.frame) { output.textContent = 'Jogue um passe e retorne a estas configurações para consultar as amostras.'; return; }
            const fmt = value => Number.isFinite(value) ? value.toFixed(1) : '—';
            output.textContent = [
                `${fmt(r.fps)} FPS · ${r.drawCalls} draw calls · ${r.triangles} triângulos`,
                `Quadro p50/p95/p99: ${fmt(r.frame?.p50)} / ${fmt(r.frame?.p95)} / ${fmt(r.frame?.p99)} ms`,
                `Média por quadro: física ${fmt(r.physics?.mean)} · malha ${fmt(r.geometry?.mean)} · HUD ${fmt(r.hud?.mean)} ms`,
                `Raycast médio: ${fmt(r.raycast?.mean)} ms · Entrada até envio do quadro p95: ${fmt(r.inputToRender?.p95)} ms`,
                `Memória estimada da cena: malhas ${fmt(r.geometryBytes / 1048576)} MiB · texturas ${fmt(r.textureBytesApprox / 1048576)} MiB`
            ].join('\n');
        }
    }
    return { STEP, makeClock, profiles, resolutionState, controls, visualBlend, report, sample, rendered, updateReadout,
        now: () => enabled ? performance.now() : null,
        timed(name, start) { if (start !== null) sample(name, performance.now() - start); },
        input(start) { if (enabled && inputTime === null) inputTime = start; },
        clearInput() { inputTime = null; },
        enable(value) { if (enabled === value) return; enabled = value; series.clear(); count = 0; inputTime = null; graphics = {}; },
        enabled: () => enabled };
})();
