'use strict';

const MobileControl = (() => {
    const profiles = {
        casual: { speed: 1, dead: .16, curve: 1.45, assist: .34, follow: true },
        precision: { speed: .55, dead: .12, curve: 1.75, assist: .12, follow: true },
        professional: { speed: .75, dead: .12, curve: 1.5, assist: 0, follow: false }
    };

    function axis(dx, dy, radius, profile) {
        const length = Math.hypot(dx, dy);
        if (!length) return [0, 0];
        const force = Math.max(0, (Math.min(1, length / radius) - profile.dead) / (1 - profile.dead)) ** profile.curve;
        return [dx / length * force, dy / length * force];
    }

    function bind({ stick, knob, arc, surface, view = window, page = document, enabled, profile, begin, end, zoom, pan, adjustGap = () => {}, floating = () => false }) {
        let stickId = null, arcId = null;
        let vector = [0, 0];
        const fingers = new Map();
        let distance = 0;
        let lastArcY = 0;
        let origin = null;
        function release(target, id) {
            if (id !== null && target.hasPointerCapture(id)) target.releasePointerCapture(id);
        }
        function clearStick() {
            const id = stickId;
            stickId = null;
            vector = [0, 0];
            origin = null;
            knob.style.transform = '';
            release(stick, id);
        }
        function cancelArc() {
            if (arcId === null) return;
            const id = arcId;
            arcId = null;
            arc.setAttribute('aria-pressed', 'false');
            end();
            release(arc, id);
        }
        function reset() {
            clearStick();
            cancelArc();
            const ids = [...fingers.keys()];
            fingers.clear();
            distance = 0;
            ids.forEach(id => release(surface, id));
        }
        function moveStick(event) {
            const box = stick.getBoundingClientRect();
            const radius = Math.max(12, Math.min(box.width, box.height) * .34);
            const centerX = box.left + box.width / 2;
            const centerY = box.top + box.height / 2;
            const dx = event.clientX - (origin?.[0] ?? centerX);
            const dy = event.clientY - (origin?.[1] ?? centerY);
            vector = axis(dx, dy, radius, profile());
            const length = Math.max(1, Math.hypot(dx, dy) / radius);
            knob.style.transform = `translate(${(origin?.[0] ?? centerX) - centerX + dx / length}px, ${(origin?.[1] ?? centerY) - centerY + dy / length}px)`;
        }
        stick.addEventListener('pointerdown', event => {
            if (!enabled() || stickId !== null || event.button !== 0) return;
            stickId = event.pointerId;
            if (floating()) origin = [event.clientX, event.clientY];
            stick.setPointerCapture(stickId);
            moveStick(event);
        });
        stick.addEventListener('pointermove', event => {
            if (event.pointerId === stickId) moveStick(event);
        });
        arc.addEventListener('pointerdown', event => {
            if (!enabled() || arcId !== null || event.button !== 0) return;
            arcId = event.pointerId;
            if (!begin()) { arcId = null; return; }
            lastArcY = event.clientY;
            arc.setPointerCapture(arcId);
            arc.setAttribute('aria-pressed', 'true');
        });
        arc.addEventListener('pointermove', event => {
            if (event.pointerId !== arcId) return;
            adjustGap(lastArcY - event.clientY);
            lastArcY = event.clientY;
        });
        for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
            stick.addEventListener(name, event => { if (event.pointerId === stickId) clearStick(); });
            arc.addEventListener(name, event => { if (event.pointerId === arcId) cancelArc(); });
            surface.addEventListener(name, event => {
                if (fingers.delete(event.pointerId)) distance = 0;
            });
        }
        view.addEventListener('blur', reset);
        view.addEventListener('resize', reset);
        page.addEventListener('visibilitychange', () => { if (page.hidden) reset(); });
        surface.addEventListener('pointerdown', event => {
            if (!enabled() || event.pointerType !== 'touch' || arcId !== null || fingers.size === 2) return;
            fingers.set(event.pointerId, [event.clientX, event.clientY]);
            surface.setPointerCapture(event.pointerId);
            if (fingers.size === 2) {
                const [a, b] = fingers.values();
                distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
            }
        });
        surface.addEventListener('pointermove', event => {
            if (!fingers.has(event.pointerId) || arcId !== null) return;
            const old = fingers.get(event.pointerId);
            fingers.set(event.pointerId, [event.clientX, event.clientY]);
            if (fingers.size === 1) pan(event.clientX - old[0], event.clientY - old[1]);
            else {
                const [a, b] = fingers.values();
                const next = Math.hypot(a[0] - b[0], a[1] - b[1]);
                if (distance > 8 && next > 8) zoom(distance / next);
                distance = next;
            }
        });
        return { reset, cancelArc, vector: () => vector, welding: () => arcId !== null };
    }
    return { profiles, axis, bind };
})();
