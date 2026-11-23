'use strict';

const MobileCamera = (() => {
    function followOffset(x, y, dx, dy) {
        const excess = (value, margin) => Math.sign(value) * Math.max(0, Math.abs(value) - margin);
        return [excess(x + dx * .22, .43), excess(y - dy * .22, .34)];
    }
    const zoomRadius = (radius, factor) => Math.max(2.4, Math.min(48, radius * factor));
    return { followOffset, zoomRadius };
})();
