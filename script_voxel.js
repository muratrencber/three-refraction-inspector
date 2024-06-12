import * as THREE from 'three';
import {MeshRefractiveBVHMaterial} from 'three-refraction/MeshRefractiveBVHMaterial';
import {MeshRefractiveSVOMaterial} from 'three-refraction/MeshRefractiveSVOMaterial';
import {DebugRenderTarget, TwoPassRefractionRenderer, UpscaleMethod, UpscaleTarget} from 'three-refraction/TwoPassRefractionRenderer';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/Addons.js';
import { applyNextPlaybackData, record, recording, setFrameTime, setupCamPos } from './camPosHTML';
import { BVH } from 'three-refraction/structures/BVH';
import { SparseVoxelOctree } from 'three-refraction/structures/SparseVoxelOctree';
import { ContouringMethod } from 'three-refraction/structures/VoxelSettings';
import { getDCMesh, intersectContour } from './debucContourIntersect';
import { drawLineLocal, setMatrix } from './drawUtils';
import { edgeOffsets } from 'three-refraction/structures/temp/gridVoxelization';
import { Capabilities } from 'three-refraction/Capabilities';
import { VoxelGrid } from 'three-refraction/structures/VoxelGrid';
import { MeshRefractiveVoxelGridMaterial } from 'three-refraction/MeshRefractiveVoxelGridMaterial';

const renderer = new THREE.WebGLRenderer({preserveDrawingBuffer: true});
renderer.setSize(1280, 720);
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1920 / 1080, 0.1, 1000);
const canvasTarget = document.getElementById("canvasTarget");
document.body.insertBefore(renderer.domElement, canvasTarget);
canvasTarget.remove();
Capabilities.setCapabilities(renderer.capabilities);

const twoPassRenderer = new TwoPassRefractionRenderer(renderer, {
    bounceCount: 2,
    lowResFactor: 1,
    upscaleOptions: {
        normalFiltering: true,
        xbr4xSupported: false,
        upscaleMethod: UpscaleMethod.Hardware,
        xbrUpscaleMethod: UpscaleMethod.NearestNeighbour,
        upscaleTarget: UpscaleTarget.FinalRender,
        normalThreshold: 0.99999,
        dynamicResolution: false
    },
});

document.getElementById("renderTargetSelect").addEventListener("change", (e) => {
    const value = e.target.value;
    const pos = parseInt(value);
    twoPassRenderer.setDebugRenderTarget(pos);
});

document.getElementById("renderTargetPositionSelect").addEventListener("change", (e) => {
    const value = e.target.value;
    const pos = parseInt(value);
    twoPassRenderer.setDebugRenderPosition(pos);
});

const pnormCheckbox = document.getElementById("preserveNormals");
//pnormCheckbox.checked = twoPassRenderer.rendererOptions.upscaleOptions.normalFiltering;
//pnormCheckbox.addEventListener("change", (e) => {
//    twoPassRenderer.rendererOptions.upscaleOptions.normalFiltering = e.target.checked;
//    twoPassRenderer.updateOptions(twoPassRenderer.rendererOptions);
//});

const envMapPromise = new THREE.CubeTextureLoader().setPath("./envmaps/quarry/").loadAsync(["posx.png", "negx.png", "posy.png", "negy.png", "posz.png", "negz.png"]);
const xube = new THREE.BoxGeometry(3, 3, 3);
const xubeMesh = new THREE.Mesh(xube, new THREE.MeshBasicMaterial({color: 0x00ff00}));

const bvh = new BVH();
const bvhPromise = new VoxelGrid().loadModelAndConstruct(new FBXLoader().loadAsync("./models/Diamond.fbx"), 32, ContouringMethod.AverageNormals);//bvh.construct(xubeMesh);
Promise.all([envMapPromise, bvhPromise]).then(([envMap, bvhResult]) => {
    const {model, voxelGrid} = bvhResult;
    //let model = xubeMesh;
    console.log(voxelGrid.gridSize);
    model.updateMatrixWorld();
    const bvhMat = new MeshRefractiveVoxelGridMaterial(voxelGrid, {
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
            child.material = bvhMat;
    });
    scene.add(model);
    scene.background = envMap;
    twoPassRenderer.addRefractiveObject(model);
});

let obj = null;
let vxGrid = null;


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

let inScene = true;
document.addEventListener("keydown", e => {
    if(e.key == "h")
    {
        console.log("AAAAAAAAAAAAAAAA");
        if(inScene)
        {
            twoPassRenderer.removeRefractiveObject(obj);
            scene.remove(obj);
        }
        else
        {
            scene.add(obj);
            //twoPassRenderer.addRefractiveObject(obj);
        }
        inScene = !inScene;
    }
});

let previousTime = 0;
function animate(currentTime) {
    const deltaTime = currentTime - previousTime;
    previousTime = currentTime;
    setFrameTime(deltaTime);
    requestAnimationFrame(animate);
    applyNextPlaybackData();
    controls.update();
    twoPassRenderer.render(scene, camera);
    if(recording)
        record();
}

animate(0);