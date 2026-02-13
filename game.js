// Firebase Imports - Using stable 10.7.1
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, collection, query, where, orderBy, limit, serverTimestamp, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Three.js Imports
import * as THREE from 'three';

const firebaseConfig = {
    apiKey: "AIzaSyDO5udXtjsC--0lODXoLZx7F4Z6LUNQUBA",
    authDomain: "pss-game-3ccf0.firebaseapp.com",
    projectId: "pss-game-3ccf0",
    storageBucket: "pss-game-3ccf0.firebasestorage.app",
    messagingSenderId: "788402540933",
    appId: "1:788402540933:web:2ecc2607f13695b91af4ec",
    measurementId: "G-V5ZEPMBF19"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ===================================
// GAME STATE
// ===================================
const gameState = {
    userId: null,
    username: '',
    gender: 'boy',
    style: 'explorer',
    snow: 0,
    multiplier: 1.0,
    swarm: [],
    equippedPets: [],
    unlockedAreas: ['glacier_bay'],

    player: {
        x: 0, z: 0, speed: 0.28, moving: false,
        mesh: null, parts: {}, trail: [], lastSync: 0
    },

    camera: {
        theta: 0, // Horizontal rotation
        phi: 0.8, // Vertical angle
        radius: 16,
        isRotating: false,
        lastMouseX: 0,
        lastMouseY: 0
    },

    remotePlayers: {},
    pets: [],
    currentArea: 'glacier_bay',
    areas: [
        { id: 'glacier_bay', name: '🏔️ Glacier Bay', requirement: 0, snowValue: 10, bgColor: 0xd6eaf8, groundColor: 0xebf5fb, type: 'snow' },
        { id: 'frozen_forest', name: '🌲 Frozen Forest', requirement: 100, snowValue: 30, bgColor: 0x85c1e9, groundColor: 0xd6eaf8, type: 'forest' },
        { id: 'crystal_caves', name: '💎 Crystal Caves', requirement: 1000, snowValue: 80, bgColor: 0x2e86c1, groundColor: 0x1a5276, type: 'cave' },
        { id: 'aurora_peaks', name: '🌌 Aurora Peaks', requirement: 5000, snowValue: 200, bgColor: 0x1a2a44, groundColor: 0x2c3e50, type: 'peaks' },
        { id: 'arctic_volcano', name: '🌋 Volcanic Core', requirement: 25000, snowValue: 1000, bgColor: 0x4a0e0e, groundColor: 0x1a0505, type: 'volcano' },
        { id: 'snowy_village', name: '🏘️ Snow Village', requirement: 100000, snowValue: 5000, bgColor: 0xced4da, groundColor: 0xf8f9fa, type: 'village' }
    ],

    collectibles: [],
    environment: [],
    mapBounds: 14,
    unsubscribeMultiplayer: null,
    unsubscribeChat: null,
    device: 'pc',
    joystick: { x: 0, y: 0, active: false },
    particles: []
};

const penguinTypes = {
    common: { name: 'Common', color: 0x2c3e50, mult: 0.5, icon: '🐧' },
    rare: { name: 'Rare', color: 0x3498db, mult: 2.0, icon: '❄️' },
    epic: { name: 'Epic', color: 0x9b59b6, mult: 6.0, icon: '💜' },
    legendary: { name: 'Legendary', color: 0xf1c40f, mult: 15.0, icon: '👑' }
}

let mainScene, mainCamera, mainRenderer, clock = new THREE.Clock(), keys = {};
let previewScene, previewCamera, previewRenderer, previewCharacter;

// ===================================
// GLOBAL FUNCTIONS (Defined before usage)
// ===================================

function showNotification(m, t) {
    const c = document.createElement('div'); c.className = `notification ${t}`; c.textContent = m;
    document.body.appendChild(c); setTimeout(() => c.remove(), 3000);
}

function showLoginTab(t) {
    const lForm = document.getElementById('loginForm');
    const sForm = document.getElementById('signupForm');
    const lBtn = document.getElementById('loginTabBtn');
    const sBtn = document.getElementById('signupTabBtn');

    if (lForm && sForm && lBtn && sBtn) {
        lForm.classList.toggle('active', t === 'login');
        sForm.classList.toggle('active', t === 'signup');
        lBtn.classList.toggle('active', t === 'login');
        sBtn.classList.toggle('active', t === 'signup');
    }
    if (t === 'signup') setTimeout(initPreviewScene, 100);
}

async function handleLogin() {
    const uEl = document.getElementById('loginUsername');
    const pEl = document.getElementById('loginPassword');
    if (!uEl || !pEl) return;
    const u = uEl.value.trim();
    const p = pEl.value.trim();
    if (!u || !p) return showNotification('Incomplete form', 'error');

    const email = `${u.replace(/\s+/g, '').toLowerCase()}@pss-game.com`;
    try {
        await signInWithEmailAndPassword(auth, email, p);
    } catch (e) {
        console.error("Login Error:", e);
        showNotification('Invalid name or password', 'error');
    }
}

async function handleSignup() {
    const uEl = document.getElementById('signupUsername');
    const pEl = document.getElementById('signupPassword');
    if (!uEl || !pEl) return;
    const u = uEl.value.trim();
    const p = pEl.value.trim();
    const g = document.querySelector('input[name="gender"]:checked')?.value || 'boy';
    const s = document.getElementById('characterStyle')?.value || 'explorer';

    if (!u || !p) return showNotification('Enter a name and password!', 'error');
    if (p.length < 6) return showNotification('Password must be 6+ chars', 'error');

    const email = `${u.replace(/\s+/g, '').toLowerCase()}@pss-game.com`;
    try {
        const c = await createUserWithEmailAndPassword(auth, email, p);
        await setDoc(doc(db, "users", c.user.uid), {
            username: u, gender: g, style: s, snow: 0, swarm: [], multiplier: 1.0,
            currentArea: 'glacier_bay', unlockedAreas: ['glacier_bay'], x: 0, z: 0, rot: 0
        });
    } catch (e) {
        console.error("Signup Error:", e);
        showNotification('Signup failed or name taken!', 'error');
    }
}

async function saveAndLogout() {
    try {
        if (gameState.userId) await saveGame();
        await signOut(auth);
        // Reset state manually to be sure
        gameState.userId = null;
        gameState.username = '';
        location.reload();
    } catch (e) { console.error(e); location.reload(); }
}

function updateCharacterPreview() {
    if (!previewScene) return;
    if (previewCharacter) previewScene.remove(previewCharacter);
    const gender = document.querySelector('input[name="gender"]:checked')?.value || 'boy';
    const style = document.getElementById('characterStyle')?.value || 'explorer';
    const info = createExplorerMesh(gender, style, false);
    previewCharacter = info.group;
    previewCharacter.rotation.y = Math.PI / 8;
    previewScene.add(previewCharacter);
}

function travelTo(id) {
    const area = gameState.areas.find(a => a.id === id);
    if (!area) return;

    if (!gameState.unlockedAreas.includes(id)) {
        if (gameState.snow >= area.requirement) {
            gameState.unlockedAreas.push(id);
            showNotification(`Unlocked ${area.name}!`, 'success');
        } else {
            showNotification(`Need ${area.requirement.toLocaleString()} Snow!`, 'error');
            return;
        }
    }

    gameState.currentArea = id;
    initMainScene();
    startMultiplayerListener();
    startChatListener();
    document.getElementById('mapOverlay').classList.add('hidden');
    saveGame();
}

async function buyEgg(type) {
    const costs = { common: 100, rare: 500, legendary: 2500 };
    const cost = costs[type];
    if (gameState.snow < cost) return showNotification(`Need ${cost.toLocaleString()} Snow!`, 'error');
    gameState.snow -= cost;

    let result = 'common'; const r = Math.random();
    if (type === 'legendary') result = (r < 0.3) ? 'legendary' : 'epic';
    else if (type === 'rare') { if (r < 0.1) result = 'legendary'; else if (r < 0.4) result = 'epic'; else result = 'rare'; }
    else { if (r < 0.05) result = 'epic'; else if (r < 0.3) result = 'rare'; }

    const newPet = { type: result, id: Math.random().toString(36).substr(2, 9) };
    gameState.swarm.push(newPet);
    if (gameState.equippedPets.length < 4) gameState.equippedPets.push(newPet.id);

    recalcMultiplier();
    showNotification(`Hatched a ${result.toUpperCase()} penguin!`, 'success');
    refresh3DPets(); updateUI(); saveGame();
}

function equipBest() {
    const s = [...gameState.swarm].sort((a, b) => penguinTypes[b.type].mult - penguinTypes[a.type].mult);
    gameState.equippedPets = s.slice(0, 4).map(p => p.id);
    recalcMultiplier(); refresh3DPets(); updateUI(); saveGame();
}

// ===================================
// INITIALIZATION
// ===================================
document.addEventListener('DOMContentLoaded', () => {
    // EXPOSE GLOBALS
    window.showLoginTab = showLoginTab;
    window.handleLogin = handleLogin;
    window.handleSignup = handleSignup;
    window.updateCharacterPreview = updateCharacterPreview;
    window.buyEgg = buyEgg;
    window.equipBest = equipBest;
    window.sendChatMessage = sendChatMessage;
    window.travelTo = travelTo;
    window.showPetBag = () => { document.getElementById('petBagOverlay').classList.remove('hidden'); renderPetBag(); };
    window.hidePetBag = () => { document.getElementById('petBagOverlay').classList.add('hidden'); };
    window.showShop = () => { document.getElementById('shopOverlay').classList.remove('hidden'); };
    window.hideShop = () => { document.getElementById('shopOverlay').classList.add('hidden'); };
    window.showSettings = () => { document.getElementById('settingsOverlay').classList.remove('hidden'); };
    window.hideSettings = () => { document.getElementById('settingsOverlay').classList.add('hidden'); };
    window.toggleMap = () => {
        const m = document.getElementById('mapOverlay');
        if (m) {
            m.classList.toggle('hidden');
            if (!m.classList.contains('hidden')) renderMapUI();
        }
    };
    window.saveAndLogout = saveAndLogout;

    // Mobile Collect Button
    const mbColl = document.getElementById('mobileCollectBtn');
    if (mbColl) mbColl.addEventListener('touchstart', (e) => { e.preventDefault(); collectSnow(); });

    animate();
    initPreviewScene();
    showLoginTab('login');

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Check device selection from UI
            const device = document.querySelector('input[name="device"]:checked')?.value || 'pc';
            gameState.device = device;

            if (device === 'mobile') {
                document.getElementById('mobileControls').classList.remove('hidden');
                initJoystick();
            } else {
                document.getElementById('mobileControls').classList.add('hidden');
            }

            gameState.userId = user.uid;
            await loadGameData(user.uid);
            initMainScene();
            startMultiplayerListener();
            startChatListener();
            updateUI();
            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('gameContainer').classList.remove('hidden');
        } else {
            gameState.userId = null;
            document.getElementById('loginScreen').classList.remove('hidden');
            document.getElementById('gameContainer').classList.add('hidden');
            if (mainRenderer) { mainRenderer.dispose(); mainRenderer = null; }
            if (gameState.unsubscribeMultiplayer) { gameState.unsubscribeMultiplayer(); gameState.unsubscribeMultiplayer = null; }
            if (gameState.unsubscribeChat) { gameState.unsubscribeChat(); gameState.unsubscribeChat = null; }
        }
    });

    const chatInp = document.getElementById('chatInput');
    if (chatInp) chatInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatMessage(); });
});

// ===================================
// DATA HANDLING
// ===================================
async function loadGameData(uid) {
    let retries = 0;
    while (retries < 5) {
        try {
            const s = await getDoc(doc(db, "users", uid));
            if (s.exists()) {
                const d = s.data();
                gameState.snow = d.snow || 0;
                gameState.username = d.username || 'Explorer';
                gameState.gender = d.gender || 'boy';
                gameState.style = d.style || 'explorer';
                gameState.swarm = d.swarm || [];
                gameState.equippedPets = d.equippedPets || [];
                gameState.currentArea = d.currentArea || 'glacier_bay';
                gameState.unlockedAreas = d.unlockedAreas || ['glacier_bay'];
                recalcMultiplier();
                return;
            }
        } catch (e) { console.warn("Load error, retrying...", e); }
        await new Promise(r => setTimeout(r, 800));
        retries++;
    }
}

async function saveGame() {
    if (!gameState.userId) return;
    const data = {
        snow: gameState.snow, swarm: gameState.swarm, equippedPets: gameState.equippedPets,
        currentArea: gameState.currentArea, unlockedAreas: gameState.unlockedAreas
    };
    try { await updateDoc(doc(db, "users", gameState.userId), data); }
    catch (e) { await setDoc(doc(db, "users", gameState.userId), data, { merge: true }); }
}

// ===================================
// ENGINE & RENDERING
// ===================================
function initPreviewScene() {
    const container = document.getElementById('characterPreviewContainer');
    if (!container || previewRenderer) return;
    previewScene = new THREE.Scene();
    previewCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    previewCamera.position.set(0, 1.2, 5);
    previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    previewRenderer.setSize(300, 300);
    container.appendChild(previewRenderer.domElement);
    previewScene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(2, 2, 5);
    previewScene.add(light);
    updateCharacterPreview();
}

function initMainScene() {
    const container = document.getElementById('threejs-container');
    if (!container) return;
    mainScene = new THREE.Scene();
    const area = getCurrentAreaData();
    mainScene.background = new THREE.Color(area.bgColor);
    mainScene.fog = new THREE.Fog(area.bgColor, 15, 45);

    mainCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    mainCamera.position.set(0, 10, 14); // Slightly lower and closer for the smaller map

    mainRenderer = new THREE.WebGLRenderer({ antialias: true });
    mainRenderer.setSize(window.innerWidth, window.innerHeight);
    mainRenderer.shadowMap.enabled = true;
    mainRenderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
    container.innerHTML = '';
    container.appendChild(mainRenderer.domElement);

    mainScene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(15, 30, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048; // Higher res shadows
    sun.shadow.mapSize.height = 2048;
    mainScene.add(sun);

    const groundGeo = new THREE.PlaneGeometry(gameState.mapBounds * 4, gameState.mapBounds * 4);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshPhongMaterial({
        color: area.groundColor,
        shininess: 60,
        specular: 0xffffff,
        flatShading: true
    }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    mainScene.add(ground);

    createPlayer();
    generateDetailedEnvironment();
    spawnCollectibles();
    refresh3DPets();
    setupControls();
}

function generateDetailedEnvironment() {
    gameState.environment.forEach(obj => mainScene.remove(obj));
    gameState.environment = [];
    gameState.particles.forEach(p => mainScene.remove(p.mesh));
    gameState.particles = [];

    const area = getCurrentAreaData();
    const bounds = gameState.mapBounds;

    // --- 1. COASTLINE GENERATION ---
    for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 2;
        const dist = bounds + 4 + Math.random() * 2;
        const iceberg = new THREE.Mesh(
            new THREE.DodecahedronGeometry(Math.random() * 3 + 4, 1),
            new THREE.MeshPhongMaterial({ color: area.type === 'volcano' ? 0x1a0505 : 0xf0f3f4, flatShading: true })
        );
        iceberg.position.set(Math.cos(angle) * dist, 1, Math.sin(angle) * dist);
        iceberg.scale.y = 3;
        mainScene.add(iceberg); gameState.environment.push(iceberg);
    }

    // --- 2. PARTICLES SYSTEM (SNOW/EMBERS/DUST) ---
    const pCount = (area.type === 'snow' || area.type === 'forest') ? 80 : 40;
    const pColor = (area.type === 'volcano') ? 0xff5500 : (area.type === 'cave' ? 0x00f2ff : 0xffffff);
    
    for (let i = 0; i < pCount; i++) {
        const pSize = Math.random() * 0.05 + 0.02;
        const p = new THREE.Mesh(new THREE.BoxGeometry(pSize, pSize, pSize), new THREE.MeshBasicMaterial({ color: pColor, transparent: true, opacity: 0.8 }));
        p.position.set((Math.random() - 0.5) * bounds * 3, Math.random() * 10, (Math.random() - 0.5) * bounds * 3);
        mainScene.add(p);
        gameState.particles.push({ mesh: p, speed: Math.random() * 0.02 + 0.01, type: area.type });
    }

    // --- 3. SCATTERED HABITAT DETAILS ---
    for (let i = 0; i < 140; i++) {
        const x = (Math.random() - 0.5) * bounds * 2.2;
        const z = (Math.random() - 0.5) * bounds * 2.2;
        if (Math.abs(x) < 3.5 && Math.abs(z) < 3.5) continue; 

        const group = new THREE.Group();
        const rand = Math.random();

        if (area.type === 'forest') {
            if (rand > 0.45) {
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.8), new THREE.MeshPhongMaterial({ color: 0x4a2311 }));
                trunk.position.y = 0.4; group.add(trunk);
                for(let j=0; j<3; j++) {
                    const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.2 - j*0.3, 1.4, 6), new THREE.MeshPhongMaterial({ color: 0x145a32 }));
                    leaves.position.y = 1.2 + j*0.7; group.add(leaves);
                }
            } else if (rand > 0.25) {
                const log = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.5, 6), new THREE.MeshPhongMaterial({ color: 0x4a2311 }));
                log.rotation.z = Math.PI/2; log.position.y = 0.3; group.add(log);
            } else {
                group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshPhongMaterial({ color: 0x7f8c8d })));
            }
        } else if (area.type === 'cave') {
            if (rand > 0.5) {
                const cry = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.5, 2.5, 6), new THREE.MeshPhongMaterial({ color: 0x00f2ff, emissive: 0x00f2ff, emissiveIntensity: 1 }));
                cry.position.y = 1.25; group.add(cry);
            } else {
                group.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.8, 1), new THREE.MeshPhongMaterial({ color: 0x212f3d })));
            }
        } else if (area.type === 'volcano') {
            if (rand > 0.6) {
                const vent = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 0.3, 8), new THREE.MeshPhongMaterial({ color: 0x1a0505 }));
                vent.position.y = 0.15; group.add(vent);
                const lava = new THREE.Mesh(new THREE.CircleGeometry(0.8, 8), new THREE.MeshBasicMaterial({ color: 0xff4400 }));
                lava.rotation.x = -Math.PI/2; lava.position.y = 0.31; group.add(lava);
            } else {
                group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), new THREE.MeshPhongMaterial({ color: 0x1a0505 })));
            }
        } else {
            if (rand > 0.9) {
                for(let k=0; k<5; k++) {
                    const st = new THREE.Mesh(new THREE.IcosahedronGeometry(Math.random()*0.1 + 0.1, 0), new THREE.MeshPhongMaterial({ color: 0x95a5a6 }));
                    st.position.set(Math.cos(k)*0.6, 0.1, Math.sin(k)*0.6); group.add(st);
                }
            } else if (rand > 0.7) {
                group.add(new THREE.Mesh(new THREE.SphereGeometry(Math.random()*0.8 + 0.4, 8, 8, 0, Math.PI*2, 0, Math.PI/2), new THREE.MeshPhongMaterial({ color: 0xffffff })));
            } else if (rand > 0.4) {
                const spike = new THREE.Mesh(new THREE.ConeGeometry(0.3, Math.random()*1 + 0.5, 4), new THREE.MeshPhongMaterial({ color: 0xd6eaf8, transparent: true, opacity: 0.8 }));
                spike.position.y = spike.geometry.parameters.height/2; group.add(spike);
            } else {
                group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), new THREE.MeshPhongMaterial({ color: 0x566573 })));
            }
        }
        group.position.set(x, 0, z);
        mainScene.add(group);
        gameState.environment.push(group);
    }
}

function createExplorerMesh(gender, style, isRemote) {
    const group = new THREE.Group();
    let parkaColor = (gender === 'boy') ? 0x2980b9 : 0xe91e63;
    if (isRemote) parkaColor = 0x808b96;
    if (style === 'kitty') parkaColor = 0xffffff;
    if (style === 'ninja') parkaColor = 0x212121;
    if (style === 'hero') parkaColor = 0xfbc531;
    if (style === 'princess') parkaColor = 0xa569bd;
    if (style === 'space') parkaColor = 0xecf0f1;
    if (style === 'pusheen') parkaColor = 0xa67b5b;

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.8, 4, 8), new THREE.MeshPhongMaterial({ color: parkaColor }));
    body.position.y = 0.9; body.castShadow = true;
    if (style === 'pusheen') body.scale.set(1.4, 0.9, 1.4);
    group.add(body);

    if (style !== 'kitty' && style !== 'pusheen') {
        const zipper = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.7, 0.05), new THREE.MeshPhongMaterial({ color: 0xbdc3c7 }));
        zipper.position.set(0, 0.9, 0.4); group.add(zipper);
    }

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 16), new THREE.MeshPhongMaterial({ color: (style === 'kitty' || style === 'pusheen' ? parkaColor : 0xf5cba7) }));
    head.position.y = 1.65; group.add(head);

    const hairColor = (style === 'princess') ? 0xf4d03f : 0x4a2311;
    if (style !== 'kitty' && style !== 'space' && style !== 'pusheen') {
        const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 16, 0, Math.PI * 2, 0, Math.PI / (gender === 'girl' ? 2 : 2.2)), new THREE.MeshPhongMaterial({ color: hairColor }));
        hairCap.position.y = 1.68; group.add(hairCap);
        if (gender === 'girl') {
            const hB = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 4, 8), new THREE.MeshPhongMaterial({ color: hairColor }));
            hB.position.set(0, 1.4, -0.2); hB.rotation.x = 0.2; group.add(hB);
            const sideH = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.5, 4, 4), new THREE.MeshPhongMaterial({ color: hairColor }));
            const sL = sideH.clone(); sL.position.set(0.35, 1.4, 0); group.add(sL);
            const sR = sideH.clone(); sR.position.set(-0.35, 1.4, 0); group.add(sR);
        } else {
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 4), new THREE.MeshPhongMaterial({ color: hairColor }));
            spike.position.set(0.1, 1.95, 0.1); group.add(spike);
            const spike2 = spike.clone(); spike2.position.set(-0.1, 1.95, 0); group.add(spike2);
        }
    }

    if (style === 'kitty') {
        const bow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.1), new THREE.MeshPhongMaterial({ color: 0xc0392b }));
        bow.position.set(0.2, 1.9, 0.22); group.add(bow);
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.25, 4), new THREE.MeshPhongMaterial({ color: parkaColor }));
        ear.position.set(0.25, 1.98, 0); group.add(ear);
        const ear2 = ear.clone(); ear2.position.x = -0.25; group.add(ear2);
        const whisk = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        for (let i = 0; i < 3; i++) {
            const wL = whisk.clone(); wL.position.set(0.35, 1.55 + i * 0.08, 0.35); wL.rotation.z = (i - 1) * 0.2; group.add(wL);
            const wR = whisk.clone(); wR.position.set(-0.35, 1.55 + i * 0.08, 0.35); wR.rotation.z = -(i - 1) * 0.2; group.add(wR);
        }
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), new THREE.MeshPhongMaterial({ color: 0xf4d03f }));
        nose.position.set(0, 1.58, 0.4); group.add(nose);
    } else if (style === 'ninja') {
        const lM = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.25, 0.16), new THREE.MeshPhongMaterial({ color: 0x212121 }));
        lM.position.set(0, 1.5, 0.32); group.add(lM);
        const uM = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.12, 0.16), new THREE.MeshPhongMaterial({ color: 0x212121 }));
        uM.position.set(0, 1.75, 0.32); group.add(uM);
        const sword = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), new THREE.MeshPhongMaterial({ color: 0x95a5a6 }));
        sword.rotation.z = Math.PI / 4; sword.position.set(0, 1.1, -0.45); group.add(sword);
    } else if (style === 'hero') {
        const cape = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.05), new THREE.MeshPhongMaterial({ color: 0x922b21 }));
        cape.position.set(0, 0.85, -0.42); cape.rotation.x = 0.15; group.add(cape);
    } else if (style === 'princess') {
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.2, 6), new THREE.MeshPhongMaterial({ color: 0xf1c40f }));
        crown.position.set(0, 2.05, 0); group.add(crown);
    } else if (style === 'space') {
        const tank = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.35), new THREE.MeshPhongMaterial({ color: 0xbdc3c7 }));
        tank.position.set(0, 0.9, -0.45); group.add(tank);
        const visor = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16, 0, Math.PI * 2, 0, Math.PI / 1.6), new THREE.MeshPhongMaterial({ color: 0x5dade2, transparent: true, opacity: 0.5 }));
        visor.position.y = 1.65; group.add(visor);
    } else if (style === 'pusheen') {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.1), new THREE.MeshPhongMaterial({ color: 0x5d4037 }));
        for (let i = 0; i < 3; i++) { const s = stripe.clone(); s.position.set((i - 1) * 0.15, 1.95, 0.1); group.add(s); }
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshPhongMaterial({ color: parkaColor }));
        ear.scale.y = 0.5; const eL = ear.clone(); eL.position.set(0.25, 1.95, 0); group.add(eL); const eR = ear.clone(); eR.position.set(-0.25, 1.95, 0); group.add(eR);
        const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.4, 4, 4), new THREE.MeshPhongMaterial({ color: parkaColor }));
        tail.rotation.x = -Math.PI / 2.5; tail.position.set(0, 0.5, -0.5); group.add(tail);
        const whisk = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: 0x5d4037 }));
        for (let i = 0; i < 2; i++) {
            const wL = whisk.clone(); wL.position.set(0.3, 1.55 + i * 0.08, 0.35); group.add(wL);
            const wR = whisk.clone(); wR.position.set(-0.3, 1.55 + i * 0.08, 0.35); group.add(wR);
        }
    }

    const limGeo = new THREE.CapsuleGeometry(0.14, 0.6, 4, 8);
    const aL = new THREE.Mesh(limGeo, new THREE.MeshPhongMaterial({ color: parkaColor })); aL.position.set(0.55, 1.1, 0); group.add(aL);
    const aR = new THREE.Mesh(limGeo, new THREE.MeshPhongMaterial({ color: parkaColor })); aR.position.set(-0.55, 1.1, 0); group.add(aR);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshPhongMaterial({ color: (style === 'kitty' || style === 'pusheen' ? parkaColor : 0xf5cba7) }));
    const hL = hand.clone(); hL.position.set(0, -0.35, 0); aL.add(hL); const hR = hand.clone(); hR.position.set(0, -0.35, 0); aR.add(hR);
    const lL = new THREE.Mesh(limGeo, new THREE.MeshPhongMaterial({ color: 0x1c2833 })); lL.position.set(0.2, 0.35, 0); group.add(lL);
    const lR = new THREE.Mesh(limGeo, new THREE.MeshPhongMaterial({ color: 0x1c2833 })); lR.position.set(-0.2, 0.35, 0); group.add(lR);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.35), new THREE.MeshPhongMaterial({ color: 0x212121 }));
    const bL = boot.clone(); bL.position.set(0, -0.3, 0.05); lL.add(bL); const bR = boot.clone(); bR.position.set(0, -0.3, 0.05); lR.add(bR);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    const fE1 = eye.clone(); fE1.position.set(0.14, 1.62, 0.32); group.add(fE1);
    const fE2 = eye.clone(); fE2.position.set(-0.14, 1.62, 0.32); group.add(fE2);

    return { group, parts: { aL, aR, lL, lR } };
}

function createPlayer() {
    const info = createExplorerMesh(gameState.gender, gameState.style, false);
    mainScene.add(info.group); gameState.player.mesh = info.group; gameState.player.parts = info.parts;
}

function startChatListener() {
    if (gameState.unsubscribeChat) gameState.unsubscribeChat();
    const q = query(collection(db, "chats"), where("area", "==", gameState.currentArea), limit(25));
    gameState.unsubscribeChat = onSnapshot(q, (sn) => {
        const msgs = []; sn.forEach(doc => msgs.push(doc.data()));
        const chatBox = document.getElementById('chatMessages');
        if (chatBox) {
            chatBox.innerHTML = msgs.sort((a, b) => a.timestamp?.toMillis() - b.timestamp?.toMillis()).map(m => `<div class="chat-msg"><span class="sender">${m.sender}:</span> ${m.text}</div>`).join('');
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    });
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const txt = input.value.trim();
    if (!txt || !gameState.username) return;
    input.value = '';
    await addDoc(collection(db, "chats"), { sender: gameState.username, text: txt, area: gameState.currentArea, timestamp: serverTimestamp() });
}

function startMultiplayerListener() {
    if (gameState.unsubscribeMultiplayer) gameState.unsubscribeMultiplayer();
    const q = query(collection(db, "users"), where("currentArea", "==", gameState.currentArea));
    gameState.unsubscribeMultiplayer = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const data = change.doc.data(); const id = change.doc.id;
            if (id === gameState.userId) return;
            if (change.type === "removed") {
                if (gameState.remotePlayers[id]) { mainScene.remove(gameState.remotePlayers[id].mesh); delete gameState.remotePlayers[id]; }
            } else {
                if (!gameState.remotePlayers[id]) {
                    const info = createExplorerMesh(data.gender || 'boy', data.style || 'explorer', true);
                    mainScene.add(info.group);
                    gameState.remotePlayers[id] = { mesh: info.group, parts: info.parts, target: new THREE.Vector3(data.x || 0, 0, data.z || 0), rot: data.rot || 0 };
                } else {
                    const rp = gameState.remotePlayers[id]; rp.target.set(data.x || 0, 0, data.z || 0); rp.rot = data.rot || 0;
                }
            }
        });
    });
}

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta(), t = Date.now();
    if (previewRenderer && previewCharacter) { previewCharacter.rotation.y += 0.01; previewRenderer.render(previewScene, previewCamera); }
    if (mainRenderer && gameState.player.mesh) {
        updateMovement();
        if (gameState.player.moving) {
            gameState.player.trail.unshift({ x: gameState.player.mesh.position.x, z: gameState.player.mesh.position.z, rot: gameState.player.mesh.rotation.y });
            if (gameState.player.trail.length > 100) gameState.player.trail.pop();
            const s = t * 0.02;
            gameState.player.parts.aL.rotation.x = Math.sin(s) * 0.8;
            gameState.player.parts.aR.rotation.x = Math.sin(s + Math.PI) * 0.8;
            gameState.player.parts.lL.rotation.x = Math.sin(s + Math.PI) * 0.8;
            gameState.player.parts.lR.rotation.x = Math.sin(s) * 0.8;
            syncPositionToServer();
        }
        for (let id in gameState.remotePlayers) {
            const rp = gameState.remotePlayers[id];
            rp.mesh.position.lerp(rp.target, 0.1);
            rp.mesh.rotation.y = THREE.MathUtils.lerp(rp.mesh.rotation.y, rp.rot, 0.1);
        }
        gameState.pets.forEach((p, i) => {
            const delay = (i + 1) * 15;
            if (gameState.player.trail[delay]) {
                const target = gameState.player.trail[delay];
                p.mesh.position.lerp(new THREE.Vector3(target.x, 0.5 + Math.sin(t * 0.01 + i) * 0.1, target.z), 0.15);
                p.mesh.rotation.y = target.rot;
            }
        });
        gameState.collectibles.forEach(c => { c.mesh.rotation.y += dt; c.mesh.position.y = 1.3 + Math.sin(t * 0.005) * 0.5; });

        // --- ATMOSPHERIC PARTICLES ---
        gameState.particles.forEach(p => {
            if (p.type === 'volcano') { 
                p.mesh.position.y += p.speed * 2; // Embers go up
                p.mesh.position.x += Math.sin(t * 0.002 + p.mesh.position.y) * 0.01;
            } else {
                p.mesh.position.y -= p.speed; // Snow/Dust goes down
                p.mesh.position.x += Math.sin(t * 0.001 + p.mesh.position.y) * 0.01;
            }
            if (p.mesh.position.y < 0) p.mesh.position.y = 10;
            if (p.mesh.position.y > 10) p.mesh.position.y = 0;
        });

        // --- CAMERA PERSPECTIVE SYSTEM ---
        const cam = gameState.camera;
        const targetX = gameState.player.mesh.position.x + cam.radius * Math.sin(cam.phi) * Math.sin(cam.theta);
        const targetY = gameState.player.mesh.position.y + cam.radius * Math.cos(cam.phi);
        const targetZ = gameState.player.mesh.position.z + cam.radius * Math.sin(cam.phi) * Math.cos(cam.theta);

        mainCamera.position.x = THREE.MathUtils.lerp(mainCamera.position.x, targetX, 0.1);
        mainCamera.position.y = THREE.MathUtils.lerp(mainCamera.position.y, targetY, 0.1);
        mainCamera.position.z = THREE.MathUtils.lerp(mainCamera.position.z, targetZ, 0.1);
        mainCamera.lookAt(gameState.player.mesh.position);

        mainRenderer.render(mainScene, mainCamera);
    }
}

function initJoystick() {
    const zone = document.getElementById('joystickZone');
    if (!zone) return;

    const handleTouch = (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = zone.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const dx = touch.clientX - centerX;
        const dy = touch.clientY - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = rect.width / 2;

        const angle = Math.atan2(dy, dx);
        const power = Math.min(dist / maxDist, 1);

        gameState.joystick.x = Math.cos(angle) * power;
        gameState.joystick.y = Math.sin(angle) * power;
        gameState.joystick.active = true;
    };

    zone.addEventListener('touchstart', handleTouch);
    zone.addEventListener('touchmove', handleTouch);
    zone.addEventListener('touchend', () => {
        gameState.joystick.active = false;
        gameState.joystick.x = 0;
        gameState.joystick.y = 0;
    });
}

function updateMovement() {
    const p = gameState.player;
    let mx = 0, mz = 0;

    // Keyboard controls
    if (keys['w'] || keys['arrowup']) mz -= p.speed;
    if (keys['s'] || keys['arrowdown']) mz += p.speed;
    if (keys['a'] || keys['arrowleft']) mx -= p.speed;
    if (keys['d'] || keys['arrowright']) mx += p.speed;

    // Joystick controls (Mobile)
    if (gameState.device === 'mobile' && gameState.joystick.active) {
        mx = gameState.joystick.x * p.speed * 1.5;
        mz = gameState.joystick.y * p.speed * 1.5;
    }

    if (mx !== 0 || mz !== 0) {
        const nx = p.mesh.position.x + mx, nz = p.mesh.position.z + mz;
        if (nx * nx < gameState.mapBounds * gameState.mapBounds && nz * nz < gameState.mapBounds * gameState.mapBounds) {
            p.mesh.position.set(nx, 0, nz); p.mesh.rotation.y = Math.atan2(mx, mz); p.moving = true;
        }
    } else p.moving = false;

    if (keys[' ']) { collectSnow(); keys[' '] = false; }
}

function syncPositionToServer() {
    if (!gameState.userId || Date.now() - gameState.player.lastSync < 300) return;
    gameState.player.lastSync = Date.now();
    updateDoc(doc(db, "users", gameState.userId), { x: gameState.player.mesh.position.x, z: gameState.player.mesh.position.z, rot: gameState.player.mesh.rotation.y });
}

function spawnCollectibles() {
    gameState.collectibles.forEach(c => mainScene.remove(c.mesh)); gameState.collectibles = [];
    for (let i = 0; i < 15; i++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x00ffff }));
        m.position.set((Math.random() - 0.5) * gameState.mapBounds * 1.7, 1.3, (Math.random() - 0.5) * gameState.mapBounds * 1.7);
        mainScene.add(m); gameState.collectibles.push({ mesh: m, value: getCurrentAreaData().snowValue });
    }
}

function collectSnow() {
    const p = gameState.player.mesh.position;
    for (let i = gameState.collectibles.length - 1; i >= 0; i--) {
        const c = gameState.collectibles[i];
        if (p.distanceTo(c.mesh.position) < 3) {
            mainScene.remove(c.mesh); gameState.collectibles.splice(i, 1);
            const gain = Math.floor(c.value * gameState.multiplier);
            gameState.snow += gain; showCollectionPopup('❄️', `+${gain}`);
            updateUI(); saveGame();
            if (gameState.collectibles.length < 5) spawnCollectibles();
            break;
        }
    }
}

function recalcMultiplier() {
    gameState.multiplier = 1.0;
    gameState.swarm.forEach(p => { gameState.multiplier += penguinTypes[p.type].mult; });
}

function refresh3DPets() {
    gameState.pets.forEach(p => mainScene.remove(p.mesh)); gameState.pets = [];
    gameState.swarm.filter(p => gameState.equippedPets.includes(p.id)).slice(0, 4).forEach(p => {
        const m = createPenguinMesh(penguinTypes[p.type].color); mainScene.add(m); gameState.pets.push({ mesh: m, type: p.type });
    });
}
function createPenguinMesh(color) {
    const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.5, 4, 8), new THREE.MeshPhongMaterial({ color })));
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), new THREE.MeshPhongMaterial({ color: 0xffffff }));
    b.scale.set(1, 1.2, 0.5); b.position.set(0, 0.2, 0.22); g.add(b); return g;
}

function updateUI() {
    document.getElementById('snowCount').textContent = Math.floor(gameState.snow).toLocaleString();
    document.getElementById('multiplierText').textContent = gameState.multiplier.toFixed(1) + 'x';
    document.getElementById('currentAreaName').textContent = getCurrentAreaData().name;
}

function renderMapUI() {
    const grid = document.getElementById('mapContent');
    const icons = { glacier_bay: '🏔️', frozen_forest: '🌲', crystal_caves: '💎', aurora_peaks: '🌌', arctic_volcano: '🌋', snowy_village: '🏘️' };
    grid.innerHTML = gameState.areas.map(a => {
        const isCurrent = a.id === gameState.currentArea;
        const isUnlocked = gameState.unlockedAreas.includes(a.id);
        const canBuy = gameState.snow >= a.requirement;
        return `<div class="map-item ${(!isUnlocked && !canBuy) ? 'locked' : ''} ${isCurrent ? 'current' : ''}" onclick="travelTo('${a.id}')"><div style="font-size: 3rem; margin-bottom: 5px;">${icons[a.id]}</div><h3>${a.name}</h3><p style="color: ${isUnlocked ? '#00ff88' : (canBuy ? '#fbc531' : '#e74c3c')}">${isUnlocked ? (isCurrent ? 'Current' : 'Warp') : (canBuy ? 'Buy & Warp' : `🔒 ${a.requirement.toLocaleString()}`)}</p></div>`;
    }).join('');
}

function getCurrentAreaData() { return gameState.areas.find(a => a.id === gameState.currentArea); }
function showCollectionPopup(i, t) { const p = document.getElementById('collectionPopup'); if (p) { document.getElementById('popupIcon').textContent = i; document.getElementById('popupText').textContent = t; p.classList.remove('hidden'); setTimeout(() => p.classList.add('hidden'), 800); } }
function setupControls() {
    window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
    window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

    const cam = gameState.camera;

    window.addEventListener('mousedown', (e) => {
        if (e.button === 2 && e.target.tagName === 'CANVAS') {
            cam.isRotating = true;
            cam.lastMouseX = e.clientX;
            cam.lastMouseY = e.clientY;
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (cam.isRotating) {
            const dx = e.clientX - cam.lastMouseX;
            const dy = e.clientY - cam.lastMouseY;
            cam.theta -= dx * 0.01;
            cam.phi = Math.max(0.1, Math.min(Math.PI / 2.1, cam.phi + dy * 0.01));
            cam.lastMouseX = e.clientX;
            cam.lastMouseY = e.clientY;
        }
    });

    window.addEventListener('mouseup', (e) => {
        if (e.button === 2) cam.isRotating = false;
    });

    window.addEventListener('contextmenu', (e) => {
        if (e.target.tagName === 'CANVAS') e.preventDefault();
    });
}
function renderPetBag() {
    const grid = document.getElementById('petBagGrid'); if (!grid) return;
    grid.innerHTML = gameState.swarm.map(p => {
        const t = penguinTypes[p.type]; const eq = gameState.equippedPets.includes(p.id);
        return `<div class="pet-card ${p.type} ${eq ? 'equipped' : ''}"><div class="pet-card-icon">${t.icon}</div><span class="pet-card-name">${t.name}</span><span class="pet-card-mult">+${t.mult}x</span></div>`;
    }).join('') || '<p>No penguins yet!</p>';
}
