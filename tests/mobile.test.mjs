import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = name => readFileSync(new URL('../assets/' + name + '.js', import.meta.url), 'utf8');
const controls = runInNewContext(source('mobile-controls') + '\nMobileControl');
const camera = runInNewContext(source('mobile-camera') + '\nMobileCamera');

function fixture(floating = false) {
    function node() {
        const target = new EventTarget();
        const captures = new Set();
        return Object.assign(target, {
            setPointerCapture: id => captures.add(id),
            hasPointerCapture: id => captures.has(id),
            releasePointerCapture: id => captures.delete(id),
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
            setAttribute() {},
            style: {}
        });
    }
    const stick = node(), arc = node(), surface = node(), view = node(), page = node();
    const calls = { begin: 0, end: 0, zoom: [] };
    const input = controls.bind({
        stick, knob: node(), arc, surface, view, page,
        enabled: () => true, profile: () => controls.profiles.casual, floating: () => floating,
        begin: () => (++calls.begin, true), end: () => { calls.end++; },
        zoom: factor => calls.zoom.push(factor), pan() {}
    });
    const fire = (target, type, pointerId, x = 50, y = 50) => target.dispatchEvent(Object.assign(new Event(type), {
        pointerId, clientX: x, clientY: y, button: 0, pointerType: 'touch'
    }));
    return { stick, arc, surface, view, input, calls, fire };
}

test('floating joystick starts from the touch and resets its origin after release', () => {
    const { stick, input, fire } = fixture(true);
    fire(stick, 'pointerdown', 1, 25, 40);
    assert.equal(input.vector()[0], 0);
    fire(stick, 'pointermove', 1, 47, 40);
    assert.ok(input.vector()[0] > 0);
    fire(stick, 'pointerup', 1);
    fire(stick, 'pointerdown', 2, 70, 50);
    assert.equal(input.vector()[0], 0);
    fire(stick, 'pointermove', 2, 50, 50);
    assert.ok(input.vector()[0] < 0);
});

test('independent fingers steer and weld, and cancel safely on resize', () => {
    const { stick, arc, view, input, calls, fire } = fixture();
    fire(stick, 'pointerdown', 1, 52);
    assert.equal(input.vector()[0], 0);
    fire(arc, 'pointerdown', 2);
    fire(stick, 'pointermove', 1, 74);
    assert.ok(input.vector()[0] > 0);
    assert.equal(input.welding(), true);
    fire(stick, 'pointercancel', 1);
    assert.equal(input.vector()[0], 0);
    assert.equal(input.welding(), true);
    view.dispatchEvent(new Event('resize'));
    assert.equal(input.welding(), false);
    assert.equal(calls.end, 1);
});

test('pinch without the arc zooms; pointer loss stops the arc', () => {
    const { arc, surface, input, calls, fire } = fixture();
    fire(surface, 'pointerdown', 1, 15);
    fire(surface, 'pointerdown', 2, 45);
    fire(surface, 'pointermove', 2, 65);
    assert.deepEqual(calls.zoom, [.6]);
    fire(arc, 'pointerdown', 3);
    fire(surface, 'pointermove', 2, 80);
    assert.equal(calls.zoom.length, 1);
    fire(arc, 'lostpointercapture', 3);
    assert.equal(input.welding(), false);
    assert.equal(calls.end, 1);
});

test('camera follow anticipates movement outside the center and clamps zoom', () => {
    assert.deepEqual(Array.from(camera.followOffset(0, 0, 0, 0)), [0, 0]);
    assert.ok(camera.followOffset(.55, 0, 1, 0)[0] > camera.followOffset(.55, 0, 0, 0)[0]);
    assert.equal(camera.zoomRadius(40, 2), 48);
    assert.equal(camera.zoomRadius(3, .2), 2.4);
});
