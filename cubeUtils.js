import * as THREE from 'three';

export const getCubeVertices = (min, max) => {
    const boxGeo = new THREE.BoxGeometry(2, 2, 2);
    const nonIndexedBoxGeo = boxGeo.toNonIndexed();
    const poses = nonIndexedBoxGeo.attributes.position.array;
    const vertices = poses.map((v, i) => {
        const targetSide = v > 0 ? max : min;
        const index = i % 3;
        return targetSide[index];
    });
    return vertices;
}
