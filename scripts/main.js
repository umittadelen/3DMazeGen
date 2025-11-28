const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let minimap = document.getElementById('minimap');
let minimapCtx = null;
const info = document.getElementById('info');
const upload = document.getElementById('upload');
const urlBtn = document.getElementById('urlBtn');
const urlInput = document.getElementById('urlInput');

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
const MINIMAP_RANGE = 5; // How many maze cells to show around player

// Create minimap if it doesn't exist
if (!minimap) {
    minimap = document.createElement('canvas');
    minimap.id = 'minimap';
    minimap.style.position = 'fixed';
    minimap.style.top = '20px';
    minimap.style.right = '20px';
    minimap.style.border = '2px solid #fff';
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

let playerPitch = 0;
const MAX_PITCH = Math.PI / 2 * 0.99;

let FOV = Math.PI / 3;
const NUM_RAYS = 500;
const MAX_DEPTH = 20;
const MOVE_SPEED = 0.025;
const ROT_SPEED = 0.025;

const keys = {};
let mouseLocked = false;
let ignoreMouseMovement = false;
let pointerLockPending = false;  // Flag to prevent simultaneous lock/unlock requests

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    minimap.width = MINIMAP_SIZE;
    minimap.height = MINIMAP_SIZE;
}

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
        reader.onload = (event) => {
            try {
                const arrayBuffer = event.target.result;
                
                // Validate that we got data
                if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                    showError('.maze file is empty');
                    return;
                }
                
                loadMazeFormat(arrayBuffer);
                hideControls();
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
    urlInput.style.display = urlInput.style.display === 'none' ? 'block' : 'none';
    if (urlInput.style.display === 'block') {
        urlInput.focus();
    }
});

function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

window.addEventListener('DOMContentLoaded', () => {
    const url = getQueryParam('url');
    if (url) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            loadMaze(img);
            hideControls();
        };
        img.onerror = () => showError('Failed to load image from URL. Check CORS or URL validity.');
        img.src = url;
    }
});

urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const url = urlInput.value.trim();
        if (!url) {
            showError('Please enter a URL');
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
});

function loadMaze(img) {
    // Stop previous game loop
    if (gameLoopId) {
        cancelAnimationFrame(gameLoopId);
        gameLoopId = null;
    }

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

    won = false;
    playerAngle = 0;
    playerPitch = 0;
    needsRender = true;
    info.innerHTML = 'Find the green goal! WASD/Arrows to move, Mouse to look. Hold x to run.';
    gameLoopId = requestAnimationFrame(gameLoop);
}

function loadMazeFormat(arrayBuffer) {
    // Stop previous game loop
    if (gameLoopId) {
        cancelAnimationFrame(gameLoopId);
        gameLoopId = null;
    }

    // Validate buffer size
    if (arrayBuffer.byteLength < 4) {
        showError('.maze file is corrupted (too small)');
        return;
    }

    const view = new DataView(arrayBuffer);
    mazeWidth = view.getUint16(0, true);
    mazeHeight = view.getUint16(2, true);
    
    // Validate dimensions
    if (mazeWidth < 3 || mazeHeight < 3 || mazeWidth > 50000 || mazeHeight > 50000) {
        showError('.maze file has invalid dimensions: ' + mazeWidth + 'x' + mazeHeight);
        return;
    }
    
    const expectedSize = 4 + Math.ceil(mazeWidth * mazeHeight * 2 / 8);
    if (arrayBuffer.byteLength < expectedSize) {
        showError('.maze file is truncated or corrupted');
        return;
    }
    
    const data = new Uint8Array(arrayBuffer, 4);
    
    maze = new Uint8Array(mazeWidth * mazeHeight);
    
    let foundStart = false;
    let foundGoal = false;
    let bitIndex = 0;
    
    // Unpack cells from .maze format (2 bits per cell)
    for (let i = 0; i < mazeWidth * mazeHeight; i++) {
        const byteIndex = bitIndex >> 3;
        if (byteIndex >= data.length) {
            showError('.maze file data is corrupted');
            return;
        }
        
        const offset = 6 - (bitIndex % 8);
        const cell = (data[byteIndex] >> offset) & 0b11;
        bitIndex += 2;
        
        maze[i] = cell;
        
        if (cell === 2) { // Start (red)
            playerX = (i % mazeWidth) + 0.5;
            playerY = Math.floor(i / mazeWidth) + 0.5;
            foundStart = true;
        } else if (cell === 3) { // Goal (green)
            goalX = (i % mazeWidth) + 0.5;
            goalY = Math.floor(i / mazeWidth) + 0.5;
            foundGoal = true;
        }
    }
    
    if (!foundStart || !foundGoal) {
        showError('Invalid .maze file: missing start or goal');
        return;
    }
    
    won = false;
    playerAngle = 0;
    playerPitch = 0;
    needsRender = true;
    info.innerHTML = 'Find the green goal! WASD/Arrows to move, Mouse to look. Hold x to run.';
    gameLoopId = requestAnimationFrame(gameLoop);
}

function isWall(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= mazeWidth || iy < 0 || iy >= mazeHeight) return true;
    return maze[iy * mazeWidth + ix] === 0;
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
    
    // Reset UI - show controls again
    document.getElementById('controls').style.display = 'flex';
    document.querySelector('.joystick_container').classList.remove('active');
    info.innerHTML = 'Load a maze image to start. Use WASD or Arrow keys to move, Mouse to look around.';
    info.style.display = 'block';
    
    // Clear canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// OPTIMIZED: DDA ray casting algorithm
function castRay(angle) {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

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

    // DDA algorithm - steps through grid cells
    for (let i = 0; i < MAX_DEPTH * 2; i++) {
        if (sideDistX < sideDistY) {
            sideDistX += deltaDistX;
            mapX += stepX;
            dist = sideDistX - deltaDistX;
        } else {
            sideDistY += deltaDistY;
            mapY += stepY;
            dist = sideDistY - deltaDistY;
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

    return { dist, hitType, hitX, hitY };
}

function render() {
    const skyColor = { r: 26, g: 26, b: 46 };  // #1a1a2e
    const groundColor = { r: 15, g: 52, b: 96 }; // #0f3460

    const centerY = canvas.height / 2 + playerPitch * canvas.height / 2;

    // Sky
    ctx.fillStyle = `rgb(${skyColor.r}, ${skyColor.g}, ${skyColor.b})`;
    ctx.fillRect(0, 0, canvas.width, centerY);

    // Ground
    ctx.fillStyle = `rgb(${groundColor.r}, ${groundColor.g}, ${groundColor.b})`;
    ctx.fillRect(0, centerY, canvas.width, canvas.height - centerY);

    // Cast rays
    const rayData = [];
    for (let i = 0; i < NUM_RAYS; i++) {
        const rayAngle = playerAngle - FOV / 2 + (FOV * i) / NUM_RAYS;
        const result = castRay(rayAngle);
        rayData.push(result);

        const correctedDist = result.dist * Math.cos(rayAngle - playerAngle);
        const planeDist = (canvas.width / 2) / Math.tan(FOV / 2);
        const wallHeight = planeDist / correctedDist;

        // Fog using smoother exponential falloff
        const fog = 1 - Math.exp(-correctedDist / (MAX_DEPTH * 0.5));

        let r = 200, g = 200, b = 200;
        if (result.hitType === 3) {
            r = 0; g = 255; b = 0;
        } else if (result.hitType === 4) {
            r = 0; g = 100; b = 255;
        }

        // Blend toward background color (same as sky/ground midpoint)
        const fogColor = { r: 12, g: 25, b: 45 }; // blend target
        r = Math.floor(r * (1 - fog) + fogColor.r * fog);
        g = Math.floor(g * (1 - fog) + fogColor.g * fog);
        b = Math.floor(b * (1 - fog) + fogColor.b * fog);

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        const x = (i * canvas.width) / NUM_RAYS;
        const y = centerY - wallHeight / 2;
        ctx.fillRect(x, y, canvas.width / NUM_RAYS + 1, wallHeight);
    }

    return rayData;
}

function renderMinimap(rayData) {
    minimapCtx.fillStyle = '#000';
    minimapCtx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    const scale = MINIMAP_SIZE / (MINIMAP_RANGE * 2);
    const centerX = MINIMAP_SIZE / 2;
    const centerY = MINIMAP_SIZE / 2;

    // Calculate visible bounds
    const minX = Math.floor(playerX - MINIMAP_RANGE);
    const maxX = Math.ceil(playerX + MINIMAP_RANGE);
    const minY = Math.floor(playerY - MINIMAP_RANGE);
    const maxY = Math.ceil(playerY + MINIMAP_RANGE);

    // Draw maze cells in view
    for (let my = minY; my <= maxY; my++) {
        for (let mx = minX; mx <= maxX; mx++) {
            if (mx < 0 || mx >= mazeWidth || my < 0 || my >= mazeHeight) continue;
            
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
        minimapCtx.beginPath();
        minimapCtx.moveTo(centerX, centerY);
        const hitScreenX = centerX + (ray.hitX - playerX) * scale;
        const hitScreenY = centerY + (ray.hitY - playerY) * scale;
        minimapCtx.lineTo(hitScreenX, hitScreenY);
        minimapCtx.stroke();
    }

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

    // Draw player
    minimapCtx.fillStyle = '#f00';
    minimapCtx.beginPath();
    minimapCtx.arc(centerX, centerY, 3, 0, Math.PI * 2);
    minimapCtx.fill();
}

function applyIGNDithering(ctx, canvas) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const w = canvas.width;
    const h = canvas.height;

    // Controls the look
    const coherence = 0.02; // spatial coherence (lower = smoother)
    const amplitude = 0.8;  // strength of dithering
    const chaos = 0.3;      // white noise twist (0–1)

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;

            // --- coherent base noise
            const dot = x * 0.06711056 + y * 0.00583715;
            let base = 52.9829189 * (dot - Math.floor(dot));
            base = (base - Math.floor(base)) * 2 - 1; // -1..1
            const coherent = base * amplitude;

            // --- chaotic flicker
            const white = (Math.random() * 2 - 1) * amplitude * chaos;

            // combined noise, scaled to avoid visible pixel patterning
            const n = (coherent + white) * 255 * coherence;

            data[i] = Math.max(0, Math.min(255, data[i] + n));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

let needsRender = true;

function update() {
    if (won) return;

    let moveX = 0;
    let moveY = 0;
    let movedOrRotated = false;

    let speed = MOVE_SPEED;
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

    if (keys['ArrowLeft']) {
        playerAngle -= ROT_SPEED;
        movedOrRotated = true;
    }
    if (keys['ArrowRight']) {
        playerAngle += ROT_SPEED;
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

    needsRender = movedOrRotated;
}

function gameLoop() {
    update();
    if (needsRender) {
        const rayData = render();
        applyIGNDithering(ctx, canvas);
        if (minimapVisible) renderMinimap(rayData);
        needsRender = false;
    }
    gameLoopId = requestAnimationFrame(gameLoop);
}

document.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    keys[e.key] = true;

    if (e.key === "x") running = true;

    if (e.key.toLowerCase() === 'm') {
        minimapVisible = !minimapVisible;
        minimap.style.display = minimapVisible ? 'block' : 'none';
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
    keys[e.key] = false;

    if (e.key === "x") running = false;
});

canvas.addEventListener('click', () => {
    // Only request pointer lock on desktop (non-touch) devices
    if (!isTouchDevice() && !mouseLocked && !pointerLockPending) {
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