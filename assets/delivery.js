'use strict';

function captureBenchPhoto() {
    const source = renderer.domElement;
    const photo = document.createElement('canvas');
    photo.width = 360;
    photo.height = 202;
    const aspect = source.width / source.height;
    const shot = new THREE.PerspectiveCamera(42, aspect, .1, 100);
    const distance = Math.max(1, 1.15 / aspect);
    shot.position.set(5 * distance, 6.8 * distance, 8.1 * distance);
    shot.lookAt(0, STRUCTURES[currentLevel].isPipe ? 1.25 : .45, 0);
    const lamp = new THREE.DirectionalLight(0xffe0a6, 1.15);
    lamp.position.set(-1, 1, 4);
    scene.add(lamp);
    try {
        renderer.render(scene, shot);
        const targetRatio = photo.width / photo.height;
        const cropWidth = Math.min(source.width, source.height * targetRatio);
        const cropHeight = cropWidth / targetRatio;
        photo.getContext('2d').drawImage(source, (source.width - cropWidth) / 2, (source.height - cropHeight) / 2,
            cropWidth, cropHeight, 0, 0, photo.width, photo.height);
    } finally {
        scene.remove(lamp);
    }
    return photo;
}

function createDeliveryCard(title, result, before, after) {
    const card = document.createElement('canvas');
    card.width = 768;
    card.height = 318;
    const ctx = card.getContext('2d');
    ctx.fillStyle = '#141e27';
    ctx.fillRect(0, 0, card.width, card.height);
    ctx.fillStyle = '#ffba61';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('WELDING MASTER 3D', 16, 27);
    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = '#f4f0e9';
    ctx.fillText(title, 16, 65);
    ctx.textAlign = 'right';
    ctx.fillText(result, 752, 65);
    ctx.textAlign = 'left';
    if (before) ctx.drawImage(before, 16, 82);
    ctx.drawImage(after, 392, 82);
    ctx.fillStyle = '#f4f0e9';
    ctx.font = '16px sans-serif';
    ctx.fillText('Antes', 16, 305);
    ctx.fillText('Depois', 392, 305);
    return card;
}
