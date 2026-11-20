import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const controls = html.slice(html.indexOf('        function bindPointerControls('), html.indexOf('        function evaluateWeld('));
const bind = runInNewContext(controls + '\nbindPointerControls');

function setup() {
    const canvas = new EventTarget();
    const view = new EventTarget();
    const page = new EventTarget();
    const points = [];
    let capture = null;
    canvas.setPointerCapture = id => { capture = id; };
    canvas.hasPointerCapture = id => capture === id;
    canvas.releasePointerCapture = () => { capture = null; };
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100 });
    bind(canvas, {
        aim: (x, y) => (points.push([x, y]), true),
        startArc() {}, stopArc() {}, orbit() {}, activateAudio() {}, sensitivity: () => 2
    }, { window: view, document: page });
    function fire(target, type, x, pointerType = 'mouse') {
        target.dispatchEvent(Object.assign(new Event(type), {
            pointerId: 1, button: 0, buttons: 1, clientX: x, clientY: 40, pointerType
        }));
    }
    return { canvas, view, points, fire };
}

test('mouse and trackpad preserve the press location, then scale the drag', () => {
    const { canvas, view, points, fire } = setup();
    fire(canvas, 'pointerdown', 40);
    fire(view, 'pointermove', 50);
    fire(view, 'pointermove', 75);
    fire(view, 'pointermove', 72);
    fire(view, 'pointerup', 72);
    fire(canvas, 'pointerdown', 30);
    assert.deepEqual(points, [[40, 40], [60, 40], [100, 40], [94, 40], [30, 40]]);
});

test('touch and unpressed mouse aiming keep their original coordinates', () => {
    const { canvas, view, points, fire } = setup();
    fire(view, 'pointermove', 25);
    fire(canvas, 'pointerdown', 40, 'touch');
    fire(view, 'pointermove', 50, 'touch');
    assert.deepEqual(points, [[25, 40], [40, 40], [50, 40]]);
});
