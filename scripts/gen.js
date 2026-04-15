const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: false });
const generateBtn = document.getElementById('generateBtn');
const downloadPngBtn = document.getElementById('downloadPngBtn');
const downloadMazeBtn = document.getElementById('downloadMazeBtn');
const findMaxSizeBtn = document.getElementById('findMaxSizeBtn');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const statusText = document.getElementById('statusText');
const info = document.getElementById('info');
const algoSelect = document.getElementById('algorithm');
const algoInfo = document.getElementById('algoInfo');

const B = 0, W = 1, R = 2, G = 3;
let maze = null;
let mazeWidth = 0;
let mazeHeight = 0;

const algorithmDescriptions = {
    recursive: '<strong>Recursive Backtracker:</strong> Creates long, winding passages with few dead ends. Very popular and efficient.',
    compactDFS: '<strong>Compact/Dense DFS:</strong> A variant of Recursive Backtracker that allows paths to hug each other, creating a more compact maze with fewer wide-open areas.',
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
    const safeTotal = total > 0 ? total : 1;
    const percent = Math.min(100, Math.max(0, (current / safeTotal) * 100));
    progressFill.style.width = percent + '%';
    statusText.textContent = status;
}

function progressStep(total) {
    return Math.max(1, Math.floor(total / 100));
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

/**
 * Generates a "Compact" or "Dense" maze.
 * Unlike standard Recursive Backtrackers that use a grid-gap, 
 * this uses Adjacency Constraints to allow paths to hug each other.
 */
async function compactDFS(maze, startX, startY, width, height) {
    const stack = [[startX, startY]];
    maze[startY * width + startX] = W;
    
    let carvedCells = 1;
    let lastUpdate = 0;
    const totalPotentialArea = width * height;

    while (stack.length > 0) {
        // Current 'head' of the path
        const [x, y] = stack[stack.length - 1];
        
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        // Randomize direction order (Fisher-Yates Shuffle)
        for (let i = directions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [directions[i], directions[j]] = [directions[j], directions[i]];
        }

        let carved = false;
        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;

            // 1. Boundary Check: Ensure we aren't carving the outer-most border
            if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1) {
                
                // 2. Occupancy Check: Only consider uncarved space (Black/Wall)
                if (maze[ny * width + nx] === B) {
                    
                    // 3. Adjacency Constraint: 
                    // To ensure a single path with no loops, the target cell 
                    // must have exactly ONE neighbor that is already a path.
                    if (countPathNeighbors(maze, nx, ny, width) === 1) {
                        
                        // 4. Corner-Touch Constraint (Optional):
                        // Prevents paths from touching even at diagonals for a cleaner look.
                        if (countDiagonalNeighbors(maze, nx, ny, width) <= 1) {
                            maze[ny * width + nx] = W;
                            stack.push([nx, ny]);
                            carvedCells++;
                            carved = true;
                            break;
                        }
                    }
                }
            }
        }

        // If no directions were valid, backtrack
        if (!carved) {
            stack.pop();
        }

        // Async UI throttle
        if (carvedCells - lastUpdate > 100) {
            updateProgress(carvedCells, totalPotentialArea / 2);
            lastUpdate = carvedCells;
            await new Promise(r => setTimeout(r, 0));
        }
    }
}
function countPathNeighbors(maze, x, y, width) {
    let count = 0;
    if (maze[y * width + (x + 1)] === W) count++;
    if (maze[y * width + (x - 1)] === W) count++;
    if (maze[(y + 1) * width + x] === W) count++;
    if (maze[(y - 1) * width + x] === W) count++;
    return count;
}
function countDiagonalNeighbors(maze, x, y, width) {
    let count = 0;
    if (maze[(y - 1) * width + (x - 1)] === W) count++;
    if (maze[(y - 1) * width + (x + 1)] === W) count++;
    if (maze[(y + 1) * width + (x - 1)] === W) count++;
    if (maze[(y + 1) * width + (x + 1)] === W) count++;
    return count;
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
    let lastUpdate = 0;
    const updateEvery = progressStep(walls.length);
    for (const [x1, y1, x2, y2] of walls) {
        const cell1 = y1 * width + x1;
        const cell2 = y2 * width + x2;

        if (union(cell1, cell2)) {
            maze[y1 * width + x1 + (x2 - x1) / 2 + (y2 - y1) / 2 * width] = W;
        }

        processed++;
        if (processed - lastUpdate >= updateEvery) {
            updateProgress(processed, walls.length, `Connecting regions: ${processed.toLocaleString()}`);
            lastUpdate = processed;
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
    const updateEvery = progressStep(totalCells);
    let lastUpdate = 0;

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

        if (inMaze.size - lastUpdate >= updateEvery) {
            updateProgress(inMaze.size, totalCells, `Random walks: ${inMaze.size.toLocaleString()} cells`);
            lastUpdate = inMaze.size;
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
    let lastUpdate = 0;
    const updateEvery = progressStep(totalCells);

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

        if (visitedCells - lastUpdate >= updateEvery) {
            updateProgress(visitedCells, totalCells, `Random walk: ${visitedCells.toLocaleString()} cells`);
            lastUpdate = visitedCells;
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
}

// Binary Tree Algorithm
async function binaryTree(maze, width, height) {
    const totalCells = Math.floor(width / 2) * Math.floor(height / 2);
    let carved = 0;
    let lastUpdate = 0;
    const updateEvery = progressStep(totalCells);

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
            if (carved - lastUpdate >= updateEvery) {
                updateProgress(carved, totalCells, `Carving binary tree: ${carved.toLocaleString()}`);
                lastUpdate = carved;
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
    }
}

// Sidewinder Algorithm
async function sidewinder(maze, width, height) {
    const totalRows = Math.floor((height - 1) / 2);
    let processedRows = 0;

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
        processedRows++;
        updateProgress(processedRows, totalRows, `Carving row ${processedRows}/${totalRows}`);
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
    let lastUpdate = 0;
    const updateEvery = progressStep(totalCells);

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
        if (visited - lastUpdate >= updateEvery) {
            updateProgress(visited, totalCells, `Hunting: ${visited.toLocaleString()} cells`);
            lastUpdate = visited;
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
    let lastUpdate = 0;
    const updateEvery = progressStep(total);

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

        if (visited - lastUpdate >= updateEvery) {
            updateProgress(visited, total, `Growing: ${visited.toLocaleString()} cells`);
            lastUpdate = visited;
            await new Promise(r => setTimeout(r, 0));
        }
    }
}

async function divisionMaze(maze, width, height, onProgress) {
    maze.fill(W);

    // Add borders
    for (let x = 0; x < width; x++) {
        maze[x] = B;
        maze[(height - 1) * width + x] = B;
    }
    for (let y = 0; y < height; y++) {
        maze[y * width] = B;
        maze[y * width + (width - 1)] = B;
    }

    const total = width * height;
    let counter = 0;
    const yieldEvery = 200; // adjust for speed vs responsiveness

    function addWall(x1, y1, x2, y2, horizontal) {
        if (horizontal) {
            const wallY = y1 + 2 * Math.floor(Math.random() * Math.floor((y2 - y1 - 1) / 2)) + 1;
            const gapX = x1 + 2 * Math.floor(Math.random() * Math.floor((x2 - x1) / 2));
            for (let x = x1; x < x2; x++) {
                if (x !== gapX) maze[wallY * width + x] = B;
                counter++;
            }
            return wallY;
        } else {
            const wallX = x1 + 2 * Math.floor(Math.random() * Math.floor((x2 - x1 - 1) / 2)) + 1;
            const gapY = y1 + 2 * Math.floor(Math.random() * Math.floor((y2 - y1) / 2));
            for (let y = y1; y < y2; y++) {
                if (y !== gapY) maze[y * width + wallX] = B;
                counter++;
            }
            return wallX;
        }
    }

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

        // yield occasionally
        if (counter % yieldEvery === 0) {
            if (onProgress) onProgress(Math.min(counter / total, 1));
            await new Promise(r => setTimeout(r, 0));
        }
    }

    await divide(1, 1, width - 1, height - 1);
    if (onProgress) onProgress(1);
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

// Test system capacity with smart exponential search then binary refinement
function findMaxSystemSize() {
    console.log('🔍 Starting system capacity detection...');
    let maxWorking = 101;  // Start with odd number
    let minFailing = null;
    const increments = [500, 250, 100, 50, 25, 10, 1];
    let incrementIndex = 0;
    
    // Phase 1: Smart exponential search with custom increments (always testing odd sizes)
    console.log('Phase 1: Finding working and failing bounds...');
    while (incrementIndex < increments.length) {
        const increment = increments[incrementIndex];
        let testSize = maxWorking + increment;
        if (testSize % 2 === 0) testSize++;  // Ensure odd
        const cellsNeeded = testSize * testSize;
        
        try {
            new Uint8Array(cellsNeeded);
            maxWorking = testSize;
            console.log(`✓ ${testSize}×${testSize} works (${cellsNeeded.toLocaleString()} cells)`);
        } catch (e) {
            minFailing = testSize;
            console.log(`✗ ${testSize}×${testSize} failed (${cellsNeeded.toLocaleString()} cells)`);
            incrementIndex++;
        }
    }
    
    // Phase 2: Binary search between working and failing for precision (always odd)
    if (minFailing !== null) {
        console.log(`\nPhase 2: Binary search between ${maxWorking}×${maxWorking} and ${minFailing}×${minFailing}...`);
        let low = maxWorking;
        let high = minFailing;
        
        while (high - low > 2) {
            let mid = Math.floor((low + high) / 2);
            if (mid % 2 === 0) mid++;  // Ensure odd
            const cellsNeeded = mid * mid;
            
            try {
                new Uint8Array(cellsNeeded);
                maxWorking = mid;
                low = mid;
                console.log(`✓ ${mid}×${mid} works`);
            } catch (e) {
                minFailing = mid;
                high = mid;
                console.log(`✗ ${mid}×${mid} failed`);
            }
        }
    }
    
    console.log(`\n✅ RESULT: Maximum recommended maze size is ${maxWorking}×${maxWorking}`);
    console.log(`   (${(maxWorking * maxWorking).toLocaleString()} total cells)`);
    console.log(`   Next failure would be at: ${minFailing}×${minFailing}`);
    return maxWorking;
}

generateBtn.addEventListener('click', async () => {
    const startTime = performance.now();
    generateBtn.disabled = true;
    downloadPngBtn.disabled = true;
    downloadMazeBtn.disabled = true;
    progressContainer.style.display = 'block';
    info.style.display = 'none';

    let width = parseInt(document.getElementById('width').value);
    let height = parseInt(document.getElementById('height').value);

    // Input validation
    if (isNaN(width) || isNaN(height) || width < 3 || height < 3) {
        alert('Width and height must be numbers greater than or equal to 3');
        generateBtn.disabled = false;
        downloadPngBtn.disabled = false;
        downloadMazeBtn.disabled = false;
        progressContainer.style.display = 'none';
        return;
    }

    // Make dimensions odd first
    if (width % 2 === 0) width++;
    if (height % 2 === 0) height++;

    // Store dimensions globally for download handlers
    mazeWidth = width;
    mazeHeight = height;

    updateProgress(0, 100, 'Initializing maze...');
    
    try {
        maze = new Uint8Array(width * height).fill(B);
    } catch (error) {
        alert(`Insufficient memory to allocate ${width.toLocaleString()}x${height.toLocaleString()} maze. Try a smaller size.`);
        generateBtn.disabled = false;
        downloadPngBtn.disabled = false;
        downloadMazeBtn.disabled = false;
        progressContainer.style.display = 'none';
        return;
    }

    const algorithm = algoSelect.value;
    let startX = 1 + Math.floor(Math.random() * Math.floor(width / 2)) * 2;
    let startY = 1 + Math.floor(Math.random() * Math.floor(height / 2)) * 2;

    switch (algorithm) {
        case 'recursive':
            await recursiveBacktracker(maze, startX, startY, width, height);
            break;
        case 'compactDFS':
            await compactDFS(maze, startX, startY, width, height);
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
            await divisionMaze(maze, width, height, (progress) => {
                const percent = Math.floor(progress * 100);
                updateProgress(percent, 100, `Dividing space: ${percent}%`);
            });
            startX = 1;
            startY = 1;
            break;
    }

    maze[startY * width + startX] = R;
    const [goalX, goalY] = await findFarthest(maze, [startX, startY], width, height);
    maze[goalY * width + goalX] = G;

    updateProgress(100, 100, 'Rendering maze...');
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Check if maze is too large to display on canvas
    const canvasLimit = 10000;  // More conservative limit
    if (width > canvasLimit || height > canvasLimit) {
        // Canvas too large - show message
        canvas.width = 800;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#0f0';
        ctx.font = 'bold 24px monospace';
        ctx.fillText(`Generated: ${width}×${height}`, 20, 60);
        ctx.font = '16px monospace';
        ctx.fillText(`(Too large to display on screen)`, 20, 90);
        ctx.fillStyle = '#0a0';
        ctx.fillText(`✓ Use "Download PNG" or "Download .maze" to save`, 20, 140);
    } else {
        renderMaze(maze, width, height);
    }

    const endTime = performance.now();
    const genTime = ((endTime - startTime) / 1000).toFixed(2);

    document.getElementById('startPos').textContent = `(${startX}, ${startY})`;
    document.getElementById('goalPos').textContent = `(${goalX}, ${goalY})`;
    document.getElementById('algoName').textContent = algoSelect.options[algoSelect.selectedIndex].text;
    document.getElementById('genTime').textContent = `${genTime}s`;

    const { solvable, pathLength } = checkSolvability(maze, [startX, startY], [goalX, goalY], width, height);
    
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
    downloadPngBtn.disabled = false;
    downloadMazeBtn.disabled = false;
});

downloadPngBtn.addEventListener('click', () => {
    if (!maze) {
        alert('Generate a maze first!');
        return;
    }
    const algorithm = algoSelect.value;
    const filename = `${algorithm}-${mazeWidth}-${mazeHeight}.png`;
    
    try {
        // For very large mazes, use direct PNG generation instead of canvas
        if (mazeWidth > 8000 || mazeHeight > 8000) {
            downloadPngDirect(maze, mazeWidth, mazeHeight, filename);
        } else {
            // For smaller mazes, use canvas
            canvas.toBlob((blob) => {
                if (!blob) {
                    alert('Failed to generate PNG. Try a smaller size.');
                    return;
                }
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                link.click();
                URL.revokeObjectURL(url);
            }, 'image/png');
        }
    } catch (error) {
        alert('Error downloading PNG: ' + error.message);
    }
});

// Generate PNG directly from maze data for large mazes (no canvas)
function downloadPngDirect(maze, width, height, filename) {
    try {
        // Simple PNG header and data generation
        const cellColors = {
            0: [0, 0, 0],           // wall = black
            1: [255, 255, 255],     // path = white
            2: [255, 0, 0],         // start = red
            3: [0, 255, 0]          // goal = green
        };

        // Create image data (RGBA)
        const pixelData = new Uint8Array(width * height * 4);
        let pixelIndex = 0;
        
        for (let i = 0; i < maze.length; i++) {
            const cell = maze[i];
            const color = cellColors[cell] || [0, 0, 0];
            pixelData[pixelIndex++] = color[0];  // R
            pixelData[pixelIndex++] = color[1];  // G
            pixelData[pixelIndex++] = color[2];  // B
            pixelData[pixelIndex++] = 255;       // A
        }

        // Create canvas off-screen for PNG conversion
        const offCanvas = document.createElement('canvas');
        offCanvas.width = width;
        offCanvas.height = height;
        const ctx = offCanvas.getContext('2d');
        
        const imgData = ctx.createImageData(width, height);
        imgData.data.set(pixelData);
        ctx.putImageData(imgData, 0, 0);

        // Convert to blob and download
        offCanvas.toBlob((blob) => {
            if (!blob) {
                alert('Failed to generate PNG');
                return;
            }
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
        }, 'image/png');
    } catch (error) {
        alert('Error creating PNG: ' + error.message);
    }
}

downloadMazeBtn.addEventListener('click', () => {
    if (!maze) {
        alert('Generate a maze first!');
        return;
    }
    const algorithm = algoSelect.value;
    const filename = `${algorithm}-${mazeWidth}-${mazeHeight}.maze`;
    
    try {
        const link = document.createElement('a');
        link.download = filename;
        link.href = createMazeFormat(maze, mazeWidth, mazeHeight);
        link.click();
    } catch (error) {
        alert('Error creating .maze file: ' + error.message);
        console.error('Maze format error:', error);
    }
});

findMaxSizeBtn.addEventListener('click', () => {
    const maxSize = findMaxSystemSize();
    const width = document.getElementById('width');
    const height = document.getElementById('height');
    
    // findMaxSystemSize() already ensures odd numbers
    width.value = maxSize;
    height.value = maxSize;
    
    alert(`Max system size detected: ${maxSize}×${maxSize}`);
});

// ---- .MAZE FORMAT FUNCTIONS ----
const MAZE_MAGIC_BYTES = [0x4d, 0x41, 0x5a, 0x45]; // "MAZE"
const MAZE_FORMAT_VERSION = 2;

function encodeVarint(value) {
    if (!Number.isInteger(value) || value < 0) {
        throw new Error('Varint value must be a non-negative integer');
    }

    const bytes = [];
    let remaining = value;

    do {
        let byte = remaining & 0x7F;
        remaining = Math.floor(remaining / 128);
        if (remaining > 0) {
            byte |= 0x80;
        }
        bytes.push(byte);
    } while (remaining > 0);

    return bytes;
}

function createMazeFormat(cells, width, height) {
    const totalCells = width * height;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 3 || height < 3) {
        throw new Error('Maze dimensions must be integers >= 3');
    }
    if (cells.length !== totalCells) {
        throw new Error('Maze cell array length does not match dimensions');
    }

    let startIndex = -1;
    let goalIndex = -1;
    const mazeBytes = new Uint8Array(Math.ceil(totalCells / 8));

    for (let i = 0; i < totalCells; i++) {
        const cell = cells[i] & 0b11;

        if (cell === R) {
            if (startIndex !== -1) {
                throw new Error('.maze V2 supports exactly one start cell');
            }
            startIndex = i;
        } else if (cell === G) {
            if (goalIndex !== -1) {
                throw new Error('.maze V2 supports exactly one goal cell');
            }
            goalIndex = i;
        }

        const isWalkable = cell !== B;
        if (isWalkable) {
            mazeBytes[i >> 3] |= 1 << (7 - (i & 7));
        }
    }

    if (startIndex === -1 || goalIndex === -1) {
        throw new Error('.maze V2 requires both a start and goal cell');
    }

    const widthBytes = encodeVarint(width);
    const heightBytes = encodeVarint(height);
    const startBytes = encodeVarint(startIndex);
    const goalBytes = encodeVarint(goalIndex);

    const headerSize = MAZE_MAGIC_BYTES.length + 1 + widthBytes.length + heightBytes.length + startBytes.length + goalBytes.length;
    const result = new Uint8Array(headerSize + mazeBytes.length);
    let offset = 0;

    result.set(MAZE_MAGIC_BYTES, offset);
    offset += MAZE_MAGIC_BYTES.length;
    result[offset++] = MAZE_FORMAT_VERSION;
    result.set(widthBytes, offset);
    offset += widthBytes.length;
    result.set(heightBytes, offset);
    offset += heightBytes.length;
    result.set(startBytes, offset);
    offset += startBytes.length;
    result.set(goalBytes, offset);
    offset += goalBytes.length;
    result.set(mazeBytes, offset);

    // Convert to blob URL for download
    const blob = new Blob([result], { type: 'application/octet-stream' });
    return URL.createObjectURL(blob);
}