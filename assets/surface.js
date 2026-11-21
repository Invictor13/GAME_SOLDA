'use strict';

const workshopAssemblies = [
    { id: 'flat-pair', name: '5. Chapas soltas', length: 6.6, height: .34, depths: [1.9, 1.9], amp: 100 },
    { id: 'block-pair', name: '6. Blocos maciços', length: 4.6, height: 1.05, depths: [1.5, 2], amp: 125 },
    { id: 'bar-pair', name: '7. Barras retangulares', length: 7.1, height: .73, depths: [.64, .86], amp: 110 }
];

function assemblyJoint(part) {
    const rootHeight = .045;
    const rootHalf = .075;
    const bevelRun = (part.height - rootHeight) * .56;
    const grooveHalfWidth = rootHalf + bevelRun;
    return {
        rootHeight, rootHalf, bevelRun, grooveHalfWidth,
        targetFillThickness: part.height - rootHeight,
        baseH: (_u, v) => rootHeight + (part.height - rootHeight)
            * Math.max(0, Math.min(1, (Math.abs(v) - rootHalf) / bevelRun))
    };
}

function makeAssemblyPartGeometry(part, index) {
    const { rootHeight, bevelRun } = assemblyJoint(part);
    const depth = part.depths[index];
    const halfHeight = part.height / 2;
    const sign = index ? 1 : -1;
    const inner = -depth / 2;
    const outer = depth / 2;
    const shape = new THREE.Shape();
    shape.moveTo(sign * inner, -halfHeight);
    shape.lineTo(sign * outer, -halfHeight);
    shape.lineTo(sign * outer, halfHeight);
    shape.lineTo(sign * (inner + bevelRun), halfHeight);
    shape.lineTo(sign * inner, rootHeight - halfHeight);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: part.length, bevelEnabled: false });
    geometry.rotateY(-Math.PI / 2);
    geometry.translate(part.length / 2, 0, 0);
    return geometry;
}

function measureAssemblyFill(field, cols, rows) {
    const sections = 12;
    const { height, rootHalf } = field.spec;
    let weakest = 1;
    // A simulação usa as células de borda da grade como condição de contorno.
    for (let segment = 0; segment < sections; segment++) {
        const start = 1 + Math.floor(segment * (cols - 2) / sections);
        const end = 1 + Math.floor((segment + 1) * (cols - 2) / sections);
        let filled = 0, capacity = 0, root = 0, rootCapacity = 0;
        for (let u = start; u < end; u++) {
            for (let v = 1; v < rows - 1; v++) {
                const index = u * rows + v;
                const depth = height - field.baseH[index];
                if (depth <= .001) continue;
                const deposited = Math.min(depth, field.solidH[index] + field.liquidH[index]);
                capacity += depth;
                filled += deposited;
                if (Math.abs(field.vTable[v]) <= rootHalf) {
                    root += deposited;
                    rootCapacity += depth;
                }
            }
        }
        weakest = Math.min(weakest, capacity ? filled / capacity : 0, rootCapacity ? root / rootCapacity : 0);
    }
    return weakest;
}

function createSurfaceBeads(owner) {
    const capacity = 1536;
    const geo = new THREE.SphereGeometry(1, 8, 5);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .55, roughness: .52 });
    const mesh = new THREE.InstancedMesh(geo, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    owner.add(mesh);
    const stamp = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    const previous = new THREE.Vector3();
    const previousNormal = new THREE.Vector3();
    const scratch = new THREE.Vector3();
    const hot = new THREE.Color(0xff963c);
    const cold = new THREE.Color(0x939691);
    const color = new THREE.Color();
    const cooling = new Map();
    let hasPrevious = false;
    let cursor = 0;

    function deposit(point, normal, amperage) {
        const distance = previous.distanceTo(point);
        const continuous = hasPrevious && distance < .65 && previousNormal.dot(normal) > .8;
        if (continuous && distance < .055) return;
        const count = continuous ? Math.max(1, Math.ceil(distance / .075)) : 1;
        const width = .067 + amperage * .00023;
        stamp.quaternion.setFromUnitVectors(up, normal);
        stamp.scale.set(width, width * .47, width);
        for (let i = 1; i <= count; i++) {
            if (continuous) scratch.lerpVectors(previous, point, i / count);
            else scratch.copy(point);
            stamp.position.copy(scratch).addScaledVector(normal, .014);
            stamp.updateMatrix();
            mesh.setMatrixAt(cursor, stamp.matrix);
            mesh.setColorAt(cursor, hot);
            cooling.set(cursor, 0);
            cursor = (cursor + 1) % capacity;
            mesh.count = Math.min(capacity, mesh.count + 1);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        previous.copy(point);
        previousNormal.copy(normal);
        hasPrevious = true;
    }

    function cool(dt) {
        if (!cooling.size) return;
        for (const [index, age] of cooling) {
            const next = age + dt;
            mesh.setColorAt(index, color.copy(hot).lerp(cold, Math.min(1, next / .85)));
            if (next >= .85) cooling.delete(index);
            else cooling.set(index, next);
        }
        mesh.instanceColor.needsUpdate = true;
    }
    return { deposit, cool, breakStroke() { hasPrevious = false; } };
}
