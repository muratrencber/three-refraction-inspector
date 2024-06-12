import * as THREE from 'three';
import {MeshRefractiveBVHMaterial} from 'three-refraction/MeshRefractiveBVHMaterial';
import {MeshRefractiveVoxelGridMaterial} from 'three-refraction/MeshRefractiveVoxelGridMaterial';
import {DebugRenderTarget, TwoPassRefractionRenderer, UpscaleMethod, UpscaleTarget} from 'three-refraction/TwoPassRefractionRenderer';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader, GLTFExporter } from 'three/examples/jsm/Addons.js';
import { setupCamPos } from './camPosHTML';
import { BVH } from 'three-refraction/structures/BVH';
import { SparseVoxelOctree } from 'three-refraction/structures/SparseVoxelOctree';
import { ContouringMethod } from 'three-refraction/structures/VoxelSettings';
import { getDCMesh, intersectContour } from './debucContourIntersect';
import { drawLineLocal, setMatrix } from './drawUtils';
import { edgeNeighbours, edgeOffsets } from 'three-refraction/structures/temp/gridVoxelization';
import { VoxelGrid, floatAsInt } from 'three-refraction/structures/VoxelGrid';
import { MeshRefractiveSVOMaterial } from 'three-refraction/MeshRefractiveSVOMaterial';

const renderer = new THREE.WebGLRenderer({preserveDrawingBuffer: true});
const size = [1280,720];
renderer.setSize(size[0], size[1]);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, size[0] / size[1], 0.1, 1000);
const canvasTarget = document.getElementById("canvasTarget");
document.body.insertBefore(renderer.domElement, canvasTarget);
canvasTarget.remove();

const twoPassRenderer = new TwoPassRefractionRenderer(renderer, {
    bounceCount: 2,
    lowResFactor: 1,
    upscaleOptions: {
        normalFiltering: true,
        xbr4xSupported: false,
        upscaleMethod: UpscaleMethod.XBR,
        upscaleTarget: UpscaleTarget.FinalRender,
        normalThreshold: 0.99999,
        dynamicResolution: false,
        minDynamicDistance: 10,
        maxDynamicDistance: 200
    },
});

document.getElementById("renderTargetSelect").addEventListener("change", (e) => {
    const value = e.target.value;
    if(value === "FinalRender")
        twoPassRenderer.setDebugRenderTarget(DebugRenderTarget.FinalRender);
    else if(value === "NormalsOrMask")
        twoPassRenderer.setDebugRenderTarget(DebugRenderTarget.NormalsOrMask);
    else if(value === "None")
        twoPassRenderer.setDebugRenderTarget(DebugRenderTarget.None);
});

document.getElementById("renderTargetPositionSelect").addEventListener("change", (e) => {
    const value = e.target.value;
    const pos = parseInt(value);
    twoPassRenderer.setDebugRenderPosition(pos);
});

const pnormCheckbox = document.getElementById("preserveNormals");
pnormCheckbox.checked = twoPassRenderer.rendererOptions.upscaleOptions.normalFiltering;
pnormCheckbox.addEventListener("change", (e) => {
    twoPassRenderer.rendererOptions.upscaleOptions.normalFiltering = e.target.checked;
    twoPassRenderer.updateOptions(twoPassRenderer.rendererOptions);
});

const envMapPromise = new THREE.CubeTextureLoader().setPath("./envmaps/quarry/").loadAsync(["posx.png", "negx.png", "posy.png", "negy.png", "posz.png", "negz.png"]);

let obj = null;
let vxGrid = null;

const urlParams = new URLSearchParams(window.location.search);
const loadName = urlParams.get("method") ?? "avgnorm";

const xube = new THREE.BoxGeometry(3, 3, 3);
const xubeMesh = new THREE.Mesh(xube, new THREE.MeshBasicMaterial({color: 0x00ff00}));

//const voxelPromise = new VoxelGrid().loadWithModel(new FBXLoader().loadAsync("./models/cat.fbx"), `./accelerators/catvx_${loadName}.data`);
const voxelPromise = new VoxelGrid().loadModelAndConstruct(new FBXLoader().loadAsync("./models/Diamond.fbx"), 128, ContouringMethod.DualContouring);

//const voxelGrid = new VoxelGrid();
//const voxelPromise = voxelGrid.construct(xubeMesh, 32, ContouringMethod.DualContouring);
Promise.all([envMapPromise, voxelPromise]).then(([envMap, voxelResult]) => {
    const {model, voxelGrid} = voxelResult;
    //vxGrid = voxelGrid;
    model.updateMatrixWorld();
    const voxelMat = new MeshRefractiveVoxelGridMaterial(voxelGrid, {
        ior: 2.41,
        invMWorldMatrix: model.matrixWorld.clone().invert(),
        envMap: envMap,
        bounceCount: 4,
        critical_cos: 0.91,
        roughness: 0,
        color: 0xffffff,
        isConvex: true
    });
    model.traverse((child) => {
        if(child.isMesh)
            child.material = voxelMat;
    });
    obj = model;
    //scene.add(model);
    scene.background = envMap;
    //twoPassRenderer.addRefractiveObject(model);
    /** @typedef {{center: THREE.Vector3, filled: boolean, edgeMask: number, indices: [number,number,number]}} Voxel */
    const getVoxel = (x, y, z) => {
        const ix = (z * voxelGrid.gridSize[0] * voxelGrid.gridSize[1] + y * voxelGrid.gridSize[0] + x) * 4;
        const pX = voxelGrid.voxelData[ix];
        const pY = voxelGrid.voxelData[ix + 1];
        const pZ = voxelGrid.voxelData[ix + 2];
        const data = floatAsInt(voxelGrid.voxelData[ix + 3]);
        const isFilled = (data & 1) != 0;
        const edgeMask = data >> 1;
        return {center: new THREE.Vector3(pX, pY, pZ), filled: isFilled, edgeMask, indices: [x, y, z]};
    }
    const tris = [];
    const boxes = [];
    const boxGeo = new THREE.BoxGeometry(voxelGrid.voxelSize, voxelGrid.voxelSize, voxelGrid.voxelSize).toNonIndexed();
    const boxPos = boxGeo.attributes.position.array;
    const size = voxelGrid.gridSize;
    const addedEdges = new Set();
    const spheres = new THREE.Object3D();
    const sphMat = new THREE.MeshBasicMaterial({color: 0x00ff00});
    const sphGeo = new THREE.SphereGeometry(0.005, 8, 8);
    for(let x = 0; x < size[0]; x++)
    {
        for(let y = 0; y < size[1]; y++)
        {
            for(let z = 0; z < size[2]; z++)
            {
                const minPos = new THREE.Vector3(x, y, z).multiplyScalar(voxelGrid.voxelSize).add(voxelGrid.gridMin);
                const centerPos = minPos.clone().addScalar(voxelGrid.voxelSize * 0.5);
                const vx = getVoxel(x, y, z);
                if(!vx.filled) continue;
                const sph = new THREE.Mesh(sphGeo, sphMat);
                sph.position.copy(centerPos);
                spheres.add(sph);
                for(let i = 0; i < boxPos.length; i += 3)
                    boxes.push(boxPos[i] + centerPos.x, boxPos[i + 1] + centerPos.y, boxPos[i + 2] + centerPos.z);
                for(let i = 0; i < 12; i++)
                {
                    const edgeMask = 1 << i;
                    if((vx.edgeMask & edgeMask) == 0) continue;
                    const [edir1, edir2] = edgeOffsets[i];
                    const edgeStart = [x + edir1[0], y + edir1[1], z + edir1[2]];
                    const edgeEnd = [x + edir2[0], y + edir2[1], z + edir2[2]];
                    const edgeKey = `${edgeStart[0]}_${edgeStart[1]}_${edgeStart[2]}_${edgeEnd[0]}_${edgeEnd[1]}_${edgeEnd[2]}`;
                    if(addedEdges.has(edgeKey)) continue;
                    addedEdges.add(edgeKey);
                    const flip = ((vx.edgeMask >> 12) & edgeMask) != 0;
                    const nindices = edgeNeighbours[i];
                    const [v1i, v2i, v3i, v4i, v5i, v6i] = nindices.map(e => {
                        const [ex, ey, ez] = e;
                        return getVoxel(x + ex, y + ey, z + ez).center;
                    });
                    if(flip)
                    {
                        console.log("flipped");
                        let tmp = v1i.clone();
                        v1i.copy(v2i);
                        v2i.copy(tmp);
                        tmp = v4i.clone();
                        v4i.copy(v5i);
                        v5i.copy(tmp);
                    }
                    tris.push(v1i.x, v1i.y, v1i.z, v2i.x, v2i.y, v2i.z, v3i.x, v3i.y, v3i.z);
                    tris.push(v4i.x, v4i.y, v4i.z, v5i.x, v5i.y, v5i.z, v6i.x, v6i.y, v6i.z);
                }
            }
        }
    }
    const vxGeo = new THREE.BufferGeometry();
    vxGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(boxes), 3));
    const vxMesh = new THREE.Mesh(vxGeo, new THREE.MeshBasicMaterial({color: 0x00ff00, wireframe: true, transparent: true, opacity: 0.2}));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(tris), 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color: 0xff0000, wireframe: false}));
    scene.add(mesh);
    scene.add(vxMesh);
    scene.add(spheres);
    new GLTFExporter().parse(mesh, (gltf) => {
        const blob = new Blob([JSON.stringify(gltf)], {type: "application/json"});
        saveBlob(blob, "diacont.gltf");
    });
});


const controls = new OrbitControls(camera, renderer.domElement);
camera.position.z = 5;

setupCamPos(camera, controls);
document.getElementById("downloadImage").onclick = () => {
    const url = renderer.domElement.toDataURL();
    document.getElementById("canvasDownload").src = url;
}

//twoPassRenderer.setDebugRenderTarget(DebugRenderTarget.NormalsOrMask);

document.addEventListener("mousedown", e => {
    if(e.button != 1) return;
    //get mouse pos, raycast to scene
    const domElementBounds = renderer.domElement.getBoundingClientRect();
    console.log(domElementBounds, e.clientX, e.clientY);
    const mouse = new THREE.Vector2(-0.12376933895921238, 0.19956616052060738);
    mouse.x = ((e.clientX - domElementBounds.left) / domElementBounds.width) * 2 - 1;
    mouse.y = -((e.clientY - domElementBounds.top) / domElementBounds.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    //log mouse x, y
    console.log(mouse.x, mouse.y);
    //return if no intersection
    if(intersects.length == 0) return;
    //convert camera position to obj local space
    const camPos = camera.position.clone();
    const invMatrix = obj.matrixWorld.clone().invert();
    camPos.applyMatrix4(invMatrix);
    //convert hit pos to obj local space
    const hitPos = intersects[0].point.clone();
    hitPos.applyMatrix4(invMatrix);
    intersectContour(camPos, hitPos, vxGrid, scene);
});

function saveBlob(blob, fileName) {
    var a = document.createElement("a");
    document.body.appendChild(a);
    a.style = "display: none";

    var url = window.URL.createObjectURL(blob);
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
};

let inScene = true;
document.addEventListener("keydown", e => {
    if(e.key == "h")
    {
        const blob = vxGrid.getBlob();
        saveBlob(blob, "catvx.data");
    }
});


function animate() {
    requestAnimationFrame(animate);
    controls.update();
    twoPassRenderer.render(scene, camera);
}

animate();