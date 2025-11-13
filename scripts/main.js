const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const info = document.getElementById('info');
const upload = document.getElementById('upload');
const urlBtn = document.getElementById('urlBtn');
const urlInput = document.getElementById('urlInput');
const base64Btn = document.getElementById('base64Btn');
const base64Input = document.getElementById('base64Input');

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

let playerPitch = 0;
const MAX_PITCH = Math.PI / 2 * 0.99;

let FOV = Math.PI / 3;
const NUM_RAYS = 500;
const MAX_DEPTH = 20;
const MOVE_SPEED = 0.025;
const ROT_SPEED = 0.025;

const keys = {};
let mouseLocked = false;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function hideControls() {
    document.getElementById('controls').style.display = 'none';
    info.style.display = 'none';
    //show mobile controls if mobile
    if (window.matchMedia("(pointer: coarse)").matches) {
        document.getElementById('mobile-controls').style.display = 'flex';
    }
    canvas.requestPointerLock();
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

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            loadMaze(img);
            hideControls();
        };
        img.onerror = () => showError('Failed to load image file');
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

// URL upload
urlBtn.addEventListener('click', () => {
    urlInput.style.display = urlInput.style.display === 'none' ? 'block' : 'none';
    base64Input.style.display = 'none';
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

// Base64 upload
base64Btn.addEventListener('click', () => {
    base64Input.style.display = base64Input.style.display === 'none' ? 'block' : 'none';
    urlInput.style.display = 'none';
    if (base64Input.style.display === 'block') {
        base64Input.focus();
    }
});

base64Input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        let base64 = base64Input.value.trim();
        if (!base64) {
            showError('Please paste a base64 string');
            return;
        }

        // Add data URL prefix if not present
        if (!base64.startsWith('data:')) {
            base64 = 'data:image/png;base64,' + base64;
        }

        const img = new Image();
        img.onload = () => {
            loadMaze(img);
            hideControls();
        };
        img.onerror = () => showError('Invalid base64 image data');
        img.src = base64;
    }
});

function loadMaze(img) {
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
    info.innerHTML = 'Find the green goal! WASD/Arrows to move, Mouse to look. Hold x to run.';
    requestAnimationFrame(gameLoop);
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
        info.innerHTML = '<span class="win">🎉 YOU WON! 🎉</span>';
    }
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
            break;
        }

        const cell = maze[mapY * mazeWidth + mapX];
        if (cell === 0) {
            hitType = 0;
            break;
        } else if (cell === 3) {
            hitType = 3;
            break;
        }
    }

    return { dist, hitType };
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
    for (let i = 0; i < NUM_RAYS; i++) {
        const rayAngle = playerAngle - FOV / 2 + (FOV * i) / NUM_RAYS;
        const { dist, hitType } = castRay(rayAngle);

        const correctedDist = dist * Math.cos(rayAngle - playerAngle);
        const planeDist = (canvas.width / 2) / Math.tan(FOV / 2);
        const wallHeight = planeDist / correctedDist;

        // Fog using smoother exponential falloff
        const fog = 1 - Math.exp(-correctedDist / (MAX_DEPTH * 0.5));

        let r = 200, g = 200, b = 200;
        if (hitType === 3) {
            r = 0; g = 255; b = 0;
        } else if (hitType === 4) {
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
}

function applyIGNDithering(ctx, canvas) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const w = canvas.width;
    const h = canvas.height;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;

            const dot = x * 0.06711056 + y * 0.00583715;
            let noise = 52.9829189 * (dot - Math.floor(dot));
            noise = (noise - Math.floor(noise)) * 255 - 127.5;
            const n = noise * 0.015;

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
        render();
        applyIGNDithering(ctx, canvas);
    }
    requestAnimationFrame(gameLoop);
}

document.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    keys[e.key] = true;

    if (e.key === "x") running = true;
});

document.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
    keys[e.key] = false;

    if (e.key === "x") running = false;
});

canvas.addEventListener('click', () => {
    if (!mouseLocked) canvas.requestPointerLock();
});

document.addEventListener('mousemove', (e) => {
    if (mouseLocked) {
        playerAngle += e.movementX * 0.002;
        playerPitch -= e.movementY * 0.004;
        if (playerPitch > MAX_PITCH) playerPitch = MAX_PITCH;
        if (playerPitch < -MAX_PITCH) playerPitch = -MAX_PITCH;
        needsRender = true;
    }
});

document.querySelectorAll('#mobile-controls .btn').forEach(btn => {
    const key = btn.dataset.key;
    if (!key) return;

    const start = e => {
        e.preventDefault();
        keys[key.toLowerCase()] = true;
        keys[key] = true;

        if (key.toLowerCase() === "x") running = true;
    };
    const end = e => {
        e.preventDefault();
        keys[key.toLowerCase()] = false;
        keys[key] = false;

        if (key.toLowerCase() === "x") running = false;
    };

    btn.addEventListener('touchstart', start);
    btn.addEventListener('touchend', end);
    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseup', end);
});

// Clear all keys when window loses focus or pointer lock is lost
window.addEventListener('blur', () => {
    Object.keys(keys).forEach(key => keys[key] = false);
    running = false;
});

document.addEventListener('pointerlockchange', () => {
    mouseLocked = document.pointerLockElement === canvas;
    if (!mouseLocked) {
        Object.keys(keys).forEach(key => keys[key] = false);
        running = false;
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        Object.keys(keys).forEach(key => keys[key] = false);
        running = false;
    }
});