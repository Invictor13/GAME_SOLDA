'use strict';

function createWorkshopView() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x131c23);
    scene.fog = new THREE.FogExp2(0x131c23, 0.044);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 70);
    const light = new THREE.HemisphereLight(0xbddcff, 0x332922, 0.85);
    scene.add(light);
    const key = new THREE.DirectionalLight(0xffddb5, 1.9);
    key.position.set(5, 10, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -11, right: 11, top: 9, bottom: -9, far: 30 });
    key.shadow.normalBias = 0.035;
    scene.add(key);
    const cool = new THREE.PointLight(0x76bdff, 1.55, 21, 1.5);
    cool.position.set(-3, 4, -5);
    scene.add(cool);

    const material = (color, metalness = .25, roughness = .63) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
    const wall = material(0x354854), floor = material(0x34383a), frame = material(0x202a31, .55);
    const steel = material(0x89989c, .62, .39), edge = material(0x526268, .57, .46);
    const yellow = material(0xc78a39), rubber = material(0x13191d), copper = material(0xb27652, .48);
    const cabinet = material(0x334e5b), paper = material(0xbeb7a3, 0, .95);
    const lamp = new THREE.MeshBasicMaterial({ color: 0xffe0ae });
    const boxCache = new Map();
    const deliveries = new Map();

    function box(parent, mat, width, height, depth, x, y, z) {
        const dimensions = [width, height, depth].join(',');
        if (!boxCache.has(dimensions)) boxCache.set(dimensions, new THREE.BoxGeometry(width, height, depth));
        const mesh = new THREE.Mesh(boxCache.get(dimensions), mat);
        mesh.position.set(x, y, z);
        mesh.castShadow = mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    }
    box(scene, floor, 37, .2, 34, 0, -.11, 0);
    box(scene, wall, 32, 10, .22, 0, 4.9, -7);
    box(scene, wall, .25, 10, 19, 11, 4.9, 1);
    for (let x = -12; x < 12; x += 3) {
        box(scene, frame, .17, 10, .29, x, 5, -6.83);
        box(scene, edge, 2.84, .035, .045, x + 1.5, 4.4, -6.83);
    }
    for (const x of [-6, 1, 8]) {
        box(scene, frame, 4.4, .18, .7, x, 6.7, -2);
        box(scene, lamp, 4.12, .045, .3, x, 6.585, -2);
    }
    for (const x of [-4.7, 6.7]) box(scene, yellow, .08, .012, 11, x, .008, 1);
    const table = new THREE.Group();
    table.position.set(2, 0, 0);
    scene.add(table);
    box(table, frame, 7.3, .22, 3.4, 0, 1.91, 0);
    box(table, steel, 7.4, .13, 3.55, 0, 2.055, 0);
    box(table, edge, 6.8, .11, 2.7, 0, .57, 0);
    for (const x of [-3.25, 3.25]) for (const z of [-1.4, 1.4]) {
        box(table, frame, .24, 1.9, .24, x, .95, z);
        box(table, rubber, .37, .08, .37, x, .04, z);
    }
    for (let x = -3.45; x <= 3.45; x += .42) {
        const slit = box(table, yellow, .18, .075, .022, x, 1.91, 1.712);
        slit.rotation.z = -.4;
    }
    box(table, cabinet, 1.5, 1.05, 1.45, -2.3, 1.13, .08);
    for (const y of [.83, 1.12, 1.42]) {
        box(table, frame, 1.36, .24, .045, -2.3, y, .817);
        box(table, steel, .65, .04, .08, -2.3, y + .04, .865);
    }
    const board = new THREE.Group();
    board.position.set(3.85, 2.17, -.85);
    board.rotation.set(-.17, -.10, .17);
    table.add(board);
    box(board, copper, .85, .05, 1.03, 0, 0, 0);
    box(board, paper, .74, .013, .92, 0, .035, -.003);
    box(board, steel, .34, .043, .12, 0, .06, -.44);
    for (let z = -.29; z < .39; z += .13) box(board, edge, .49, .005, .009, -.02, .044, z);

    box(scene, frame, 7.2, 3.37, .2, 3.1, 3.43, -6.66);
    box(scene, cabinet, 7, 3.18, .045, 3.1, 3.43, -6.53);
    for (const x of [.3, 1.28, 2.38, 3.45, 4.6, 5.65]) {
        box(scene, steel, .13, .78, .12, x, 3.63, -6.44).rotation.z = .17;
        box(scene, rubber, .17, .34, .16, x + .064, 3.33, -6.42).rotation.z = .17;
    }
    box(scene, yellow, 1.35, 1.06, .75, 6.14, .59, -.3);
    box(scene, frame, 1.07, .70, .05, 6.14, .64, .09);
    for (const y of [.54, .68, .82]) box(scene, edge, .72, .025, .025, 6.14, y, .12);
    const line = new THREE.CatmullRomCurve3([
        new THREE.Vector3(6.35,.31,.1), new THREE.Vector3(6.7,.10,1.2),
        new THREE.Vector3(5.8,.06,2.2), new THREE.Vector3(4.9,.08,2),
        new THREE.Vector3(4.7, .9,1.75), new THREE.Vector3(4.65,2.17,1.2)
    ]);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(line, 26, .043, 6, false), rubber));
    box(table, rubber, .92, .13, .15, 2.55, 2.25, 1.1).rotation.y = -.48;
    box(table, copper, .25, .15, .17, 2.18, 2.25, .91).rotation.y = -.48;

    const samples = Array.from({ length: 4 + workshopAssemblies.length }, () => {
        const sample = new THREE.Group();
        sample.position.set(0, 2.15, -.20);
        table.add(sample);
        return sample;
    });
    for (const x of [-.60, .60]) box(samples[0], steel, 1.13, .18, 2.0, x, .12, 0).rotation.z = x > 0 ? -.08 : .08;
    box(samples[1], edge, 2.25, .15, 1.7, 0, .10, 0);
    box(samples[1], steel, 1.86, .79, .17, 0, .53, 0);
    const curve = new THREE.CatmullRomCurve3([-1,-.5,0,.5,1].map(x => new THREE.Vector3(x,.14,Math.sin(x * 2) * .37)));
    const curved = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, .053, 8, false), copper);
    box(samples[2], steel, 2.3, .20, 1.75, 0, .08, 0);
    samples[2].add(curved);
    for (const x of [-.47, .47]) {
        const shape = new THREE.Shape();
        shape.absarc(0,0,.55,0,Math.PI * 2,false);
        const hole = new THREE.Path();
        hole.absarc(0,0,.43,0,Math.PI * 2,true);
        shape.holes.push(hole);
        const tube = new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.84,steps:1,bevelEnabled:false,curveSegments:14}), steel);
        tube.rotation.y = Math.PI / 2;
        tube.position.set(x - .42,.56,0);
        tube.castShadow = tube.receiveShadow = true;
        samples[3].add(tube);
    }
    workshopAssemblies.forEach((part, index) => {
        const sample = samples[index + 4];
        const scale = 2.35 / part.length;
        part.depths.forEach((depth, side) => {
            const sign = side ? 1 : -1;
            const mesh = new THREE.Mesh(makeAssemblyPartGeometry(part, side), side ? edge : steel);
            mesh.scale.setScalar(scale);
            mesh.position.set(sign * .1, part.height * scale / 2, sign * (depth * scale / 2 + .14));
            mesh.castShadow = mesh.receiveShadow = true;
            sample.add(mesh);
        });
    });
    const dustGeometry = new THREE.BufferGeometry();
    const dustPositions = [];
    for (let i = 0; i < 42; i++) {
        dustPositions.push(1 + Math.sin(i * 12.9898) * 4.3, 1.6 + (i % 13) * .2, Math.cos(i * 5.17) * 3);
    }
    dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dustPositions, 3));
    const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
        color: 0xffd19a, size: .046, transparent: true, opacity: .32, depthWrite: false
    }));
    scene.add(dust);
    let target = 'home';
    let piece = 0;
    let pointerX = 0;
    let pointerY = 0;
    let needsFrame = true;
    let frameTime = 0;
    let lastWidth = 0;
    let lastHeight = 0;
    let lastFinish = '';
    const goal = new THREE.Vector3();
    const look = new THREE.Vector3(-.7, 2.6, 0);
    const focus = new THREE.Vector3();
    camera.position.set(8, 5.6, 10);
    function select(next, nextPiece = piece) {
        target = next;
        needsFrame = true;
        piece = nextPiece;
        samples.forEach((sample, i) => { sample.visible = i === piece; });
    }
    select('home');
    function draw(renderer, dt, reduced, low, narrow, finish) {
        const { width, height, clientWidth, clientHeight } = renderer.domElement;
        if (width !== lastWidth || height !== lastHeight || finish !== lastFinish) {
            lastWidth = width;
            lastHeight = height;
            lastFinish = finish;
            needsFrame = true;
        }
        frameTime += dt;
        if (frameTime < 1 / 30) return;
        dt = Math.min(frameTime, .1);
        frameTime = 0;
        const aspect = clientWidth / Math.max(1, clientHeight);
        if (aspect !== camera.aspect) {
            camera.aspect = aspect;
            camera.updateProjectionMatrix();
        }
        goal.set(target === 'career' ? 5.6 : 8.1, target === 'career' ? 4.4 : 5.6, target === 'workshop' ? 8.9 : 10.7);
        focus.set(narrow ? 1.9 : target === 'career' ? -.15 : -.8, 2.3, 0);
        if (narrow) goal.set(7.7, 6.1, 14.8);
        if (!reduced && !low) {
            goal.x += pointerX * .48;
            goal.y += pointerY * .25;
        }
        const moving = camera.position.distanceToSquared(goal) > .00001 || look.distanceToSquared(focus) > .00001;
        if (!needsFrame && !moving && (reduced || low)) return;
        needsFrame = false;
        const blend = reduced ? 1 : 1 - Math.exp(-dt * 4);
        camera.position.lerp(goal, blend);
        look.lerp(focus, blend);
        camera.lookAt(look);
        key.color.setHex(finish === 'blue' ? 0xa8caff : finish === 'copper' ? 0xffab77 : 0xffddb5);
        dust.visible = !reduced && !low;
        if (dust.visible) dust.rotation.y += dt * .035;
        renderer.render(scene, camera);
    }
    function thumbnail(renderer, canvas) {
        needsFrame = true;
        const source = renderer.domElement;
        const aspect = source.width / Math.max(1, source.height);
        const camera = new THREE.PerspectiveCamera(aspect < 1 ? 62 : 38, aspect, .1, 70);
        camera.position.set(4.95, 4.45, 4.1);
        camera.lookAt(2, 2.48, -.2);
        renderer.render(scene, camera);
        const ratio = canvas.width / canvas.height;
        const width = Math.min(source.width, source.height * ratio);
        const height = width / ratio;
        const context = canvas.getContext('2d');
        context.drawImage(source, (source.width - width) / 2, (source.height - height) / 2, width, height, 0, 0, canvas.width, canvas.height);
    }
    function showDeliveries(entries) {
        for (const [index, entry] of Object.entries(entries)) {
            if (!entry.image || deliveries.get(index)?.image === entry.image) continue;
            const previous = deliveries.get(index);
            previous?.texture.dispose();
            if (previous) {
                previous.mesh.material.dispose();
                scene.remove(previous.mesh);
            }
            const image = new Image();
            const texture = new THREE.Texture(image);
            texture.encoding = THREE.sRGBEncoding;
            const panel = new THREE.MeshBasicMaterial({ map: texture, color: 0xffffff });
            const x = -5.85 + Number(index) % 2 * 3.1;
            const y = 4.75 - Math.floor(Number(index) / 2) * 1.45;
            if (!previous) box(scene, frame, 2.82, 1.22, .09, x, y, -6.64);
            const mesh = box(scene, panel, 2.7, 1.12, .02, x, y, -6.57);
            mesh.visible = false;
            mesh.castShadow = mesh.receiveShadow = false;
            deliveries.set(index, { image: entry.image, texture, mesh });
            image.onload = () => {
                if (deliveries.get(index)?.texture !== texture) return;
                texture.needsUpdate = mesh.visible = needsFrame = true;
            };
            image.src = entry.image;
        }
    }
    return { draw, select, thumbnail, showDeliveries, move(x, y) { pointerX = x; pointerY = y; needsFrame = true; } };
}
