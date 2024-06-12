import * as THREE from 'three';
import { getCubeVertices } from './cubeUtils';

/**
 * @type {THREE.Matrix4}
 */
let worldMatrix = new THREE.Matrix4();
/**
 * @type {THREE.Matrix4}
 */
let invMatrix = new THREE.Matrix4();

export let defaultColor = 0x00ff00;
export let defaultLineThickness = 1;
export let defaultNormalSize = 1;
export let defaultSphereRadius = 0.1;

export const setDefaultColor = (color) => defaultColor = color;
export const setDefaultLineThickness = (thickness) => defaultLineThickness = thickness;
export const setDefaultNormalSize = (size) => defaultNormalSize = size;
export const setDefaultSphereRadius = (radius) => defaultSphereRadius = radius;


/**
 * 
 * @param {THREE.Matrix4} m 
 */
export const setMatrix = (m) => {
    worldMatrix = m.clone();
    invMatrix = m.clone().invert();
};

/**
 * 
 * @param {THREE.Vector3} pos 
 * @param {number} radius 
 * @param {number} color 
 * @returns 
 */
export const drawSphere = (pos, color, radius) => {
    color = color ?? defaultColor;
    radius = radius ?? defaultSphereRadius;
    const mat = new THREE.MeshBasicMaterial({color: color});
    const geo = new THREE.SphereGeometry(radius, 32, 32);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    return mesh;
}

/**
 * 
 * @param {THREE.Vector3} pos 
 * @param {number} radius 
 * @param {number} color 
 * @returns 
 */
export const drawSphereLocal = (pos, color, radius) => {
    const worldPos = pos.clone().applyMatrix4(worldMatrix);
    return drawSphere(worldPos, color, radius);
}

/**
 * 
 * @param {THREE.Vector3} p1 
 * @param {THREE.Vector3} p2
 * @param {THREE.Vector3} p3
 * @param {number} color
 * @param {number} thickness 
 * @returns 
 */
export const drawTriangle = (p1, p2, p3, color, thickness) => {
    const objectGroup = new THREE.Object3D();
    const line1 = drawLine(p1, p2, color, thickness);
    const line2 = drawLine(p2, p3, color, thickness);
    const line3 = drawLine(p3, p1, color, thickness);
    objectGroup.add(line1);
    objectGroup.add(line2);
    objectGroup.add(line3);
    return objectGroup;
}

/**
 * 
 * @param {THREE.Vector3} p1 
 * @param {THREE.Vector3} p2
 * @param {THREE.Vector3} p3
 * @param {number} color
 * @param {number} thickness 
 * @returns 
 */
export const drawTriangleLocal = (p1, p2, p3, color, thickness) => {
    const worldP1 = p1.clone().applyMatrix4(worldMatrix);
    const worldP2 = p2.clone().applyMatrix4(worldMatrix);
    const worldP3 = p3.clone().applyMatrix4(worldMatrix);
    return drawTriangle(worldP1, worldP2, worldP3, color, thickness);
}
/**
 * 
 * @param {THREE.Vector3} start 
 * @param {THREE.Vector3} end
 * @param {number} color
 * @param {number} thickness 
 * @returns 
 */
export const drawLine = (start, end, color, thickness) => {
    color = color ?? defaultColor;
    thickness = thickness ?? defaultLineThickness;
    const mat = new THREE.LineBasicMaterial({color: color, linewidth: thickness});
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const line = new THREE.Line(geo, mat);
    return line;
}

/**
 * 
 * @param {THREE.Vector3} start 
 * @param {THREE.Vector3} end
 * @param {number} color
 * @param {number} thickness 
 * @returns 
 */
export const drawLineLocal = (start, end, color, thickness) => {
    const worldStart = start.clone().applyMatrix4(worldMatrix);
    const worldEnd = end.clone().applyMatrix4(worldMatrix);
    return drawLine(worldStart, worldEnd, color, thickness);
}

/**
 * 
 * @param {THREE.Vector3} pos 
 * @param {THREE.Vector3} normal 
 * @param {number} size 
 * @param {number} color 
 * @param {number} thickness
 * @returns 
 */
export const drawNormal = (pos, normal, color, thickness, size, minSize) => {
    size = size ?? defaultNormalSize;
    minSize = minSize ?? 0;
    const start = pos.clone().add(normal.clone().multiplyScalar(minSize));
    const end = pos.clone().add(normal.clone().multiplyScalar(size));
    return drawLine(start, end, color, thickness);
}

/**
 * 
 * @param {THREE.Vector3} pos 
 * @param {THREE.Vector3} normal 
 * @param {number} size 
 * @param {number} color 
 * @param {number} thickness
 * @returns 
 */
export const drawNormalLocal = (pos, normal, color, thickness, size, minSize) => {
    const worldPos = pos.clone().applyMatrix4(worldMatrix);
    const worldEnd = pos.clone().add(normal).applyMatrix4(worldMatrix);
    const worldNormal = worldEnd.clone().sub(worldPos).normalize();
    return drawNormal(worldPos, worldNormal, color, thickness, size, minSize);
}

/**
 * 
 * @param {THREE.Vector3} min 
 * @param {number} scale 
 * @param {number} color 
 * @param {number} thickness 
 * @returns 
 */
export const drawCubeLocal = (min, scale, color, thickness) => {
    const worldMin = min.clone().applyMatrix4(worldMatrix);
    const worldMax = (min.clone().add(new THREE.Vector3(scale, scale, scale))).applyMatrix4(worldMatrix);
    const worldScale = worldMax.clone().sub(worldMin).x;
    return drawCube(worldMin, worldScale, color, thickness);
}

/**
 * 
 * @param {THREE.Vector3} min 
 * @param {number} scale 
 * @param {number} color 
 * @param {number} thickness 
 * @returns 
 */
export const drawCube = (min, scale, color, thickness) => {
    return drawRectangle(min, new THREE.Vector3(scale, scale, scale), color, thickness);
}

/**
 * 
 * @param {THREE.Vector3} min 
 * @param {THREE.Vector3} scale 
 * @param {number} color 
 * @param {number} thickness 
 * @returns 
 */
export const drawRectangleLocal = (min, scale, color, thickness) => {
    const worldMin = min.clone().applyMatrix4(worldMatrix);
    const worldMax = (min.clone().add(scale)).applyMatrix4(worldMatrix);
    const worldScale = worldMax.clone().sub(worldMin);
    return drawRectangle(worldMin, worldScale, color, thickness);
}

/**
 * 
 * @param {THREE.Vector3} min 
 * @param {THREE.Vector3} scale 
 * @param {number} color 
 * @param {number} thickness 
 */
export const drawRectangle = (min, scale, color, thickness) => {
    const max = min.clone().add(scale);
    const vertices = getCubeVertices([min.x, min.y, min.z], [max.x, max.y, max.z]);
    const geo = new THREE.BufferGeometry();
    const verticesArr = new Float32Array(vertices);
    geo.setAttribute('position', new THREE.BufferAttribute(verticesArr, 3));
    color = color ?? defaultColor;
    thickness = thickness ?? defaultLineThickness;
    const mat = new THREE.MeshBasicMaterial({color: color, wireframe: true, wireframeLinewidth: thickness});
    const mesh = new THREE.LineSegments(geo, mat);
    return mesh;
}