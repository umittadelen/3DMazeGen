const canvas = document.getElementById('canvas');
const displayCtx = canvas.getContext('2d', { alpha: false });
const renderCanvas = document.createElement('canvas');
const renderCtx = renderCanvas.getContext('2d', { alpha: false });
let minimap = document.getElementById('minimap');
let minimapCtx = null;
const info = document.getElementById('info');
const upload = document.getElementById('upload');
const urlBtn = document.getElementById('urlBtn');
const urlInput = document.getElementById('urlInput');
const superSampleScaleInput = document.getElementById('superSampleScaleInput');
const superSampleScaleValue = document.getElementById('superSampleScaleValue');
const fovInput = document.getElementById('fovInput');
const fovValue = document.getElementById('fovValue');
let screenWidth = window.innerWidth;
let screenHeight = window.innerHeight;
let renderWidth = window.innerWidth;
let renderHeight = window.innerHeight;

// ---- ORIENTATION LOCK ----
function checkOrientation() {
    const warning = document.getElementById('portrait-warning');
    const container = document.getElementById('container');
    
    if (window.innerHeight > window.innerWidth) {
        // Portrait mode
        warning.classList.add('show');
        container.style.display = 'none';
    } else {
        // Landscape mode
        warning.classList.remove('show');
        container.style.display = 'block';
    }
}

window.addEventListener('orientationchange', checkOrientation);
window.addEventListener('resize', checkOrientation);
checkOrientation();

const MINIMAP_SIZE = 150;
const MINIMAP_RANGE_STEP = 1;
const MINIMAP_MIN_RANGE = 2;
let minimapRange = 5;

// Create minimap if it doesn't exist
if (!minimap) {
    minimap = document.createElement('canvas');
    minimap.id = 'minimap';
    minimap.style.position = 'fixed';
    minimap.style.top = '20px';
    minimap.style.right = '20px';
    minimap.style.border = '2px solid #fff';
    minimap.style.borderRadius = '50%';
    minimap.style.display = 'none';
    minimap.style.zIndex = '1000';
    minimap.style.background = '#000';
    document.body.appendChild(minimap);
}
minimapCtx = minimap.getContext('2d');

let maze = null;
let mazeWidth = 0;
let mazeHeight = 0;
let playerX = 0;
let playerY = 0;
let playerAngle = 0;
let goalX = 0;
let goalY = 0;
let won = false;
let running = false;
let minimapVisible = false;
let gameLoopId = null;
let needsRender = true;
let debugVisible = false;

const debugOverlay = document.createElement('pre');
debugOverlay.id = 'debugOverlay';
debugOverlay.style.position = 'fixed';
debugOverlay.style.left = '10px';
debugOverlay.style.top = '10px';
debugOverlay.style.margin = '0';
debugOverlay.style.padding = '8px 10px';
debugOverlay.style.background = 'rgba(0, 0, 0, 0.7)';
debugOverlay.style.color = '#b8ffb8';
debugOverlay.style.border = '1px solid rgba(184, 255, 184, 0.45)';
debugOverlay.style.fontFamily = 'Consolas, Monaco, monospace';
debugOverlay.style.fontSize = '12px';
debugOverlay.style.lineHeight = '1.35';
debugOverlay.style.whiteSpace = 'pre';
debugOverlay.style.pointerEvents = 'none';
debugOverlay.style.zIndex = '5000';
debugOverlay.style.display = 'none';
document.body.appendChild(debugOverlay);

let fpsValue = 0;
let frameTimeMs = 0;
let fpsFrameCounter = 0;
let fpsSampleStart = performance.now();

let playerPitch = 0;
const MAX_PITCH = Math.PI / 2 * 0.99;

const DEFAULT_FOV_DEGREES = 80;
const MIN_FOV_DEGREES = 45;
const MAX_FOV_DEGREES = 100;
const DEFAULT_SUPER_SAMPLE_SCALE = 1;
const MIN_SUPER_SAMPLE_SCALE = 0.25;
const MAX_SUPER_SAMPLE_SCALE = 4;
const SETTINGS_STORAGE_KEY = 'mazeRenderSettings';

let fovDegrees = DEFAULT_FOV_DEGREES;
let FOV = (fovDegrees * Math.PI) / 180;
let NUM_RAYS = 1024;
// How far the raycaster checks for walls. Higher = can see farther, but costs more work per ray.
const MAX_DEPTH = 8;
minimapRange = Math.min(minimapRange, MAX_DEPTH);
// Background sky tint. Lower RGB values make the upper half of the screen closer to black.
const SKY_COLOR = { r: 8, g: 10, b: 14 };
// Far fog target color. Pure black means the far distance fades all the way to black.
const FOG_COLOR = { r: 0, g: 0, b: 0 };
const FOG_IS_BLACK = FOG_COLOR.r === 0 && FOG_COLOR.g === 0 && FOG_COLOR.b === 0;
// Background floor tint. Lower RGB values make the lower half of the screen darker.
const GROUND_COLOR = { r: 5, g: 6, b: 8 };
// Overall distance darkening on walls. Higher = far walls get much darker, lower = depth looks flatter.
const DISTANCE_SHADOW_STRENGTH = 0.82;
// Global fog amount multiplier. 1 means halfway to MAX_DEPTH is 50% fog and MAX_DEPTH is full fog.
const FOG_BLEND_STRENGTH = 1;
// Minecraft-style brightness lift. Higher values brighten mid/dark wall shading without removing full-black fog.
const GAMMA = 2.2;
// Base darkness applied to every wall face so nothing looks fully bright. Higher = all walls look moodier.
const FACE_SHADOW_STRENGTH = 0.12;
const SIDE_SHADOW_STRENGTH = 0.12;
// Fixed world light direction so north/south/east/west faces do not all shade the same.
const WALL_LIGHT_DIR_X = -0.78;
const WALL_LIGHT_DIR_Y = -0.62;
const DIRECTIONAL_FACE_SHADOW_STRENGTH = 0.16;
const MOVE_SPEED = 0.025;
const ROT_SPEED = 0.025;
const BASE_FRAME_SECONDS = 1 / 60;
const MAX_DELTA_SECONDS = 0.1;
let superSampleScale = DEFAULT_SUPER_SAMPLE_SCALE;
const MAX_SUPERSAMPLE_PIXELS = 50000000;

const keys = {};
let mouseLocked = false;
let ignoreMouseMovement = false;
let pointerLockPending = false;  // Flag to prevent simultaneous lock/unlock requests
let lastFrameTimestamp = null;
let backgroundGradientCacheKey = '';
let cachedSkyGradient = null;
let cachedGroundGradient = null;

let mazeWorker = null;
let mazeWorkerRequestId = 0;
const mazeWorkerPending = new Map();

function initMazeWorker() {
    if (typeof Worker === 'undefined') return;
    try {
        mazeWorker = new Worker('scripts/mazeWorker.js');

        mazeWorker.addEventListener('message', (event) => {
            const { id, ok, result, error } = event.data || {};
            const pending = mazeWorkerPending.get(id);
            if (!pending) return;

            mazeWorkerPending.delete(id);
            clearTimeout(pending.timeoutId);

            if (ok) {
                pending.resolve(result);
            } else {
                pending.reject(new Error(error || 'Maze worker failed to parse file'));
            }
        });

        mazeWorker.addEventListener('error', (event) => {
            const err = new Error(event.message || 'Maze worker crashed');
            mazeWorkerPending.forEach((pending) => {
                clearTimeout(pending.timeoutId);
                pending.reject(err);
            });
            mazeWorkerPending.clear();
            mazeWorker = null;
        });
    } catch (err) {
        console.warn('Maze worker disabled:', err);
        mazeWorker = null;
    }
}

function parseMazeFormatSync(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 8) {
        throw new Error('.maze file is corrupted (too small for V2 header)');
    }

    const bytes = new Uint8Array(arrayBuffer);
    if (bytes[0] !== 0x4d || bytes[1] !== 0x41 || bytes[2] !== 0x5a || bytes[3] !== 0x45) {
        throw new Error('Invalid .maze file magic; expected MAZE V2 format');
    }
    if (bytes[4] !== 2) {
        throw new Error('Unsupported .maze version: ' + bytes[4]);
    }

    let offset = 5;

    function readVarint(fieldName) {
        let value = 0;
        let shift = 0;

        for (let i = 0; i < 5; i++) {
            if (offset >= bytes.length) {
                throw new Error('.maze file is truncated while reading ' + fieldName);
            }

            const byte = bytes[offset++];
            value += (byte & 0x7F) * (2 ** shift);
            if ((byte & 0x80) === 0) {
                if (!Number.isSafeInteger(value)) {
                    throw new Error('.maze ' + fieldName + ' exceeds safe integer range');
                }
                return value;
            }
            shift += 7;
        }

        throw new Error('.maze ' + fieldName + ' varint is too large');
    }

    const width = readVarint('width');
    const height = readVarint('height');
    const startIndex = readVarint('start index');
    const goalIndex = readVarint('goal index');

    if (width < 3 || height < 3 || width > 50000 || height > 50000) {
        throw new Error('.maze file has invalid dimensions: ' + width + 'x' + height);
    }

    const totalCells = width * height;
    if (!Number.isSafeInteger(totalCells) || totalCells <= 0) {
        throw new Error('.maze file dimensions overflowed');
    }
    if (startIndex < 0 || startIndex >= totalCells || goalIndex < 0 || goalIndex >= totalCells) {
        throw new Error('.maze file has invalid start or goal index');
    }

    const expectedMazeBytes = Math.ceil(totalCells / 8);
    const expectedSize = offset + expectedMazeBytes;
    if (bytes.length !== expectedSize) {
        throw new Error('.maze file size does not match V2 payload length');
    }

    const packed = bytes.subarray(offset);
    const cells = new Uint8Array(totalCells);

    for (let i = 0; i < totalCells; i++) {
        const isWalkable = ((packed[i >> 3] >> (7 - (i & 7))) & 1) === 1;
        cells[i] = isWalkable ? 1 : 0;
    }

    if (startIndex === goalIndex) {
        throw new Error('.maze file start and goal cannot be the same cell');
    }
    if (cells[startIndex] === 0 || cells[goalIndex] === 0) {
        throw new Error('.maze file start and goal must be on walkable cells');
    }

    cells[startIndex] = 2;
    cells[goalIndex] = 3;

    return { width, height, cells, startIndex, goalIndex };
}

function parseMazeFormatWithWorker(arrayBuffer) {
    if (!mazeWorker) {
        return Promise.resolve(parseMazeFormatSync(arrayBuffer));
    }

    return new Promise((resolve, reject) => {
        const id = ++mazeWorkerRequestId;
        const timeoutId = setTimeout(() => {
            mazeWorkerPending.delete(id);
            reject(new Error('.maze file parse timed out'));
        }, 10000);

        mazeWorkerPending.set(id, { resolve, reject, timeoutId });

        try {
            mazeWorker.postMessage({
                id,
                type: 'parseMazeFormat',
                arrayBuffer
            }, [arrayBuffer]);
        } catch (err) {
            clearTimeout(timeoutId);
            mazeWorkerPending.delete(id);
            reject(err);
        }
    });
}

initMazeWorker();

const wallTextures = [];
let wallTexturesReady = false;
const textureNames = ['bricks.png', 'bricks1.png', 'bricks2.png'];
const WALL_TEXTURE_REPEAT = 7; // Set to 4 for 4x4 tiling
const WALL_ATLAS_VARIANTS = 24;
let pendingTextureLoads = textureNames.length;
let mazeTextureSeed = 2166136261 >>> 0;
const wallTextureAtlases = [];

function clearWallTextureAtlasCache() {
    wallTextureAtlases.length = 0;
}

function createRandomizedCellAtlas(variantIndex) {
    if (wallTextures.length === 0) return null;

    const base = wallTextures[0];
    const tileWidth = base.width;
    const tileHeight = base.height;

    const atlas = document.createElement('canvas');
    atlas.width = tileWidth * WALL_TEXTURE_REPEAT;
    atlas.height = tileHeight * WALL_TEXTURE_REPEAT;

    const atlasCtx = atlas.getContext('2d', { alpha: false });
    atlasCtx.imageSmoothingEnabled = false;

    for (let ty = 0; ty < WALL_TEXTURE_REPEAT; ty++) {
        for (let tx = 0; tx < WALL_TEXTURE_REPEAT; tx++) {
            const subtileHash = hashCoord(
                mazeTextureSeed ^ Math.imul((variantIndex + 1), 0x9e3779b9),
                tx,
                ty
            );
            const src = wallTextures[subtileHash % wallTextures.length];
            atlasCtx.drawImage(
                src,
                0,
                0,
                src.width,
                src.height,
                tx * tileWidth,
                ty * tileHeight,
                tileWidth,
                tileHeight
            );
        }
    }

    return atlas;
}

function rebuildWallTextureAtlases() {
    clearWallTextureAtlasCache();
    if (!wallTexturesReady || wallTextures.length === 0) return;

    for (let i = 0; i < WALL_ATLAS_VARIANTS; i++) {
        const atlas = createRandomizedCellAtlas(i);
        if (atlas) {
            wallTextureAtlases.push(atlas);
        }
    }
}

textureNames.forEach((name) => {
    const texture = new Image();

    texture.addEventListener('load', () => {
        wallTextures.push(texture);
        pendingTextureLoads -= 1;
        if (pendingTextureLoads === 0) {
            wallTexturesReady = true;
            rebuildWallTextureAtlases();
            needsRender = true;
        }
    });

    texture.addEventListener('error', () => {
        console.warn(`Optional wall texture not found: resources/${name}`);
        pendingTextureLoads -= 1;
        if (pendingTextureLoads === 0) {
            wallTexturesReady = wallTextures.length > 0;
            rebuildWallTextureAtlases();
            needsRender = true;
        }
    });

    texture.src = `resources/${name}`;
});

function fnv1aHash(bytes) {
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < bytes.length; i++) {
        hash ^= bytes[i];
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
}

function computeMazeLayoutSeed(width, height, cells) {
    // Hash normalized maze data so identical maze layouts produce identical textures across devices.
    const header = new Uint8Array(8);
    header[0] = width & 0xff;
    header[1] = (width >>> 8) & 0xff;
    header[2] = (width >>> 16) & 0xff;
    header[3] = (width >>> 24) & 0xff;
    header[4] = height & 0xff;
    header[5] = (height >>> 8) & 0xff;
    header[6] = (height >>> 16) & 0xff;
    header[7] = (height >>> 24) & 0xff;

    let hash = fnv1aHash(header);
    for (let i = 0; i < cells.length; i++) {
        hash ^= cells[i];
        hash = Math.imul(hash, 16777619) >>> 0;
    }

    return hash >>> 0;
}

function hashCoord(seed, x, y) {
    let h = (seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}

function getTextureForCell(cellX, cellY) {
    if (!wallTexturesReady || wallTextureAtlases.length === 0) return null;
    const textureHash = hashCoord(mazeTextureSeed, cellX, cellY);
    return wallTextureAtlases[textureHash % wallTextureAtlases.length];
}

function updateRayCount(targetWidth) {
    // Keep one ray per internal render pixel so supersampling scales ray density exactly with render resolution.
    NUM_RAYS = Math.max(1, Math.floor(targetWidth));
}

function updateDebugOverlay() {
    if (!debugVisible) return;

    const superSampleFactor = screenWidth > 0
        ? (renderWidth / screenWidth).toFixed(2)
        : '1.00';
    const mazeStatus = maze
        ? `${mazeWidth}x${mazeHeight}`
        : 'not loaded';

    debugOverlay.textContent = [
        `FPS: ${fpsValue.toFixed(1)} | Frame: ${frameTimeMs.toFixed(2)} ms`,
        `Screen: ${screenWidth}x${screenHeight}`,
        `Render: ${renderWidth}x${renderHeight} (${superSampleFactor}x)`,
        `Rays: ${NUM_RAYS}`,
        `Player: x=${playerX.toFixed(2)} y=${playerY.toFixed(2)}`,
        `Angle: ${playerAngle.toFixed(3)} | Pitch: ${playerPitch.toFixed(3)}`,
        `Maze: ${mazeStatus}`,
        `Run: ${running} | Minimap: ${minimapVisible} | Won: ${won}`,
        `MouseLock: ${mouseLocked} | NeedsRender: ${needsRender}`,
        'Tab: toggle debug'
    ].join('\n');
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function saveRenderSettings() {
    try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            superSampleScale,
            fovDegrees
        }));
    } catch (err) {
        // Ignore storage failures (private mode/quota) and continue with in-memory values.
    }
}

function loadRenderSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);

        if (parsed && Number.isFinite(parsed.superSampleScale)) {
            superSampleScale = clamp(parsed.superSampleScale, MIN_SUPER_SAMPLE_SCALE, MAX_SUPER_SAMPLE_SCALE);
        }
        if (parsed && Number.isFinite(parsed.fovDegrees)) {
            fovDegrees = clamp(parsed.fovDegrees, MIN_FOV_DEGREES, MAX_FOV_DEGREES);
            FOV = (fovDegrees * Math.PI) / 180;
        }
    } catch (err) {
        // Ignore corrupted settings and keep defaults.
    }
}

function syncRenderSettingsUi() {
    if (superSampleScaleInput) superSampleScaleInput.value = superSampleScale.toFixed(2);
    if (superSampleScaleValue) superSampleScaleValue.textContent = `${superSampleScale.toFixed(2)}x`;
    if (fovInput) fovInput.value = String(Math.round(fovDegrees));
    if (fovValue) fovValue.textContent = `${Math.round(fovDegrees)}°`;
}

function initLoadScreenSettings() {
    if (!superSampleScaleInput || !fovInput) {
        return;
    }

    loadRenderSettings();
    syncRenderSettingsUi();

    superSampleScaleInput.addEventListener('input', () => {
        const nextValue = Number(superSampleScaleInput.value);
        if (!Number.isFinite(nextValue)) return;
        superSampleScale = clamp(nextValue, MIN_SUPER_SAMPLE_SCALE, MAX_SUPER_SAMPLE_SCALE);
        syncRenderSettingsUi();
        saveRenderSettings();
        resizeCanvas();
    });

    fovInput.addEventListener('input', () => {
        const nextValue = Number(fovInput.value);
        if (!Number.isFinite(nextValue)) return;
        fovDegrees = clamp(nextValue, MIN_FOV_DEGREES, MAX_FOV_DEGREES);
        FOV = (fovDegrees * Math.PI) / 180;
        syncRenderSettingsUi();
        saveRenderSettings();
        needsRender = true;
    });
}

function toggleDebugOverlay() {
    debugVisible = !debugVisible;
    debugOverlay.style.display = debugVisible ? 'block' : 'none';
    if (debugVisible) updateDebugOverlay();
}

function presentFrame() {
    displayCtx.setTransform(1, 0, 0, 1, 0, 0);
    displayCtx.clearRect(0, 0, screenWidth, screenHeight);
    displayCtx.drawImage(renderCanvas, 0, 0, renderWidth, renderHeight, 0, 0, screenWidth, screenHeight);
}

function updateBackgroundGradients(centerY) {
    const roundedCenterY = Math.round(centerY);
    const cacheKey = `${renderWidth}x${renderHeight}:${roundedCenterY}`;
    if (backgroundGradientCacheKey === cacheKey && cachedSkyGradient && cachedGroundGradient) {
        return;
    }

    backgroundGradientCacheKey = cacheKey;

    cachedSkyGradient = renderCtx.createLinearGradient(0, 0, 0, roundedCenterY);
    cachedSkyGradient.addColorStop(0, 'rgb(3, 4, 6)');
    cachedSkyGradient.addColorStop(1, `rgb(${SKY_COLOR.r}, ${SKY_COLOR.g}, ${SKY_COLOR.b})`);

    cachedGroundGradient = renderCtx.createLinearGradient(0, roundedCenterY, 0, renderHeight);
    cachedGroundGradient.addColorStop(0, 'rgb(8, 9, 12)');
    cachedGroundGradient.addColorStop(1, `rgb(${GROUND_COLOR.r}, ${GROUND_COLOR.g}, ${GROUND_COLOR.b})`);
}

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = window.innerWidth;
    const cssHeight = window.innerHeight;

    screenWidth = Math.floor(cssWidth * dpr);
    screenHeight = Math.floor(cssHeight * dpr);

    const screenPixels = Math.max(1, screenWidth * screenHeight);
    const maxScaleByPixels = Math.sqrt(MAX_SUPERSAMPLE_PIXELS / screenPixels);
    const internalScale = Math.max(MIN_SUPER_SAMPLE_SCALE, Math.min(superSampleScale, maxScaleByPixels));

    renderWidth = Math.max(1, Math.floor(screenWidth * internalScale));
    renderHeight = Math.max(1, Math.floor(screenHeight * internalScale));

    updateRayCount(renderWidth);

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = screenWidth;
    canvas.height = screenHeight;

    renderCanvas.width = renderWidth;
    renderCanvas.height = renderHeight;
    renderCtx.setTransform(1, 0, 0, 1, 0, 0);
    backgroundGradientCacheKey = '';
    cachedSkyGradient = null;
    cachedGroundGradient = null;

    minimap.width = MINIMAP_SIZE;
    minimap.height = MINIMAP_SIZE;
    // Smooth downsampling from the supersampled render target to the display canvas.
    displayCtx.imageSmoothingEnabled = true;
    displayCtx.imageSmoothingQuality = 'high';
    renderCtx.imageSmoothingEnabled = false;
    minimapCtx.imageSmoothingEnabled = false;
    needsRender = true;
    updateDebugOverlay();
}

initLoadScreenSettings();
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function hideControls() {
    document.getElementById('controls').style.display = 'none';
    info.style.display = 'none';
    document.querySelector('.joystick_container').classList.add('active');
}

function showError(message) {
    info.innerHTML = `<span class="error">Error: ${message}</span>`;
    setTimeout(() => {
        info.innerHTML = 'Load a maze image to start. Use WASD or Arrow keys to move, Mouse to look around.';
    }, 3000);
}

// File upload
upload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.name.endsWith('.maze')) {
        // Load .maze format
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const arrayBuffer = event.target.result;
                
                // Validate that we got data
                if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                    showError('.maze file is empty');
                    return;
                }
                
                const loaded = await loadMazeFormat(arrayBuffer);
                if (loaded) hideControls();
            } catch (err) {
                console.error('Maze load error:', err);
                showError('Failed to load .maze file: ' + err.message);
            }
        };
        reader.onerror = (err) => {
            console.error('FileReader error:', err);
            showError('Failed to read .maze file: ' + err);
        };
        reader.readAsArrayBuffer(file);
    } else {
        // Load image format (PNG, JPG, etc)
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                try {
                    loadMaze(img);
                    hideControls();
                } catch (err) {
                    console.error('Image load error:', err);
                    showError('Failed to load image: ' + err.message);
                }
            };
            img.onerror = (err) => {
                console.error('Image load error:', err);
                showError('Failed to load image file');
            };
            img.src = event.target.result;
        };
        reader.onerror = (err) => {
            console.error('FileReader error:', err);
            showError('Failed to read file: ' + err);
        };
        reader.readAsDataURL(file);
    }
});

// URL upload
urlBtn.addEventListener('click', () => {
    const isHidden = window.getComputedStyle(urlInput).display === 'none';
    urlInput.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
        urlInput.focus();
    }
});

function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

function isMazeUrl(url) {
    try {
        const parsed = new URL(url, window.location.href);
        return parsed.pathname.toLowerCase().endsWith('.maze');
    } catch {
        return url.split('?')[0].toLowerCase().endsWith('.maze');
    }
}

async function loadFromUrl(url) {
    if (isMazeUrl(url)) {
        let response;
        try {
            response = await fetch(url, { mode: 'cors' });
        } catch {
            showError('Failed to fetch .maze from URL. Check CORS or URL validity.');
            return;
        }

        if (!response.ok) {
            showError(`Failed to fetch .maze file (HTTP ${response.status})`);
            return;
        }

        let arrayBuffer;
        try {
            arrayBuffer = await response.arrayBuffer();
        } catch {
            showError('Failed to read .maze response data');
            return;
        }

        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            showError('.maze file is empty');
            return;
        }

        const loaded = await loadMazeFormat(arrayBuffer);
        if (loaded) hideControls();
        return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        loadMaze(img);
        hideControls();
    };
    img.onerror = () => showError('Failed to load image from URL. Check CORS or URL validity.');
    img.src = url;
}

window.addEventListener('DOMContentLoaded', () => {
    const url = getQueryParam('url');
    if (url) {
        loadFromUrl(url);
    }
});

urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const url = urlInput.value.trim();
        if (!url) {
            showError('Please enter a URL');
            return;
        }

        loadFromUrl(url);
    }
});

function loadMaze(img) {
    // Stop previous game loop
    if (gameLoopId) {
        cancelAnimationFrame(gameLoopId);
        gameLoopId = null;
    }
    lastFrameTimestamp = null;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0);

    const imageData = tempCtx.getImageData(0, 0, img.width, img.height);
    const pixels = imageData.data;

    mazeWidth = img.width;
    mazeHeight = img.height;
    maze = new Uint8Array(mazeWidth * mazeHeight);

    let foundStart = false;
    let foundGoal = false;

    // Parse maze: 0=wall, 1=path, 2=start, 3=goal
    for (let i = 0; i < pixels.length; i += 4) {
        const idx = i / 4;
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];

        if (r > 200 && g < 50 && b < 50) {
            maze[idx] = 2; // Start (red)
            playerX = (idx % mazeWidth) + 0.5;
            playerY = Math.floor(idx / mazeWidth) + 0.5;
            foundStart = true;
        } else if (r < 50 && g > 200 && b < 50) {
            maze[idx] = 3; // Goal (green)
            goalX = (idx % mazeWidth) + 0.5;
            goalY = Math.floor(idx / mazeWidth) + 0.5;
            foundGoal = true;
        } else if (r > 200 && g > 200 && b > 200) {
            maze[idx] = 1; // Path (white)
        } else {
            maze[idx] = 0; // Wall (black)
        }
    }

    if (!foundStart || !foundGoal) {
        showError('Maze must have a red start point and green goal point');
        return;
    }

    mazeTextureSeed = computeMazeLayoutSeed(mazeWidth, mazeHeight, maze);
    clearWallTextureAtlasCache();
    rebuildWallTextureAtlases();

    won = false;
    playerAngle = getInitialPlayerAngle();
    playerPitch = 0;
    needsRender = true;
    info.innerHTML = 'Find the green goal! WASD/Arrows to move, Mouse to look. Hold x to run.';
    gameLoopId = requestAnimationFrame(gameLoop);
}

async function loadMazeFormat(arrayBuffer) {
    // Stop previous game loop
    if (gameLoopId) {
        cancelAnimationFrame(gameLoopId);
        gameLoopId = null;
    }
    lastFrameTimestamp = null;

    let parsed;
    try {
        parsed = await parseMazeFormatWithWorker(arrayBuffer);
    } catch (err) {
        showError(err.message || 'Failed to parse .maze file');
        return false;
    }

    mazeWidth = parsed.width;
    mazeHeight = parsed.height;
    maze = parsed.cells;

    playerX = (parsed.startIndex % mazeWidth) + 0.5;
    playerY = Math.floor(parsed.startIndex / mazeWidth) + 0.5;
    goalX = (parsed.goalIndex % mazeWidth) + 0.5;
    goalY = Math.floor(parsed.goalIndex / mazeWidth) + 0.5;

    mazeTextureSeed = computeMazeLayoutSeed(mazeWidth, mazeHeight, maze);
    clearWallTextureAtlasCache();
    rebuildWallTextureAtlases();
    
    won = false;
    playerAngle = getInitialPlayerAngle();
    playerPitch = 0;
    needsRender = true;
    info.innerHTML = 'Find the green goal! WASD/Arrows to move, Mouse to look. Hold x to run.';
    gameLoopId = requestAnimationFrame(gameLoop);
    return true;
}

function isWall(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= mazeWidth || iy < 0 || iy >= mazeHeight) return true;
    return maze[iy * mazeWidth + ix] === 0;
}

function isWalkableCell(cellX, cellY) {
    if (cellX < 0 || cellX >= mazeWidth || cellY < 0 || cellY >= mazeHeight) {
        return false;
    }
    return maze[cellY * mazeWidth + cellX] !== 0;
}

function getCorridorDepth(startCellX, startCellY, dirX, dirY, maxSteps = 6) {
    let depth = 0;
    for (let step = 1; step <= maxSteps; step++) {
        const nextX = startCellX + dirX * step;
        const nextY = startCellY + dirY * step;
        if (!isWalkableCell(nextX, nextY)) {
            break;
        }
        depth += 1;
    }
    return depth;
}

function getInitialPlayerAngle() {
    const startCellX = Math.floor(playerX);
    const startCellY = Math.floor(playerY);
    const goalDirX = goalX - playerX;
    const goalDirY = goalY - playerY;
    const goalLength = Math.hypot(goalDirX, goalDirY) || 1;
    const directions = [
        { dx: 1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: -1 }
    ];

    let bestDirection = null;
    let bestScore = -Infinity;

    for (const direction of directions) {
        const nextCellX = startCellX + direction.dx;
        const nextCellY = startCellY + direction.dy;
        if (!isWalkableCell(nextCellX, nextCellY)) {
            continue;
        }

        const corridorDepth = getCorridorDepth(startCellX, startCellY, direction.dx, direction.dy);
        const goalAlignment = (
            direction.dx * goalDirX + direction.dy * goalDirY
        ) / goalLength;
        const score = corridorDepth * 10 + goalAlignment;

        if (score > bestScore) {
            bestScore = score;
            bestDirection = direction;
        }
    }

    if (bestDirection) {
        return Math.atan2(bestDirection.dy, bestDirection.dx);
    }

    if (goalLength > 0) {
        return Math.atan2(goalDirY, goalDirX);
    }

    return 0;
}

function checkGoal() {
    const dx = playerX - goalX;
    const dy = playerY - goalY;
    if (dx * dx + dy * dy < 0.5) {
        won = true;
        
        // Unlock cursor when winning
        if (mouseLocked) {
            document.exitPointerLock();
            mouseLocked = false;
        }
        
        // Clear input states
        Object.keys(keys).forEach(key => keys[key] = false);
        running = false;
        
        const winModal = document.getElementById('winModal');
        winModal.classList.add('show');
    }
}

function goBack() {
    // Exit pointer lock if active
    if (mouseLocked) {
        document.exitPointerLock();
        mouseLocked = false;
    }
    
    // Clear all input states
    Object.keys(keys).forEach(key => keys[key] = false);
    running = false;
    
    // Hide win modal
    const winModal = document.getElementById('winModal');
    winModal.classList.remove('show');
    
    // Reset game state
    won = false;
    maze = null;
    mazeWidth = 0;
    mazeHeight = 0;
    playerX = 0;
    playerY = 0;
    playerAngle = 0;
    playerPitch = 0;
    goalX = 0;
    goalY = 0;
    
    // Stop current game loop
    if (gameLoopId) {
        cancelAnimationFrame(gameLoopId);
        gameLoopId = null;
    }
    lastFrameTimestamp = null;
    
    // Reset UI - show controls again
    document.getElementById('controls').style.display = 'flex';
    document.querySelector('.joystick_container').classList.remove('active');
    info.innerHTML = 'Load a maze image to start. Use WASD or Arrow keys to move, Mouse to look around.';
    info.style.display = 'block';
    
    // Clear canvas
    renderCtx.fillStyle = '#000';
    renderCtx.fillRect(0, 0, renderWidth, renderHeight);
    presentFrame();
    updateDebugOverlay();
}

// OPTIMIZED: DDA ray casting algorithm
function castRay(rayDirX, rayDirY) {
    const dirX = rayDirX;
    const dirY = rayDirY;

    let mapX = Math.floor(playerX);
    let mapY = Math.floor(playerY);

    const deltaDistX = Math.abs(1 / dirX);
    const deltaDistY = Math.abs(1 / dirY);

    let stepX, stepY;
    let sideDistX, sideDistY;

    if (dirX < 0) {
        stepX = -1;
        sideDistX = (playerX - mapX) * deltaDistX;
    } else {
        stepX = 1;
        sideDistX = (mapX + 1.0 - playerX) * deltaDistX;
    }

    if (dirY < 0) {
        stepY = -1;
        sideDistY = (playerY - mapY) * deltaDistY;
    } else {
        stepY = 1;
        sideDistY = (mapY + 1.0 - playerY) * deltaDistY;
    }

    let hitType = 0;
    let dist = 0;
    let hitX = playerX;
    let hitY = playerY;
    let hitSide = 0;

    // DDA algorithm - steps through grid cells
    for (let i = 0; i < MAX_DEPTH * 2; i++) {
        if (sideDistX < sideDistY) {
            sideDistX += deltaDistX;
            mapX += stepX;
            dist = sideDistX - deltaDistX;
            hitSide = 0;
        } else {
            sideDistY += deltaDistY;
            mapY += stepY;
            dist = sideDistY - deltaDistY;
            hitSide = 1;
        }

        if (mapX < 0 || mapX >= mazeWidth || mapY < 0 || mapY >= mazeHeight) {
            hitType = 0;
            hitX = playerX + dirX * dist;
            hitY = playerY + dirY * dist;
            break;
        }

        const cell = maze[mapY * mazeWidth + mapX];
        if (cell === 0) {
            hitType = 0;
            hitX = playerX + dirX * dist;
            hitY = playerY + dirY * dist;
            break;
        } else if (cell === 3) {
            hitType = 3;
            hitX = playerX + dirX * dist;
            hitY = playerY + dirY * dist;
            break;
        }
    }

    // Use perpendicular hit distance math to stabilize texture sampling at grazing angles.
    let perpDist = dist;
    if (hitSide === 0) {
        const safeDirX = Math.abs(dirX) < 1e-8 ? (dirX >= 0 ? 1e-8 : -1e-8) : dirX;
        perpDist = (mapX - playerX + (1 - stepX) / 2) / safeDirX;
    } else {
        const safeDirY = Math.abs(dirY) < 1e-8 ? (dirY >= 0 ? 1e-8 : -1e-8) : dirY;
        perpDist = (mapY - playerY + (1 - stepY) / 2) / safeDirY;
    }

    if (!Number.isFinite(perpDist) || perpDist <= 0) {
        perpDist = Math.max(dist, 0.0001);
    }

    hitX = playerX + dirX * perpDist;
    hitY = playerY + dirY * perpDist;

    let wallX = hitSide === 0 ? hitY : hitX;
    wallX -= Math.floor(wallX + 1e-7);
    if (wallX < 0) wallX += 1;
    if (wallX >= 1) wallX -= 1;

    return {
        dist: Math.max(perpDist, 0.0001),
        hitType,
        hitX,
        hitY,
        hitSide,
        wallX,
        hitMapX: mapX,
        hitMapY: mapY,
        dirX,
        dirY
    };
}

function renderWallSlice(result, x, y, stripWidth, wallHeight, fog, distanceShadow) {
    const fogBlend = Math.min(1, fog * FOG_BLEND_STRENGTH);
    const normalX = result.hitSide === 0 ? (result.dirX > 0 ? -1 : 1) : 0;
    const normalY = result.hitSide === 1 ? (result.dirY > 0 ? -1 : 1) : 0;
    const directionalLight = Math.max(0, (normalX * WALL_LIGHT_DIR_X) + (normalY * WALL_LIGHT_DIR_Y));
    const faceShadow = FACE_SHADOW_STRENGTH
        + (result.hitSide === 1 ? SIDE_SHADOW_STRENGTH : 0)
        + ((1 - directionalLight) * DIRECTIONAL_FACE_SHADOW_STRENGTH);
    const combinedShadow = Math.min(0.96, 1 - ((1 - faceShadow) * (1 - distanceShadow)));
    const gammaShadow = 1 - Math.pow(1 - combinedShadow, 1 / GAMMA);

    if (wallTexturesReady && result.hitType === 0) {
        const wallTexture = getTextureForCell(result.hitMapX, result.hitMapY);
        if (wallTexture) {

            const localWallX = result.wallX;
            let texX = Math.floor(localWallX * wallTexture.width);

            if (result.hitSide === 0 && result.dirX > 0) {
                texX = wallTexture.width - texX - 1;
            } else if (result.hitSide === 1 && result.dirY < 0) {
                texX = wallTexture.width - texX - 1;
            }

            texX = Math.max(0, Math.min(wallTexture.width - 1, texX));

            renderCtx.drawImage(
                wallTexture,
                texX,
                0,
                1,
                wallTexture.height,
                x,
                y,
                stripWidth,
                wallHeight
            );

            if (FOG_IS_BLACK) {
                const darkenAlpha = 1 - ((1 - gammaShadow) * (1 - fogBlend));
                if (darkenAlpha > 0) {
                    renderCtx.fillStyle = `rgba(0, 0, 0, ${darkenAlpha})`;
                    renderCtx.fillRect(x, y, stripWidth, wallHeight);
                }
            } else {
                if (gammaShadow > 0) {
                    renderCtx.fillStyle = `rgba(0, 0, 0, ${gammaShadow})`;
                    renderCtx.fillRect(x, y, stripWidth, wallHeight);
                }

                if (fogBlend > 0) {
                    renderCtx.fillStyle = `rgba(${FOG_COLOR.r}, ${FOG_COLOR.g}, ${FOG_COLOR.b}, ${fogBlend})`;
                    renderCtx.fillRect(x, y, stripWidth, wallHeight);
                }
            }
            return;
        }
    }

    let r = 200, g = 200, b = 200;
    if (result.hitType === 3) {
        r = 0; g = 255; b = 0;
    } else if (result.hitType === 4) {
        r = 0; g = 100; b = 255;
    }

    const lightness = Math.pow(Math.max(0.12, 1 - combinedShadow), 1 / GAMMA);
    r = Math.floor(r * lightness);
    g = Math.floor(g * lightness);
    b = Math.floor(b * lightness);

    r = Math.floor(r * (1 - fogBlend) + FOG_COLOR.r * fogBlend);
    g = Math.floor(g * (1 - fogBlend) + FOG_COLOR.g * fogBlend);
    b = Math.floor(b * (1 - fogBlend) + FOG_COLOR.b * fogBlend);

    renderCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    renderCtx.fillRect(x, y, stripWidth, wallHeight);
}

function render(collectRayData = false) {
    const centerY = renderHeight / 2 + playerPitch * renderHeight / 2;

    updateBackgroundGradients(centerY);

    renderCtx.fillStyle = cachedSkyGradient;
    renderCtx.fillRect(0, 0, renderWidth, centerY);

    renderCtx.fillStyle = cachedGroundGradient;
    renderCtx.fillRect(0, centerY, renderWidth, renderHeight - centerY);

    // Cast rays
    const rayData = collectRayData ? [] : null;
    const dirX = Math.cos(playerAngle);
    const dirY = Math.sin(playerAngle);
    const planeScale = Math.tan(FOV / 2);
    const planeX = -dirY * planeScale;
    const planeY = dirX * planeScale;
    const planeDist = (renderWidth / 2) / Math.tan(FOV / 2);
    for (let i = 0; i < NUM_RAYS; i++) {
        const cameraX = (2 * (i + 0.5)) / NUM_RAYS - 1;
        const rayDirX = dirX + planeX * cameraX;
        const rayDirY = dirY + planeY * cameraX;
        const result = castRay(rayDirX, rayDirY);
        if (rayData) rayData.push(result);

        const wallHeight = planeDist / result.dist;
        const distanceRatio = clamp(result.dist / MAX_DEPTH, 0, 1);
        const distanceRatioSq = distanceRatio * distanceRatio;
        const distanceShadow = Math.min(0.9, distanceRatioSq * (0.7 + distanceRatio * 0.3) * DISTANCE_SHADOW_STRENGTH);
        const fog = distanceRatio;
        const x = Math.floor((i * renderWidth) / NUM_RAYS);
        const nextX = Math.floor(((i + 1) * renderWidth) / NUM_RAYS);
        const stripWidth = Math.max(1, nextX - x);
        const y = Math.round(centerY - wallHeight / 2);
        renderWallSlice(result, x, y, stripWidth, Math.ceil(wallHeight), fog, distanceShadow);
    }

    return rayData;
}

function renderMinimap(rayData) {
    const visibleRange = Math.min(minimapRange, MAX_DEPTH);
    const scale = MINIMAP_SIZE / (visibleRange * 2);
    const centerX = MINIMAP_SIZE / 2;
    const centerY = MINIMAP_SIZE / 2;
    const clipRadius = MINIMAP_SIZE / 2 - 2;
    const visibleRangeSq = visibleRange * visibleRange;

    minimapCtx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    minimapCtx.save();
    minimapCtx.beginPath();
    minimapCtx.arc(centerX, centerY, clipRadius, 0, Math.PI * 2);
    minimapCtx.clip();
    minimapCtx.fillStyle = '#000';
    minimapCtx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    // Calculate visible bounds
    const minX = Math.floor(playerX - visibleRange);
    const maxX = Math.ceil(playerX + visibleRange);
    const minY = Math.floor(playerY - visibleRange);
    const maxY = Math.ceil(playerY + visibleRange);

    // Draw maze cells in view
    for (let my = minY; my <= maxY; my++) {
        for (let mx = minX; mx <= maxX; mx++) {
            if (mx < 0 || mx >= mazeWidth || my < 0 || my >= mazeHeight) continue;

            const offsetX = (mx + 0.5) - playerX;
            const offsetY = (my + 0.5) - playerY;
            if ((offsetX * offsetX) + (offsetY * offsetY) > visibleRangeSq) continue;
            
            const cell = maze[my * mazeWidth + mx];
            const screenX = centerX + (mx - playerX) * scale;
            const screenY = centerY + (my - playerY) * scale;

            if (cell === 0) {
                minimapCtx.fillStyle = '#666';
            } else if (cell === 3) {
                minimapCtx.fillStyle = '#0f0';
            } else {
                minimapCtx.fillStyle = '#222';
            }
            minimapCtx.fillRect(screenX, screenY, scale + 1, scale + 1);
        }
    }

    // Draw rays
    minimapCtx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
    minimapCtx.lineWidth = 0.5;
    for (let i = 0; i < rayData.length; i += 5) { // Draw every 5th ray for performance
        const ray = rayData[i];
        let endX = ray.hitX;
        let endY = ray.hitY;
        const rayDeltaX = endX - playerX;
        const rayDeltaY = endY - playerY;
        const rayLengthSq = (rayDeltaX * rayDeltaX) + (rayDeltaY * rayDeltaY);
        if (rayLengthSq > visibleRangeSq && rayLengthSq > 0) {
            const clipScale = visibleRange / Math.sqrt(rayLengthSq);
            endX = playerX + rayDeltaX * clipScale;
            endY = playerY + rayDeltaY * clipScale;
        }

        minimapCtx.beginPath();
        minimapCtx.moveTo(centerX, centerY);
        const hitScreenX = centerX + (endX - playerX) * scale;
        const hitScreenY = centerY + (endY - playerY) * scale;
        minimapCtx.lineTo(hitScreenX, hitScreenY);
        minimapCtx.stroke();
    }

    minimapCtx.restore();

    minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    minimapCtx.lineWidth = 1;
    minimapCtx.beginPath();
    minimapCtx.arc(centerX, centerY, clipRadius, 0, Math.PI * 2);
    minimapCtx.stroke();

    // Draw player direction indicator
    minimapCtx.strokeStyle = '#fff';
    minimapCtx.lineWidth = 2;
    minimapCtx.beginPath();
    minimapCtx.moveTo(centerX, centerY);
    minimapCtx.lineTo(
        centerX + Math.cos(playerAngle) * scale * 1.5,
        centerY + Math.sin(playerAngle) * scale * 1.5
    );
    minimapCtx.stroke();

    minimapCtx.fillStyle = '#f00';
    minimapCtx.beginPath();
    minimapCtx.arc(centerX, centerY, 3, 0, Math.PI * 2);
    minimapCtx.fill();
}

function update(deltaSeconds = BASE_FRAME_SECONDS) {
    if (won) return;

    const frameScale = Math.max(0, deltaSeconds / BASE_FRAME_SECONDS);

    let moveX = 0;
    let moveY = 0;
    let movedOrRotated = false;

    let speed = MOVE_SPEED * frameScale;
    if (running) speed *= 2;

    if (keys['w'] || keys['arrowup']) {
        moveX += Math.cos(playerAngle) * speed;
        moveY += Math.sin(playerAngle) * speed;
    }
    if (keys['s'] || keys['arrowdown']) {
        moveX -= Math.cos(playerAngle) * speed;
        moveY -= Math.sin(playerAngle) * speed;
    }
    if (keys['a']) {
        moveX += Math.cos(playerAngle - Math.PI / 2) * speed;
        moveY += Math.sin(playerAngle - Math.PI / 2) * speed;
    }
    if (keys['d']) {
        moveX += Math.cos(playerAngle + Math.PI / 2) * speed;
        moveY += Math.sin(playerAngle + Math.PI / 2) * speed;
    }

    // Normalize movement to prevent diagonal speed boost
    const moveMagnitude = Math.hypot(moveX, moveY);
    if (moveMagnitude > speed) {
        moveX = (moveX / moveMagnitude) * speed;
        moveY = (moveY / moveMagnitude) * speed;
    }

    const rotationStep = ROT_SPEED * frameScale;

    if (keys['ArrowLeft']) {
        playerAngle -= rotationStep;
        movedOrRotated = true;
    }
    if (keys['ArrowRight']) {
        playerAngle += rotationStep;
        movedOrRotated = true;
    }

    const buffer = 0.2;
    const newX = playerX + moveX;
    const newY = playerY + moveY;

    let actuallyMoved = false;

    if (!isWall(newX + (moveX > 0 ? buffer : -buffer), playerY)) {
        playerX = newX;
        actuallyMoved = true;
    }
    if (!isWall(playerX, newY + (moveY > 0 ? buffer : -buffer))) {
        playerY = newY;
        actuallyMoved = true;
    }

    movedOrRotated = movedOrRotated || actuallyMoved;

    checkGoal();

    needsRender = needsRender || movedOrRotated;
}

function gameLoop(timestamp) {
    let deltaSeconds = BASE_FRAME_SECONDS;

    if (typeof timestamp === 'number') {
        if (lastFrameTimestamp !== null) {
            deltaSeconds = (timestamp - lastFrameTimestamp) / 1000;
            if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
                deltaSeconds = BASE_FRAME_SECONDS;
            }
            deltaSeconds = Math.min(deltaSeconds, MAX_DELTA_SECONDS);
        }
        lastFrameTimestamp = timestamp;

        frameTimeMs = deltaSeconds * 1000;
        fpsFrameCounter += 1;
        const fpsWindowMs = timestamp - fpsSampleStart;
        if (fpsWindowMs >= 250) {
            fpsValue = (fpsFrameCounter * 1000) / fpsWindowMs;
            fpsFrameCounter = 0;
            fpsSampleStart = timestamp;
        }
    }

    update(deltaSeconds);
    if (needsRender) {
        const rayData = render(minimapVisible);
        if (minimapVisible && rayData) renderMinimap(rayData);
        presentFrame();
        needsRender = false;
    }
    updateDebugOverlay();
    gameLoopId = requestAnimationFrame(gameLoop);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        toggleDebugOverlay();
        return;
    }

    if (e.key === '+' || e.key === '=') {
        minimapRange = Math.max(MINIMAP_MIN_RANGE, minimapRange - MINIMAP_RANGE_STEP);
        needsRender = true;
        e.preventDefault();
        return;
    }

    if (e.key === '\\') {
        minimapRange = Math.min(MAX_DEPTH, minimapRange + MINIMAP_RANGE_STEP);
        needsRender = true;
        e.preventDefault();
        return;
    }

    keys[e.key.toLowerCase()] = true;
    keys[e.key] = true;

    if (e.key === "x") running = true;

    if (e.key.toLowerCase() === 'm') {
        minimapVisible = !minimapVisible;
        minimap.style.display = minimapVisible ? 'block' : 'none';
        needsRender = true;
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        return;
    }

    keys[e.key.toLowerCase()] = false;
    keys[e.key] = false;

    if (e.key === "x") running = false;
});

canvas.addEventListener('click', () => {
    const hasLoadedMaze = maze && mazeWidth > 0 && mazeHeight > 0;
    // Only request pointer lock on desktop (non-touch) devices
    if (!isTouchDevice() && hasLoadedMaze && !won && !mouseLocked && !pointerLockPending) {
        pointerLockPending = true;
        canvas.requestPointerLock().catch(() => {
            pointerLockPending = false;
        });
    }
});

document.addEventListener('mousemove', (e) => {
    // Only process mouse movement if pointer lock is active AND we're not exiting
    if (mouseLocked && document.pointerLockElement === canvas && !ignoreMouseMovement) {
        playerAngle += e.movementX * 0.002;
        playerPitch -= e.movementY * 0.004;
        if (playerPitch > MAX_PITCH) playerPitch = MAX_PITCH;
        if (playerPitch < -MAX_PITCH) playerPitch = -MAX_PITCH;
        needsRender = true;
    }
});

// Clear all keys when window loses focus or pointer lock is lost
window.addEventListener('blur', () => {
    Object.keys(keys).forEach(key => keys[key] = false);
    running = false;
});

document.addEventListener('pointerlockchange', () => {
    const isLocked = document.pointerLockElement === canvas;
    pointerLockPending = false;  // Clear the pending flag
    
    if (isLocked) {
        // Entering pointer lock
        mouseLocked = true;
        ignoreMouseMovement = false;
    } else {
        // Exiting pointer lock - set flag to prevent stray mouse movements
        if (mouseLocked) {
            ignoreMouseMovement = true;
            setTimeout(() => { ignoreMouseMovement = false; }, 50);
        }
        mouseLocked = false;
        Object.keys(keys).forEach(key => keys[key] = false);
        running = false;
    }
});

// Handle ESC key to exit pointer lock cleanly
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mouseLocked && !pointerLockPending) {
        ignoreMouseMovement = true;  // Prevent final mouse movement from being processed
        pointerLockPending = true;  // Prevent new lock requests during exit
        document.exitPointerLock();
        mouseLocked = false;
        Object.keys(keys).forEach(key => keys[key] = false);
        running = false;
        // Reset the flags after a longer delay to catch all stray mouse events
        setTimeout(() => { 
            ignoreMouseMovement = false;
            pointerLockPending = false;
        }, 50);
        e.preventDefault();
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        Object.keys(keys).forEach(key => keys[key] = false);
        running = false;
    }
});

// ---- JOYSTICK VIRTUAL KEY PRESS HELPER ----
function setKey(key, state) {
    keys[key] = state;
    keys[key.toLowerCase()] = state;   // Your system uses both
}

const joysticks = {
    left: {
        hitbox: document.querySelector(".left_joystick_hitbox"),
        base: document.querySelector(".left_joystick"),
        pointer: document.querySelector(".left_joystick_pointer"),
        active: false,
        startX: 0,
        startY: 0,
        id: null
    },
    right: {
        hitbox: document.querySelector(".right_joystick_hitbox"),
        base: document.querySelector(".right_joystick"),
        pointer: document.querySelector(".right_joystick_pointer"),
        active: false,
        startX: 0,
        startY: 0,
        id: null
    }
};

function startJoystick(j, e) {
    const t = e.changedTouches[0];
    j.id = t.identifier;

    j.startX = t.pageX;
    j.startY = t.pageY;

    j.base.style.display = "block";
    j.base.style.left = (j.startX - 75) + "px";
    j.base.style.top = (j.startY - 75) + "px";
    j.base.classList.add("active");

    j.pointer.style.left = "50%";
    j.pointer.style.top = "50%";

    j.active = true;
    
    e.preventDefault();
}

function updateJoystick(j, e) {
    if (!j.active) return;

    const t = [...e.changedTouches].find(x => x.identifier === j.id);
    if (!t) return;

    const dx = t.pageX - j.startX;
    const dy = t.pageY - j.startY;

    const radius = 75;
    const dist = Math.min(Math.hypot(dx, dy), radius);

    const angle = Math.atan2(dy, dx);

    const px = Math.cos(angle) * dist;
    const py = Math.sin(angle) * dist;

    j.pointer.style.left = (50 + (px / radius) * 50) + "%";
    j.pointer.style.top = (50 + (py / radius) * 50) + "%";

    const dead = 15;

    // --- left joystick → WSAD ---
    if (j === joysticks.left) {
        setKey("w", py < -dead);
        setKey("s", py >  dead);
        setKey("a", px < -dead);
        setKey("d", px >  dead);
    }

    // --- right joystick → Arrow keys ---
    if (j === joysticks.right) {
        setKey("ArrowUp",    py < -dead);
        setKey("ArrowDown",  py >  dead);
        setKey("ArrowLeft",  px < -dead);
        setKey("ArrowRight", px >  dead);
    }
}

function endJoystick(j, e) {
    const t = [...e.changedTouches].find(x => x.identifier === j.id);
    if (!t) return;

    j.active = false;
    j.id = null;
    j.base.classList.remove("active");
    j.base.style.display = "none";
    j.pointer.style.left = "50%";
    j.pointer.style.top = "50%";

    // Clear all keys for that joystick
    if (j === joysticks.left) {
        setKey("w", false);
        setKey("a", false);
        setKey("s", false);
        setKey("d", false);
    }

    if (j === joysticks.right) {
        setKey("ArrowUp", false);
        setKey("ArrowDown", false);
        setKey("ArrowLeft", false);
        setKey("ArrowRight", false);
    }
}

// ---- EVENTS ----
Object.values(joysticks).forEach(j => {
    j.hitbox.addEventListener("touchstart", e => {
        e.preventDefault();
        startJoystick(j, e);
    }, { passive: false });
    
    j.hitbox.addEventListener("touchmove", e => {
        e.preventDefault();
        updateJoystick(j, e);
    }, { passive: false });
    
    j.hitbox.addEventListener("touchend", e => {
        e.preventDefault();
        endJoystick(j, e);
    }, { passive: false });
});

// Disable joystick on desktop (non-touch devices)
const isTouchDevice = () => {
    return (('ontouchstart' in window) ||
            (navigator.maxTouchPoints > 0) ||
            (navigator.msMaxTouchPoints > 0));
};

if (!isTouchDevice()) {
    document.querySelector('.joystick_container').style.display = 'none';
}

// ---- AUTO-UPDATE SERVICE WORKER ----
/*
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(registration => {
        // Check for updates immediately on page load
        registration.update();
        
        // Listen for service worker updates
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // New service worker ready, show update message
                    console.log('New version available! Updating...');
                    // Automatically refresh the page
                    window.location.reload();
                }
            });
        });
    });
}
*/