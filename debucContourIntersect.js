import * as THREE from 'three';
import { VoxelGrid } from 'three-refraction/structures/VoxelGrid';
import { Voxel } from 'three-refraction/structures/temp/gridVoxelization';
import { drawCubeLocal, drawLineLocal, drawNormalLocal, drawRectangleLocal, drawSphereLocal, drawTriangleLocal } from './drawUtils';

/** @type {VoxelGrid} */
let voxelGrid = null;

let primColors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
let primColorIndex = 0;

const edgeNeighbours = [
    [[0,0,0] , [-1,0,0], [-1,-1,0], [0,0,0] , [0,-1,0] , [-1,-1,0]],
    [[-1,1,0], [0,1,0] , [-1,0,0] , [0,0,0], [0,1,0] ,   , [-1,0,0]],
    [[1,0,0] , [0,0,0] , [0,-1,0] , [1,0,0] , [1,-1,0] , [0,-1,0]],
    [[1,1,0] , [0,1,0] , [0,0,0]  , [1,1,0] , [1,0,0]  , [0,0,0]],
    [[0,0,-1], [0,0,0] , [0,-1,-1], [0,-1,0], [0,0,0]  , [0,-1,-1]],
    [[0,1,0] , [0,1,-1], [0,0,-1] , [0,1,0] , [0,0,0]  , [0,0,-1]],
    [[0,0,1] , [0,0,0] , [0,-1,0] , [0,0,1] , [0,-1,1] , [0,-1,0]],
    [[0,1,0], [0,1,1] , [0,0,0]  , [0,1,1] , [0,0,1]  , [0,0,0]],
    [[0,0,-1], [0,0,0] , [-1,0,0] , [0,0,-1], [-1,0,-1], [-1,0,0]],
    [[1,0,-1], [1,0,0] , [0,0,0]  , [1,0,-1], [0,0,-1] , [0,0,0]],
    [[0,0,0] , [0,0,1] , [-1,0,1] , [0,0,0] , [-1,0,0] , [-1,0,1]],
    [[1,0,0] , [1,0,1] , [0,0,1]  , [1,0,0] , [0,0,0]  , [0,0,1]]];

/**
 * @param {THREE.Vector3} point
 * @returns {[number, number, number]}
 */
function pointToIndices(point)
{
    const xIx = Math.floor(point.x);
    const yIx = Math.floor(point.y);
    const zIx = Math.floor(point.z);
    return [xIx, yIx, zIx];
}

class voxel
{
    constructor(coords, isFilled, normalOrDualContouringPos, center, edgeMask)
    {
        /** @type {[number, number, number]} */
        this.coords = coords;
        /** @type {number} */
        this.isFilled = isFilled;
        /** @type {THREE.Vector3} */
        this.normalOrDualContouringPos = normalOrDualContouringPos;
        /** @type {THREE.Vector3} */
        this.center = center;
        /** @type {number} */
        this.edgeMask = edgeMask;
    }
}

const floatBitsToInt = (num) => {
    const intView = new Int32Array(1);
    const floatView = new Float32Array(intView.buffer);
    floatView[0] = num;
    return intView[0];
}

/**
 * @param {[number, number, number]} indices
 * @returns {voxel}
 */
function getVoxelFromIndices(indices)
{
    const [xIx, yIx, zIx] = indices;
    const data = voxelGrid.debugPointsData[xIx][yIx][zIx];
    const center = voxelGrid.gridMin.clone().add(new THREE.Vector3().fromArray(indices).multiplyScalar(voxelGrid.voxelSize));
    center.add(new THREE.Vector3(0.5,0.5,0.5).multiplyScalar(voxelGrid.voxelSize));
    const wAsInt = floatBitsToInt(data[3]);
    return new voxel(indices, wAsInt & 0x01, new THREE.Vector3(data[0], data[1], data[2]), center, (wAsInt >> 1));
}

function dot(v1, v2)
{
    return v1.dot(v2);
}

function cross(v1, v2)
{
    return v1.clone().cross(v2);
}

function normalize(dir)
{
    return dir.clone().normalize();
}

/**
 * 
 * @param {THREE.Vector3} v1 
 * @param {THREE.Vector3} v2 
 */
function distance(v1, v2)
{
    return v1.distanceTo(v2);
}

/**
 * @param {THREE.Vector3} pos
 * @returns {voxel}
 */
function getVoxel(pos)
{
    const toPos = pos.clone().sub(voxelGrid.gridMin).divideScalar(voxelGrid.voxelSize);
    return getVoxelFromIndices(pointToIndices(toPos));
}

/**
 * 
 * @param {number} x 
 * @param {number} y 
 * @param {number} z 
 * @returns {THREE.Vector3}
 */
function getVoxelDualContourPos(x, y, z)
{
    const vx = voxelGrid.voxels[x][y][z];
    return vx.normal.clone();
}

class intersectionResult
{
    constructor()
    {
        /** @type {number} */
        this.hit = 0;
        /** @type {THREE.Vector3} */
        this.point = new THREE.Vector3();
        /** @type {THREE.Vector3} */
        this.normal = new THREE.Vector3();
        /** @type {number} */
        this.t = 0;
    }
}

let drawnItems = [];
let scene = null;

const addDrawnItem = (item) => {
    drawnItems.push(item);
    scene.add(item);
}

/**
 * 
 * @param {THREE.Ray} ray 
 * @param {THREE.Triangle} t
 * @returns {intersectionResult} 
 */
function intersectTriangle(ray, t)
{
    let result = new intersectionResult();
    result.hit = 0;
    const edge1 = t.b.clone().sub(t.a);;
    const edge2 = t.c.clone().sub(t.a);

    const pvec = ray.direction.clone().cross(edge2);
    const det = dot(edge1, pvec);
    if(det > -0.0001 && det < 0.0001)
    {
        return result;
    }
    const invDet = 1.0 / det;

    const tvec = ray.origin.clone().sub(t.a);
    const u = dot(tvec, pvec) * invDet;
    if(u < 0.0 || u > 1.0)
    {
        return result;
    }
    const qvec = cross(tvec, edge1);
    const v = dot(ray.direction, qvec) * invDet;
    if(v < 0.0 || u + v > 1.0)
    {
        return result;
    }
    const resT = dot(edge2, qvec) * invDet;
    result.t = resT;
    result.point = ray.origin.clone().add(ray.direction.clone().multiplyScalar(resT));
    result.normal = normalize(cross(edge1, edge2));
    result.hit = resT >= 0.0 ? 1 : 0;
    return result;
}

/**
 * 
 * @param {VoxelGrid} vxGrid 
 */
export function getDCMesh(vxGrid)
{
    voxelGrid = vxGrid;
    const points = [];
    for(let x = 0; x < vxGrid.gridSize[0]; x++)
    {
        for(let y = 0; y < vxGrid.gridSize[1]; y++)
        {
            for(let z = 0; z < vxGrid.gridSize[2]; z++)
            {
                const minPos = vxGrid.gridMin.clone().add(new THREE.Vector3(x,y,z).multiplyScalar(vxGrid.voxelSize));
                const centerPos = minPos.clone().add(new THREE.Vector3(0.5,0.5,0.5).multiplyScalar(vxGrid.voxelSize));
                const edgeZ = z == vxGrid.gridSize[2] - 1;
                const edgeY = y == vxGrid.gridSize[1] - 1;
                const edgeX = x == vxGrid.gridSize[0] - 1;
                const vx = vxGrid.voxels[x][y][z];
                if(vx.edgeMask == 0) continue;
                const offsetIndices = [0,4,8];
                if(edgeX) offsetIndices.push(2, 9);
                if(edgeY) offsetIndices.push(1, 5);
                if(edgeZ) offsetIndices.push(6, 10);
                if(edgeX && edgeY) offsetIndices.push(3);
                if(edgeX && edgeZ) offsetIndices.push(11);
                if(edgeY && edgeZ) offsetIndices.push(7);

                for(const offsetIndex of offsetIndices)
                {
                    const bitmask = 1 << offsetIndex;
                    const anded = vx.edgeMask & bitmask;
                    if(anded == 0) continue;

                    const iset1 = edgeNeighbours[offsetIndex][1-1];
                    const iset2 = edgeNeighbours[offsetIndex][2-1];
                    const iset3 = edgeNeighbours[offsetIndex][3-1];
                    const iset4 = edgeNeighbours[offsetIndex][4-1];
                    const iset5 = edgeNeighbours[offsetIndex][5-1];
                    const iset6 = edgeNeighbours[offsetIndex][6-1];

                    const c1 = vxGrid.voxels[x+iset1[0]][y+iset1[1]][z+iset1[2]].normal.clone();
                    const c2 = vxGrid.voxels[x+iset2[0]][y+iset2[1]][z+iset2[2]].normal.clone();
                    const c3 = vxGrid.voxels[x+iset3[0]][y+iset3[1]][z+iset3[2]].normal.clone();
                    const c4 = vxGrid.voxels[x+iset4[0]][y+iset4[1]][z+iset4[2]].normal.clone();
                    const c5 = vxGrid.voxels[x+iset5[0]][y+iset5[1]][z+iset5[2]].normal.clone();
                    const c6 = vxGrid.voxels[x+iset6[0]][y+iset6[1]][z+iset6[2]].normal.clone();

                    const c1valid = vxGrid.voxels[x+iset1[0]][y+iset1[1]][z+iset1[2]].edgeMask != 0;
                    const c2valid = vxGrid.voxels[x+iset2[0]][y+iset2[1]][z+iset2[2]].edgeMask != 0;
                    const c3valid = vxGrid.voxels[x+iset3[0]][y+iset3[1]][z+iset3[2]].edgeMask != 0;
                    const c4valid = vxGrid.voxels[x+iset4[0]][y+iset4[1]][z+iset4[2]].edgeMask != 0;
                    const c5valid = vxGrid.voxels[x+iset5[0]][y+iset5[1]][z+iset5[2]].edgeMask != 0;
                    const c6valid = vxGrid.voxels[x+iset6[0]][y+iset6[1]][z+iset6[2]].edgeMask != 0;

                    if(c1valid && c2valid && c3valid)
                        points.push(c1.x, c1.y, c1.z, c2.x, c2.y, c2.z, c3.x, c3.y, c3.z);
                    if(c4valid && c5valid && c6valid)
                        points.push(c4.x, c4.y, c4.z, c5.x, c5.y, c5.z, c6.x, c6.y, c6.z);
                }
            }
        }
    }
    const bufferGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(points);
    bufferGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.MeshBasicMaterial({color: 0xff0000, wireframe: true});
    const mesh = new THREE.Mesh(bufferGeometry, mat);
    return mesh;

}

/** 
 * @param {THREE.Vector3} rayOrigin
 * @param {THREE.Vector3} rayDir
 * @param {number} edgeMask
 * @param {[number, number, number]} coords 
 * @param {number} tMin
 * @param {number} tMax
 * 
*/
function dualContouringIntersect(rayOrigin, rayDir, edgeMask, coords, tMin, tMax)
{
    console.log(tMin, tMax);
    let closestRes = new intersectionResult();
    let res = new intersectionResult();
    const r = new THREE.Ray(rayOrigin, rayDir);
    for(let i = 0; i < 12; i++)
    {
        const bitmask = 1 << i;
        const anded = edgeMask & bitmask;
        if(anded == 0) continue;
        const iset11 = edgeNeighbours[i][1-1];
        const iset12 = edgeNeighbours[i][2-1];
        const iset13 = edgeNeighbours[i][3-1];
        const iset21 = edgeNeighbours[i][4-1];
        const iset22 = edgeNeighbours[i][5-1];
        const iset23 = edgeNeighbours[i][6-1];
        
        const c11 = getVoxelDualContourPos(coords[0]+iset11[0], coords[1]+iset11[1], coords[2]+iset11[2]);
        const c12 = getVoxelDualContourPos(coords[0]+iset12[0], coords[1]+iset12[1], coords[2]+iset12[2]);
        const c13 = getVoxelDualContourPos(coords[0]+iset13[0], coords[1]+iset13[1], coords[2]+iset13[2]);
        const c21 = getVoxelDualContourPos(coords[0]+iset21[0], coords[1]+iset21[1], coords[2]+iset21[2]);
        const c22 = getVoxelDualContourPos(coords[0]+iset22[0], coords[1]+iset22[1], coords[2]+iset22[2]);
        const c23 = getVoxelDualContourPos(coords[0]+iset23[0], coords[1]+iset23[1], coords[2]+iset23[2]);

        const t1 = new THREE.Triangle(c11,c12,c13);

        let primColor = primColors[primColorIndex];
        addDrawnItem(drawTriangleLocal(t1.a, t1.b, t1.c, primColor, 1));
        res = intersectTriangle(r, t1);
        if(res.hit == 1)
        {
            addDrawnItem(drawSphereLocal(res.point, 0x555555, 0.1));
            console.log(res.point, res.t)
        }
        if(res.t < tMin || res.t > tMax) res.hit = 0;
        if(res.hit == 1 && (closestRes.hit == 0 || res.t < closestRes.t)) closestRes = res;
        t1.set(c21, c23, c22);
        addDrawnItem(drawTriangleLocal(t1.a, t1.b, t1.c, primColor, 1));
        res = intersectTriangle(r, t1);
        if(res.hit == 1)
        {
            addDrawnItem(drawSphereLocal(res.point, 0x555555, 0.1));
            console.log(res.point, res.t)
        }
        if(res.t < tMin || res.t > tMax) res.hit = 0;
        if(res.hit == 1 && (closestRes.hit == 0 || res.t < closestRes.t)) closestRes = res;
    }
    const dot1 = dot(rayDir, closestRes.normal);
    const dot2 = dot(rayDir, -closestRes.normal);
    if(dot2 > dot1) closestRes.normal = -closestRes.normal;
    return closestRes;
}

/**
 * 
 * @param {THREE.Vector3} rayOrigin 
 * @param {THREE.Vector3} rayDir 
 * @param {number} tMin 
 * @param {number} tMax 
 * @returns 
 */
function rayCast(rayOrigin, rayDir, tMin, tMax) {
    rayDir = normalize(rayDir);
    const otherEndStart = rayOrigin;
    let otherEndMaxes = [0,0,0];
    let infdists = [3000., 3000., 3000.];
    const gridMin = [voxelGrid.gridMin.x, voxelGrid.gridMin.y, voxelGrid.gridMin.z];
    const gridDimensions = [...voxelGrid.gridSize];
    const voxelSize = voxelGrid.voxelSize;
    for(let i = 0; i < 3; i++)
    {
        const step = rayDir.getComponent(i) > 0. ? 1 : (rayDir.getComponent(i) < 0. ? -1 : 0);
        const otherPos = step == -1 ? gridMin[i] : gridMin[i] + gridDimensions[i] * voxelSize;
        otherEndMaxes[i] = step == -1 ? (rayOrigin.getComponent(i) - otherPos) / rayDir.getComponent(i) : (step == 1 ? (otherPos - rayOrigin.getComponent(i)) / rayDir.getComponent(i) : infdists[i]);
        otherEndMaxes[i] = Math.abs(otherEndMaxes[i]);
    }
    const origRayOrig = rayOrigin.clone();
    tMax = Math.min(otherEndMaxes[0], Math.min(otherEndMaxes[1], otherEndMaxes[2])) - 0.01;
    rayOrigin = otherEndStart.clone().add(rayDir.clone().multiplyScalar(tMax));
    tMax = distance(origRayOrig, rayOrigin);
    rayDir = rayDir.clone().negate();
    addDrawnItem(drawSphereLocal(rayOrigin, 0x0000ff, 0.1, 1));
    addDrawnItem(drawNormalLocal(rayOrigin, rayDir, 0x0000ff, 1, tMax, 0.1));
    let invDir = new THREE.Vector3(1.0 / rayDir.x, 1.0 / rayDir.y, 1.0 / rayDir.z);
    let tMaxes = [0,0,0];
    let tDeltas= [0,0,0];
    let steps = [0,0,0];
    const previous = getVoxel(rayOrigin);
    const indices = [...previous.coords];
    if(indices[0] >= gridDimensions[0] || indices[1] >= gridDimensions[1] || indices[2] >= gridDimensions[2] || indices[0] < 0 || indices[1] < 0 || indices[2] < 0)
    {
        const res = new intersectionResult();
        res.hit = 0;
        return res;
    }
    let iterCount = 0;
    for(let i = 0; i < 3; i++)
    {
        steps[i] = rayDir.getComponent(i) > 0. ? 1 : (rayDir.getComponent(i) < 0. ? -1 : 0);
        const advancedIndices = [...indices];
        advancedIndices[i] += 1;
        const otherPos = steps[i] > 0 ? new THREE.Vector3().fromArray(gridMin).add(new THREE.Vector3().fromArray(advancedIndices).multiplyScalar(voxelSize)) : new THREE.Vector3().fromArray(gridMin).add(new THREE.Vector3().fromArray(indices).multiplyScalar(voxelSize));
        tMaxes[i] = steps[i] == 1 ? (otherPos.getComponent(i) - rayOrigin.getComponent(i)) * invDir.getComponent(i) : steps[i] == -1 ? (rayOrigin.getComponent(i) - otherPos.getComponent(i)) * invDir.getComponent(i) : infdists[i];
        tMaxes[i] = Math.abs(tMaxes[i]);
        tDeltas[i] = steps[i] != 0 ? Math.abs(voxelSize * invDir.getComponent(i)) : infdists[i];
    }
    let lastSelection = -1;
    let savedMaxes = tMaxes;
    let lastValidResult = new intersectionResult();
    while(iterCount < 1000 && indices[0] < gridDimensions[0] && indices[1] < gridDimensions[1] && indices[2] < gridDimensions[2] && indices[0] >= 0 && indices[1] >= 0 && indices[2] >= 0)
    {
        iterCount++;
        let current = getVoxelFromIndices(indices);
        const voxelMin = new THREE.Vector3().fromArray(gridMin).add(new THREE.Vector3().fromArray(indices).multiplyScalar(voxelSize));
        addDrawnItem(drawCubeLocal(voxelMin, voxelSize, 0x00ff00, 0.2));
        if(current.isFilled == 1)
        {
            primColorIndex++;
            if(primColorIndex >= primColors.length) primColorIndex = 0;
            let primColor = primColors[primColorIndex];
            let thisVoxelT = Math.min(savedMaxes[0], Math.min(savedMaxes[1], savedMaxes[2]));
            addDrawnItem(drawSphereLocal(rayOrigin.clone().add(rayDir.clone().multiplyScalar(thisVoxelT)), primColor, 0.05, 1));
            let nextVoxelT = Math.min(tMaxes[0], Math.min(tMaxes[1], tMaxes[2]));
            addDrawnItem(drawSphereLocal(rayOrigin.clone().add(rayDir.clone().multiplyScalar(nextVoxelT)), 0xff0000, 0.05, 1));
            let res = dualContouringIntersect(rayOrigin, rayDir, current.edgeMask, indices, 0, nextVoxelT);
            res.t = distance(origRayOrig, res.point);
            let thisT = distance(rayOrigin, res.point);
            if(res.hit === 1 && thisT >= tMax - 0.1)
            {
                return lastValidResult;
            }
            if(res.hit == 1) lastValidResult = res;
        }
        savedMaxes = [...tMaxes];
        if(tMaxes[0] < tMaxes[1] && tMaxes[0] < tMaxes[2])
        {
            indices[0] += steps[0];
            tMaxes[0] += tDeltas[0];
            lastSelection = 0;
        }
        else if(tMaxes[1] < tMaxes[2])
        {
            indices[1] += steps[1];
            tMaxes[1] += tDeltas[1];
            lastSelection = 1;
        }
        else
        {
            indices[2] += steps[2];
            tMaxes[2] += tDeltas[2];
            lastSelection = 2;
        }
    }
    let res = new intersectionResult();
    res.hit = 0;
    return lastValidResult;
}

/**
 * 
 * @param {THREE.Vector3} rayOrigin 
 * @param {THREE.Vector3} rayDirection 
 * @param {VoxelGrid} vgrid 
 * @param {THREE.Scene} scene
 */
export const intersectContour = (camPos, hitPos, vgrid, sc) => {
    scene = sc;
    for(const item of drawnItems)
    {
        scene.remove(item);
    }
    addDrawnItem(drawSphereLocal(camPos, 0xff0000, 0.1));
    addDrawnItem(drawLineLocal(camPos, hitPos, 0xff0000, 1))
    const rayDirection = hitPos.clone().sub(camPos).normalize();
    const rayOrigin = hitPos.clone().add(rayDirection.clone().multiplyScalar(0.01));
    voxelGrid = vgrid;
    addDrawnItem(drawSphereLocal(rayOrigin, 0x00ff00, 0.1, 1));
    addDrawnItem(drawNormalLocal(rayOrigin, rayDirection, 0x00ff00, 1, 1, 0.1));
    const r = rayCast(rayOrigin, rayDirection, 0, 1000);
    console.log(r);
    addDrawnItem(drawSphereLocal(r.point, 0xff00ff, 0.1, 1));
}
