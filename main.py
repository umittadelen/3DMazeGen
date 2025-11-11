import random
import numpy as np
from PIL import Image
from collections import deque
from tqdm import tqdm  # for progress bar

# Maze settings
WIDTH, HEIGHT = 10000, 10000
CELL_SIZE = 1  # 1px per cell

# Make odd if needed
if WIDTH % 2 == 0: WIDTH += 1
if HEIGHT % 2 == 0: HEIGHT += 1

# Colors
B, W, R, G = 0, 1, 2, 3
COLOR_MAP = np.array([
    [0,0,0],       # B
    [255,255,255], # W
    [255,0,0],     # R
    [0,255,0]      # G
], dtype=np.uint8)

# Create empty maze
maze = np.full((HEIGHT, WIDTH), B, dtype=np.uint8)

# Iterative DFS with progress bar
def carve_maze_iterative(maze, start_x, start_y):
    stack = [(start_x, start_y)]
    maze[start_y, start_x] = W  # Mark start as path
    total_path_cells = ((WIDTH//2)*(HEIGHT//2))
    carved_cells = 1
    pbar = tqdm(total=total_path_cells, desc="Carving maze")

    while stack:
        x, y = stack[-1]
        directions = [(0,2),(0,-2),(2,0),(-2,0)]
        random.shuffle(directions)
        carved = False
        for dx, dy in directions:
            nx, ny = x + dx, y + dy
            if 1 <= nx < WIDTH-1 and 1 <= ny < HEIGHT-1 and maze[ny, nx] == B:
                maze[ny - dy//2, nx - dx//2] = W
                maze[ny, nx] = W
                stack.append((nx, ny))
                carved_cells += 1
                pbar.update(1)
                carved = True
                break
        if not carved:
            stack.pop()
    
    pbar.close()

# BFS to find farthest point
def find_farthest(maze, start):
    visited = np.zeros_like(maze, dtype=bool)
    queue = deque([(start,0)])
    visited[start[1], start[0]] = True
    farthest = start
    max_dist = 0
    pbar = tqdm(desc="Finding farthest point", unit="cell")
    while queue:
        (x,y), dist = queue.popleft()
        pbar.update(1)
        if dist > max_dist:
            max_dist = dist
            farthest = (x,y)
        for dx, dy in [(0,1),(1,0),(0,-1),(-1,0)]:
            nx, ny = x+dx, y+dy
            if 1 <= nx < WIDTH-1 and 1 <= ny < HEIGHT-1 and maze[ny, nx] == W and not visited[ny, nx]:
                visited[ny, nx] = True
                queue.append(((nx, ny), dist+1))
    pbar.close()
    return farthest

# Generate maze
start_x = random.randrange(1, WIDTH, 2)
start_y = random.randrange(1, HEIGHT, 2)
carve_maze_iterative(maze, start_x, start_y)

# Place start and goal AFTER carving
maze[start_y, start_x] = R  # Set start to red
goal_x, goal_y = find_farthest(maze, (start_x, start_y))
maze[goal_y, goal_x] = G  # Set goal to green

# Convert to image
img_array = COLOR_MAP[maze]
if CELL_SIZE > 1:
    img_array = np.kron(img_array, np.ones((CELL_SIZE,CELL_SIZE,1), dtype=np.uint8))
img = Image.fromarray(img_array)
img.save("fast_maze_with_progress.png")
print(f"Maze saved as fast_maze_with_progress.png ({WIDTH}x{HEIGHT})")
print(f"Start: ({start_x}, {start_y}) - Red")
print(f"Goal: ({goal_x}, {goal_y}) - Green")