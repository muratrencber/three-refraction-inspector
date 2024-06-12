import * as THREE from 'three';
import {MeshRefractiveBVHMaterial} from 'three-refraction/MeshRefractiveBVHMaterial';
import {MeshRefractiveVoxelGridMaterial} from 'three-refraction/MeshRefractiveVoxelGridMaterial';
import {DebugRenderTarget, TwoPassRefractionRenderer, UpscaleMethod, UpscaleTarget} from 'three-refraction/TwoPassRefractionRenderer';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/Addons.js';
import { setupCamPos } from './camPosHTML';
import { BVH } from 'three-refraction/structures/BVH';
import { SparseVoxelOctree } from 'three-refraction/structures/SparseVoxelOctree';
import { ContouringMethod } from 'three-refraction/structures/VoxelSettings';
import { getDCMesh, intersectContour } from './debucContourIntersect';
import { drawLineLocal, setMatrix } from './drawUtils';
import { edgeOffsets } from 'three-refraction/structures/temp/gridVoxelization';
import { VoxelGrid } from 'three-refraction/structures/VoxelGrid';
import { MeshRefractiveSVOMaterial } from 'three-refraction/MeshRefractiveSVOMaterial';

const renderer = new THREE.WebGLRenderer({preserveDrawingBuffer: true});
renderer.setSize(1280, 720);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1280 / 720, 0.1, 1000);
const canvasTarget = document.getElementById("canvasTarget");
document.body.insertBefore(renderer.domElement, canvasTarget);
canvasTarget.remove();

const twoPassRenderer = new TwoPassRefractionRenderer(renderer, {
    bounceCount: 2,
    lowResFactor: 1,
    upscaleOptions: {
        normalFiltering: true,
        upscaleMethod: UpscaleMethod.Hardware,
        upscaleTarget: UpscaleTarget.FinalRender,
        normalThreshold: 0.99999
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

//const voxelPromise = new VoxelGrid().loadWithModel(new FBXLoader().loadAsync("./models/cat.fbx"), `./accelerators/catvx_${loadName}.data`);
//const voxelPromise = new VoxelGrid().loadModelAndConstruct(new FBXLoader().loadAsync("./models/cat.fbx"), 16, ContouringMethod.DualContouring);
const svoPromise = new SparseVoxelOctree().loadModelAndConstruct(new FBXLoader().loadAsync("./models/Diamond.fbx"), 5, ContouringMethod.AverageNormals);
Promise.all([envMapPromise, svoPromise]).then(([envMap, svoResult]) => {
    const {model, svo} = svoResult;

    model.scale.set(0.3, 0.3, 0.3);
    model.translateY(-2);
    model.updateMatrixWorld();
    model.updateMatrixWorld();
    const voxelMat = new MeshRefractiveSVOMaterial(svo, {
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
    scene.add(model);
    scene.background = envMap;
    twoPassRenderer.addRefractiveObject(model);
    return;
    const sphereGeo = new THREE.SphereGeometry(0.01, 32, 32);
    const basicMat = new THREE.MeshBasicMaterial({color: 0xffffff});
    const group = new THREE.Object3D();
    for(let x = 0; x < voxelGrid.gridSize[0]; x++) {
        for(let y = 0; y < voxelGrid.gridSize[1]; y++) {
            for(let z = 0; z < voxelGrid.gridSize[2]; z++) {
                const vx = voxelGrid.voxels[x][y][z];
                const vxMin = voxelGrid.gridMin.clone().add(new THREE.Vector3(x, y, z).multiplyScalar(voxelGrid.voxelSize));
                const vxCenter = vxMin.clone().add(new THREE.Vector3(0.5, 0.5, 0.5).multiplyScalar(voxelGrid.voxelSize));
                if(vx.edgeMask == 0 || vx.childCount == 0) continue;
                continue;
                let drawnEdges = 0;
                for(const inter of vx.intersections)
                {
                    const sphereMesh = new THREE.Mesh(sphereGeo, basicMat);
                    const p = inter.point.clone().add(vxCenter);
                    sphereMesh.position.set(p.x, p.y, p.z);
                    group.add(sphereMesh);
                    const [eo1, eo2] = edgeOffsets[inter.edgeIndex];
                    const startPos = voxelGrid.gridMin.clone().add(new THREE.Vector3(x, y, z).multiplyScalar(voxelGrid.voxelSize)).add(new THREE.Vector3().fromArray(eo1).multiplyScalar(voxelGrid.voxelSize));
                    const endPos = voxelGrid.gridMin.clone().add(new THREE.Vector3(x, y, z).multiplyScalar(voxelGrid.voxelSize)).add(new THREE.Vector3().fromArray(eo2).multiplyScalar(voxelGrid.voxelSize));
                    const l = drawLineLocal(startPos, endPos, 0xff0000, 1);
                    group.add(l);
                    drawnEdges++;
                }
                for(let i = 0; i < 12; i++)
                {
                    const target = 1 << i;
                    const anded = vx.edgeMask & target;
                    if(anded == 0) continue;
                    const [eo1, eo2] = edgeOffsets[i];
                    const startPos = voxelGrid.gridMin.clone().add(new THREE.Vector3(x, y, z).multiplyScalar(voxelGrid.voxelSize)).add(new THREE.Vector3().fromArray(eo1).multiplyScalar(voxelGrid.voxelSize));
                    const endPos = voxelGrid.gridMin.clone().add(new THREE.Vector3(x, y, z).multiplyScalar(voxelGrid.voxelSize)).add(new THREE.Vector3().fromArray(eo2).multiplyScalar(voxelGrid.voxelSize));
                    const l = drawLineLocal(startPos, endPos, 0xff0000, 1);
                    group.add(l);
                }
                continue;
                const sphereMesh = new THREE.Mesh(sphereGeo, basicMat);
                sphereMesh.position.set(vx.normal.x, vx.normal.y, vx.normal.z); 
                group.add(sphereMesh);
            }
        }
    }
    setMatrix(obj.matrixWorld);
    let kms = getDCMesh(voxelGrid);
    //scene.add(kms);
    //scene.add(group);
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