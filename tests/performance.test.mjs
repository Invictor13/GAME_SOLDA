import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../assets/performance.js', import.meta.url), 'utf8');
const perf = runInNewContext(source + '\nWeldingPerformance', { URLSearchParams, location: { search: '' } });

test('fixed steps integrate the same duration at ordinary rendering rates', () => {
    for (const fps of [30, 50, 60, 75, 120, 144]) {
        const clock = perf.makeClock();
        let ticks = 0;
        for (let i = 0; i < 2 * fps; i++) ticks += clock.take(1 / fps);
        assert.equal(ticks, 120, String(fps));
    }
});

test('a long stall is capped and resetting discards elapsed simulation time', () => {
    const clock = perf.makeClock();
    assert.equal(clock.take(4), 3);
    assert.equal(clock.take(1 / 120), 0);
    clock.reset();
    assert.equal(clock.take(1 / 120), 0);
    assert.equal(clock.take(1 / 120), 1);
});

test('adaptive quality reacts to sustained slowdown and recovers more slowly', () => {
    const state = perf.resolutionState();
    for (let i = 0; i < 44; i++) state.sample(33);
    assert.equal(state.scale(), 1);
    state.sample(60);
    assert.ok(state.scale() < 1);
    const lower = state.scale();
    for (let i = 0; i < 100; i++) state.sample(16);
    assert.equal(state.scale(), lower);
    for (let i = 0; i < 200; i++) state.sample(16);
    assert.ok(state.scale() > lower);
});

test('visual smoothing can be disabled and has time-consistent blending', () => {
    assert.equal(perf.visualBlend(0, 1 / 60), 1);
    const half = perf.visualBlend(44, 1 / 120);
    assert.ok(Math.abs(1 - (1 - half) ** 2 - perf.visualBlend(44, 1 / 60)) < 1e-9);
    assert.ok(perf.visualBlend(12, 1 / 60) > perf.visualBlend(44, 1 / 60));
});
