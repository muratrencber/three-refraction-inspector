import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/Addons.js';
import { camData } from './camData';

/** @type {THREE.Camera} */
let targetCam;
/** @type {OrbitControls} */
let targetControls;

/**
 * 
 * @param {THREE.Camera} camera 
 * @param {THREE.OrbitControls} orbitControls 
 */
export const setupCamPos = (camera, orbitControls) => {
    targetCam = camera;
    targetControls = orbitControls;
    let localStorageData = getLocalStorageData();
    populateDivWithData(localStorageData);
    const targetButton = document.getElementById('saveCamPos');
    targetButton.onclick = () => {
        const data = localStorageData;
        data.push({
            position: targetCam.position.clone(),
            target: targetControls.target.clone()
        });
        localStorage.setItem('camPosData', JSON.stringify(data));
        populateDivWithData(data);
    };
}

const populateDivWithData = (data) => {
    const div = document.getElementById('camPosData');
    div.innerHTML = '';
    data.forEach((item, index) => {
        const button = document.createElement('button');
        button.innerText = `Position ${index + 1}`;
        const deleteButton = document.createElement('button');
        deleteButton.innerText = 'Delete';
        button.onclick = () => {
            targetCam.position.set(item.position.x, item.position.y, item.position.z);
            targetControls.target.set(item.target.x, item.target.y, item.target.z);
            targetControls.update();
        }
        deleteButton.onclick = () => {
            data.splice(index, 1);
            localStorage.setItem('camPosData', JSON.stringify(data));
            populateDivWithData(data);
        }
        div.appendChild(button);
        div.appendChild(deleteButton);
    });
}

const getLocalStorageData = () => {
    const dataJSON = window.localStorage.getItem('camPosData');
    if(dataJSON === null) {
        return [];
    }
    return JSON.parse(dataJSON);
}

let recordData = [];
export let recording = false;
const recordButton = document.getElementById('recordButton');

const toggleRecording = () => {
    if(recording) {
        stopRecording();
        recordButton.innerText = 'Record Cam Pos';
    } else {
        startRecording();
        recordButton.innerText = 'Stop Recording';
    }
}

recordButton.onclick = toggleRecording;

const startRecording = () => {
    if(recording) return;
    recording = true;
    recordData = [];
    record();
}

const stopRecording = () => {
    recording = false;
    const dataAsJson = JSON.stringify(recordData);
    console.log(dataAsJson);
}

export const record = () => {
    if(!recording) return;
    let pos = targetCam.position.clone();
    let orbitTarget = targetControls.target.clone();
    recordData.push({
        position: [pos.x, pos.y, pos.z],
        target: [orbitTarget.x, orbitTarget.y, orbitTarget.z]
    });
}

let playBackIndex = 0;
export let playingBack = false;

function saveBlob(blob, fileName) {
    var a = document.getElementById("downloadLink");

    var url = window.URL.createObjectURL(blob);
    a.href = url;
    a.download = fileName;
};


const playbackButton = document.getElementById('playbackButton');
let frameTimes = [];

const togglePlayback = () => {
    if(playingBack) {
        const str = JSON.stringify(frameTimes);
        //save str as blob
        const blob = new Blob([str], {type: 'application/json'});
        saveBlob(blob, 'frameTimes.json');
        playingBack = false;
        playbackButton.innerText = 'Playback Cam Pos';
    } else {
        playingBack = true;
        playBackIndex = 0;
        frameTimes = [];
        playbackButton.innerText = 'Stop Playback';
    }
}

playbackButton.onclick = togglePlayback;

export const setFrameTime = (time) => {
    if(!playingBack) return;
    frameTimes.push(time);
}

export const applyNextPlaybackData = () => {
    if(!playingBack) return;
    const data = camData[playBackIndex];
    playBackIndex++;
    if(playBackIndex >= camData.length) {
        togglePlayback();
    }
    targetCam.position.set(data.position[0], data.position[1], data.position[2]);
    targetControls.target.set(data.target[0], data.target[1], data.target[2]);
};