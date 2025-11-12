const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: false });
const generateBtn = document.getElementById('generateBtn');
const downloadBtn = document.getElementById('downloadBtn');
const copyBase64Btn = document.getElementById('copyBase64Btn');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const statusText = document.getElementById('statusText');
const info = document.getElementById('info');
const algoSelect = document.getElementById('algorithm');
const algoInfo = document.getElementById('algoInfo');

const B = 0, W = 1, R = 2, G = 3;
let maze = null;

const algorithmDescriptions = {
    recursive: '<strong>Recursive Backtracker:</strong> Creates long, winding passages with few dead ends. Very popular and efficient.',
    division: '<strong>Recursive Division:</strong> Creates mazes by recursively dividing the area with walls and adding passages. Results in a grid-like structure with many right angles.',
    prim: '<strong>Prim\'s Algorithm:</strong> Grows the maze from a single point, creating shorter passages with more branching.',
    kruskal: '<strong>Kruskal\'s Algorithm:</strong> Creates mazes by connecting separate trees, resulting in many short passages.',
    wilson: '<strong>Wilson\'s Algorithm:</strong> Creates unbiased mazes using loop-erased random walks. Slower but more uniform.',
    aldous: '<strong>Aldous-Broder:</strong> Random walk algorithm that creates unbiased mazes. Can be slow for large mazes.',
    binary: '<strong>Binary Tree:</strong> Very fast, creates mazes with a diagonal bias. Simple but distinctive pattern.',

    sidewinder: '<strong>Sidewinder:</strong> Carves paths row by row, creating long horizontal corridors with occasional vertical connections. Quick and simple.',
    huntandkill: '<strong>Hunt-and-Kill:</strong> Walks randomly until trapped, then "hunts" for a new starting point. Produces varied, organic mazes.',
    'growingtree-last': '<strong>Growing Tree (Last):</strong> Similar to Recursive Backtracker, but allows for different cell selection strategies for varied maze styles.',
    'growingtree-random': '<strong>Growing Tree (Random):</strong> A variant that selects the next cell to carve randomly from the current front.',
    'growingtree-mix': '<strong>Growing Tree (Mix):</strong> Combines elements of both last and random strategies for a more balanced approach.',
};

algoSelect.addEventListener('change', () => {
    algoInfo.innerHTML = algorithmDescriptions[algoSelect.value];
});

function updateProgress(current, total, status) {
    const percent = Math.floor((current / total) * 100);
    progressFill.style.width = percent + '%';
    progressFill.textContent = percent + '%';
    statusText.textContent = status;
}

// Recursive Backtracker (DFS)
async function recursiveBacktracker(maze, startX, startY, width, height) {
    const stack = [[startX, startY]];
    maze[startY * width + startX] = W;
    const totalCells = Math.floor(width / 2) * Math.floor(height / 2);
    let carvedCells = 1;
    let lastUpdate = 0;

    while (stack.length > 0) {
        const [x, y] = stack[stack.length - 1];
        const directions = [[0, 2], [0, -2], [2, 0], [-2, 0]];

        for (let i = directions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [directions[i], directions[j]] = [directions[j], directions[i]];
        }

        let carved = false;
        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 1 && nx < width - 1 && ny >= 1 && ny < height - 1 && maze[ny * width + nx] === B) {
                maze[(y + dy / 2) * width + (x + dx / 2)] = W;
                maze[ny * width + nx] = W;
                stack.push([nx, ny]);
                carvedCells++;
                carved = true;
                break;
            }
        }

        if (!carved) stack.pop();

        if (carvedCells - lastUpdate > totalCells / 100) {
            updateProgress(carvedCells, totalCells, `Carving maze: ${carvedCells.toLocaleString()} / ${totalCells.toLocaleString()} cells`);
            lastUpdate = carvedCells;
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
}

// Prim's Algorithm
async function primsAlgorithm(maze, startX, startY, width, height) {
    const walls = [];
    maze[startY * width + startX] = W;

    const addWalls = (x, y) => {
        const dirs = [[0, 2], [0, -2], [2, 0], [-2, 0]];
        for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 1 && nx < width - 1 && ny >= 1 && ny < height - 1) {
                walls.push([x + dx / 2, y + dy / 2, nx, ny]);
            }
        }
    };

    addWalls(startX, startY);
    const totalCells = Math.floor(width / 2) * Math.floor(height / 2);
    let carvedCells = 1;
    let lastUpdate = 0;

    while (walls.length > 0) {
        const idx = Math.floor(Math.random() * walls.length);
        const [wx, wy, nx, ny] = walls[idx];
        walls.splice(idx, 1);

        if (maze[ny * width + nx] === B) {
            maze[wy * width + wx] = W;
            maze[ny * width + nx] = W;
            addWalls(nx, ny);
            carvedCells++;

            if (carvedCells - lastUpdate > totalCells / 100) {
                updateProgress(carvedCells, totalCells, `Growing maze: ${carvedCells.toLocaleString()} cells`);
                lastUpdate = carvedCells;
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
    }
}

// Kruskal's Algorithm
async function kruskalsAlgorithm(maze, width, height) {
    const sets = new Map();
    const walls = [];

    for (let y = 1; y < height - 1; y += 2) {
        for (let x = 1; x < width - 1; x += 2) {
            maze[y * width + x] = W;
            sets.set(y * width + x, y * width + x);

            if (x < width - 2) walls.push([x, y, x + 2, y]);
            if (y < height - 2) walls.push([x, y, x, y + 2]);
        }
    }

    for (let i = walls.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [walls[i], walls[j]] = [walls[j], walls[i]];
    }

    const find = (cell) => {
        if (sets.get(cell) !== cell) {
            sets.set(cell, find(sets.get(cell)));
        }
        return sets.get(cell);
    };

    const union = (a, b) => {
        const rootA = find(a);
        const rootB = find(b);
        if (rootA !== rootB) {
            sets.set(rootA, rootB);
            return true;
        }
        return false;
    };

    let processed = 0;
    for (const [x1, y1, x2, y2] of walls) {
        const cell1 = y1 * width + x1;
        const cell2 = y2 * width + x2;

        if (union(cell1, cell2)) {
            maze[y1 * width + x1 + (x2 - x1) / 2 + (y2 - y1) / 2 * width] = W;
        }

        processed++;
        if (processed % 1000 === 0) {
            updateProgress(processed, walls.length, `Connecting regions: ${processed.toLocaleString()}`);
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
}

// Wilson's Algorithm
async function wilsonsAlgorithm(maze, width, height) {
    const cells = [];
    for (let y = 1; y < height - 1; y += 2) {
        for (let x = 1; x < width - 1; x += 2) {
            cells.push([x, y]);
        }
    }

    const inMaze = new Set();
    const start = cells[Math.floor(Math.random() * cells.length)];
    maze[start[1] * width + start[0]] = W;
    inMaze.add(start[1] * width + start[0]);

    const totalCells = cells.length;

    while (inMaze.size < totalCells) {
        let current = cells[Math.floor(Math.random() * cells.length)];
        while (inMaze.has(current[1] * width + current[0])) {
            current = cells[Math.floor(Math.random() * cells.length)];
        }

        const path = [current];
        const pathSet = new Set([current[1] * width + current[0]]);

        while (!inMaze.has(current[1] * width + current[0])) {
            const dirs = [[0, 2], [0, -2], [2, 0], [-2, 0]];
            const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
            const nx = current[0] + dx;
            const ny = current[1] + dy;

            if (nx >= 1 && nx < width - 1 && ny >= 1 && ny < height - 1) {
                current = [nx, ny];
                const idx = path.findIndex(([x, y]) => x === nx && y === ny);
                if (idx !== -1) {
                    path.splice(idx + 1);
                } else {
                    path.push(current);
                }
            }
        }

        for (let i = 0; i < path.length; i++) {
            const [x, y] = path[i];
            maze[y * width + x] = W;
            inMaze.add(y * width + x);

            if (i > 0) {
                const [px, py] = path[i - 1];
                maze[(y + py) / 2 * width + (x + px) / 2] = W;
            }
        }

        if (inMaze.size % 100 === 0) {
            updateProgress(inMaze.size, totalCells, `Random walks: ${inMaze.size.toLocaleString()} cells`);
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
}

// Aldous-Broder Algorithm
async function aldousBroder(maze, startX, startY, width, height) {
    let x = startX;
    let y = startY;
    maze[y * width + x] = W;

    const totalCells = Math.floor(width / 2) * Math.floor(height / 2);
    let visitedCells = 1;
    let steps = 0;

    while (visitedCells < totalCells) {
        const dirs = [[0, 2], [0, -2], [2, 0], [-2, 0]];
        const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
        const nx = x + dx;
        const ny = y + dy;

        if (nx >= 1 && nx < width - 1 && ny >= 1 && ny < height - 1) {
            if (maze[ny * width + nx] === B) {
                maze[(y + dy / 2) * width + (x + dx / 2)] = W;
                maze[ny * width + nx] = W;
                visitedCells++;
            }
            x = nx;
            y = ny;
        }

        steps++;
        if (steps % 10000 === 0) {
            updateProgress(visitedCells, totalCells, `Random walk: ${visitedCells.toLocaleString()} cells`);
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
}

// Binary Tree Algorithm
async function binaryTree(maze, width, height) {
    const totalCells = Math.floor(width / 2) * Math.floor(height / 2);
    let carved = 0;

    for (let y = 1; y < height - 1; y += 2) {
        for (let x = 1; x < width - 1; x += 2) {
            maze[y * width + x] = W;

            const dirs = [];
            if (y > 1) dirs.push([0, -2]);
            if (x < width - 2) dirs.push([2, 0]);

            if (dirs.length > 0) {
                const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
                maze[(y + dy / 2) * width + (x + dx / 2)] = W;
            }

            carved++;
            if (carved % 1000 === 0) {
                updateProgress(carved, totalCells, `Carving binary tree: ${carved.toLocaleString()}`);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
    }
}

// Sidewinder Algorithm
async function sidewinder(maze, width, height) {
    for (let y = 1; y < height - 1; y += 2) {
        let run = [];
        for (let x = 1; x < width - 1; x += 2) {
            maze[y * width + x] = W;
            run.push([x, y]);

            const atEasternBoundary = x >= width - 2;
            const atNorthernBoundary = y <= 1;
            const shouldCloseOut = atEasternBoundary || (!atNorthernBoundary && Math.random() < 0.3);

            if (shouldCloseOut) {
                const [rx, ry] = run[Math.floor(Math.random() * run.length)];
                if (ry > 1) maze[(ry - 1) * width + rx] = W; // carve upward
                run = [];
            } else {
                maze[y * width + x + 1] = W; // carve east
            }
        }
        updateProgress(y, height, `Carving row ${y}/${height}`);
        await new Promise(r => setTimeout(r, 0));
    }
}

// Hunt-and-Kill Algorithm
async function huntAndKill(maze, width, height) {
    let x = Math.floor(Math.random() * Math.floor(width / 2)) * 2 + 1;
    let y = Math.floor(Math.random() * Math.floor(height / 2)) * 2 + 1;
    maze[y * width + x] = W;

    const dirs = [[0, 2], [0, -2], [2, 0], [-2, 0]];
    const totalCells = Math.floor(width / 2) * Math.floor(height / 2);
    let visited = 1;

    while (visited < totalCells) {
        // random walk
        const shuffled = dirs.sort(() => Math.random() - 0.5);
        let moved = false;
        for (const [dx, dy] of shuffled) {
            const nx = x + dx, ny = y + dy;
            if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1 && maze[ny * width + nx] === B) {
                maze[(y + dy / 2) * width + (x + dx / 2)] = W;
                maze[ny * width + nx] = W;
                x = nx; y = ny;
                visited++;
                moved = true;
                break;
            }
        }
        if (!moved) {
            // Hunt mode
            let found = false;
            for (let hy = 1; hy < height - 1 && !found; hy += 2) {
                for (let hx = 1; hx < width - 1 && !found; hx += 2) {
                    if (maze[hy * width + hx] === B) {
                        const neighbors = dirs.filter(([dx, dy]) =>
                            maze[(hy + dy) * width + (hx + dx)] === W
                        );
                        if (neighbors.length > 0) {
                            const [dx, dy] = neighbors[Math.floor(Math.random() * neighbors.length)];
                            maze[(hy + dy / 2) * width + (hx + dx / 2)] = W;
                            maze[hy * width + hx] = W;
                            x = hx; y = hy;
                            visited++;
                            found = true;
                        }
                    }
                }
            }
        }
        if (visited % 100 === 0) {
            updateProgress(visited, totalCells, `Hunting: ${visited.toLocaleString()} cells`);
            await new Promise(r => setTimeout(r, 0));
        }
    }
}

// Growing Tree Algorithm
async function growingTree(maze, startX, startY, width, height, selection = 'last') {
    const cells = [[startX, startY]];
    maze[startY * width + startX] = W;
    const dirs = [[0, 2], [0, -2], [2, 0], [-2, 0]];
    const total = Math.floor(width / 2) * Math.floor(height / 2);
    let visited = 1;

    while (cells.length > 0) {
        let index;
        if (selection === 'random') index = Math.floor(Math.random() * cells.length);
        else if (selection === 'mix') index = Math.random() < 0.5 ? cells.length - 1 : Math.floor(Math.random() * cells.length);
        else index = cells.length - 1;

        const [x, y] = cells[index];
        const shuffled = dirs.sort(() => Math.random() - 0.5);
        let carved = false;

        for (const [dx, dy] of shuffled) {
            const nx = x + dx, ny = y + dy;
            if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1 && maze[ny * width + nx] === B) {
                maze[(y + dy / 2) * width + (x + dx / 2)] = W;
                maze[ny * width + nx] = W;
                cells.push([nx, ny]);
                visited++;
                carved = true;
                break;
            }
        }
        if (!carved) cells.splice(index, 1);

        if (visited % 100 === 0) {
            updateProgress(visited, total, `Growing: ${visited.toLocaleString()} cells`);
            await new Promise(r => setTimeout(r, 0));
        }
    }
}

async function divisionMaze(maze, width, height) {
    // Fill everything with passages
    maze.fill(W);

    // Add black borders
    for (let x = 0; x < width; x++) {
        maze[0 * width + x] = B;           // top
        maze[(height - 1) * width + x] = B; // bottom
    }
    for (let y = 0; y < height; y++) {
        maze[y * width + 0] = B;           // left
        maze[y * width + (width - 1)] = B; // right
    }

    const addWall = (x1, y1, x2, y2, horizontal) => {
        if (horizontal) {
            const wallY = y1 + 2 * Math.floor(Math.random() * Math.floor((y2 - y1 - 1) / 2)) + 1;
            const gapX = x1 + 2 * Math.floor(Math.random() * Math.floor((x2 - x1)/2));
            for (let x = x1; x < x2; x++) {
                if (x !== gapX) maze[wallY * width + x] = B;
            }
            return wallY;
        } else {
            const wallX = x1 + 2 * Math.floor(Math.random() * Math.floor((x2 - x1 - 1) / 2)) + 1;
            const gapY = y1 + 2 * Math.floor(Math.random() * Math.floor((y2 - y1)/2));
            for (let y = y1; y < y2; y++) {
                if (y !== gapY) maze[y * width + wallX] = B;
            }
            return wallX;
        }
    };

    async function divide(x1, y1, x2, y2) {
        const w = x2 - x1;
        const h = y2 - y1;

        if (w < 3 || h < 3) return;

        const horizontal = (w < h);

        if (horizontal) {
            const wallY = addWall(x1, y1, x2, y2, true);
            await divide(x1, y1, x2, wallY);
            await divide(x1, wallY + 1, x2, y2);
        } else {
            const wallX = addWall(x1, y1, x2, y2, false);
            await divide(x1, y1, wallX, y2);
            await divide(wallX + 1, y1, x2, y2);
        }

        await new Promise(r => setTimeout(r, 0));
    }

    await divide(1, 1, width-1, height-1); // inner rectangle only
}

async function findFarthest(maze, start, width, height) {
    const visited = new Uint8Array(width * height);
    const queue = [[start, 0]];
    visited[start[1] * width + start[0]] = 1;
    let farthest = start;
    let maxDist = 0;

    while (queue.length > 0) {
        const [[x, y], dist] = queue.shift();

        if (dist > maxDist) {
            maxDist = dist;
            farthest = [x, y];
        }

        const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 1 && nx < width - 1 && ny >= 1 && ny < height - 1 &&
                maze[ny * width + nx] === W && !visited[ny * width + nx]) {
                visited[ny * width + nx] = 1;
                queue.push([[nx, ny], dist + 1]);
            }
        }
    }

    return farthest;
}

function checkSolvability(maze, start, goal, width, height) {
    const visited = new Uint8Array(width * height);
    const queue = [[start, 0]];
    const [startX, startY] = start;
    const [goalX, goalY] = goal;
    visited[startY * width + startX] = 1;

    while (queue.length > 0) {
        const [[x, y], dist] = queue.shift();

        if (x === goalX && y === goalY) {
            return { solvable: true, pathLength: dist };
        }

        const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height &&
                (maze[ny * width + nx] === W || maze[ny * width + nx] === G) &&
                !visited[ny * width + nx]) {
                visited[ny * width + nx] = 1;
                queue.push([[nx, ny], dist + 1]);
            }
        }
    }

    return { solvable: false, pathLength: 0 };
}

function renderMaze(maze, width, height) {
    canvas.width = width;
    canvas.height = height;

    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    for (let i = 0; i < maze.length; i++) {
        const idx = i * 4;
        switch (maze[i]) {
            case B: data[idx] = 0; data[idx + 1] = 0; data[idx + 2] = 0; break;
            case W: data[idx] = 255; data[idx + 1] = 255; data[idx + 2] = 255; break;
            case R: data[idx] = 255; data[idx + 1] = 0; data[idx + 2] = 0; break;
            case G: data[idx] = 0; data[idx + 1] = 255; data[idx + 2] = 0; break;
        }
        data[idx + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
}

generateBtn.addEventListener('click', async () => {
    const startTime = performance.now();
    generateBtn.disabled = true;
    downloadBtn.disabled = true;
    copyBase64Btn.disabled = true;
    progressContainer.style.display = 'block';
    info.style.display = 'none';

    let width = parseInt(document.getElementById('width').value);
    let height = parseInt(document.getElementById('height').value);

    if (width % 2 === 0) width++;
    if (height % 2 === 0) height++;

    updateProgress(0, 100, 'Initializing maze...');
    maze = new Uint8Array(width * height).fill(B);

    const algorithm = algoSelect.value;
    let startX = 1 + Math.floor(Math.random() * Math.floor(width / 2)) * 2;
    let startY = 1 + Math.floor(Math.random() * Math.floor(height / 2)) * 2;

    switch (algorithm) {
        case 'recursive':
            await recursiveBacktracker(maze, startX, startY, width, height);
            break;
        case 'prim':
            await primsAlgorithm(maze, startX, startY, width, height);
            break;
        case 'kruskal':
            await kruskalsAlgorithm(maze, width, height);
            startX = 1;
            startY = 1;
            break;
        case 'wilson':
            await wilsonsAlgorithm(maze, width, height);
            startX = 1;
            startY = 1;
            break;
        case 'aldous':
            await aldousBroder(maze, startX, startY, width, height);
            break;
        case 'binary':
            await binaryTree(maze, width, height);
            startX = 1;
            startY = 1;
            break;
        case 'sidewinder':
            await sidewinder(maze, width, height);
            startX = 1;
            startY = 1;
            break;
        case 'huntandkill':
            await huntAndKill(maze, width, height);
            startX = 1;
            startY = 1;
            break;
        case 'growingtree-last':
            await growingTree(maze, startX, startY, width, height, 'last');
            break;
        case 'growingtree-random':
            await growingTree(maze, startX, startY, width, height, 'random');
            break;
        case 'growingtree-mix':
            await growingTree(maze, startX, startY, width, height, 'mix');
            break;
        case 'division':
            await divisionMaze(maze, width, height);
            startX = 1;
            startY = 1;
            break;
    }

    maze[startY * width + startX] = R;
    const [goalX, goalY] = await findFarthest(maze, [startX, startY], width, height);
    maze[goalY * width + goalX] = G;

    updateProgress(100, 100, 'Rendering maze...');
    await new Promise(resolve => setTimeout(resolve, 0));
    renderMaze(maze, width, height);

    // Check solvability
    const { solvable, pathLength } = checkSolvability(maze, [startX, startY], [goalX, goalY], width, height);

    const endTime = performance.now();
    const genTime = ((endTime - startTime) / 1000).toFixed(2);

    document.getElementById('startPos').textContent = `(${startX}, ${startY})`;
    document.getElementById('goalPos').textContent = `(${goalX}, ${goalY})`;
    document.getElementById('algoName').textContent = algoSelect.options[algoSelect.selectedIndex].text;
    document.getElementById('genTime').textContent = `${genTime}s`;

    const solvableSpan = document.getElementById('solvable');
    if (solvable) {
        solvableSpan.textContent = '✓ Yes';
        solvableSpan.style.color = '#44ff44';
    } else {
        solvableSpan.textContent = '✗ No';
        solvableSpan.style.color = '#ff4444';
    }

    document.getElementById('pathLength').textContent = solvable ? `${pathLength} steps` : 'N/A';

    info.style.display = 'block';

    progressContainer.style.display = 'none';
    generateBtn.disabled = false;
    downloadBtn.disabled = false;
    copyBase64Btn.disabled = false;
});

downloadBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'maze.png';
    link.href = canvas.toDataURL();
    link.click();
});

copyBase64Btn.addEventListener('click', async () => {
    try {
        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1];
        await navigator.clipboard.writeText(base64);

        const originalText = copyBase64Btn.textContent;
        copyBase64Btn.textContent = '✓ Copied!';
        copyBase64Btn.style.background = 'rgba(33, 150, 243, 0.8)';
        setTimeout(() => {
            copyBase64Btn.textContent = originalText;
            copyBase64Btn.style.background = 'rgba(70, 70, 70, 0.8)';
        }, 2000);
    } catch (err) {
        alert('Failed to copy to clipboard: ' + err.message);
    }
});