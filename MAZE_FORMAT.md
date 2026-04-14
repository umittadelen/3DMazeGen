# .MAZE File Format Documentation

## Overview
The `.maze` format is a compact binary format for 3DMazeGen. The current format is **version 2** and is not backward compatible with earlier `.maze` files.

Version 2 separates maze topology from special markers:

- The maze body stores only **wall/path** values using **1 bit per cell**.
- The start and goal are stored separately as unsigned varint indices.
- The file begins with a fixed binary magic header and explicit version byte.

This makes the format smaller, stricter, and easier to validate than the older 2-bit-per-cell layout.

## File Structure

The binary layout is:

```
[4 bytes magic "MAZE"]
[1 byte version = 2]
[varint width]
[varint height]
[varint startIndex]
[varint goalIndex]
[maze bitset]
```

## Header

### Magic
The first four bytes are ASCII:

```
4D 41 5A 45
```

That is the string:

```
MAZE
```

### Version
The next byte is the format version:

```
02
```

Only version 2 is accepted by the current player.

## Varint Encoding

Width, height, startIndex, and goalIndex are stored as unsigned base-128 varints.

Rules:

- 7 payload bits per byte
- Bit 7 is the continuation bit
- If bit 7 is 1, another byte follows
- If bit 7 is 0, that byte ends the number
- Values are little-endian by 7-bit groups

Examples:

- `5` = `05`
- `127` = `7F`
- `128` = `80 01`
- `300` = `AC 02`

## Maze Body

The maze payload stores one bit per cell in row-major order.

Cell meaning:

- `0` = wall
- `1` = walkable path

The start and goal are not encoded in the bitset. They are reconstructed from `startIndex` and `goalIndex` after decoding.

## Cell Indexing

Cells are indexed in row-major order:

```text
index = y * width + x
```

So:

- index `0` is the top-left cell
- index `width - 1` is the top-right cell of the first row
- index `width` is the first cell of the second row

## Bit Packing

Maze bits are packed left-to-right within each byte.

For byte `n`:

- cell `n*8 + 0` is stored in bit 7
- cell `n*8 + 1` is stored in bit 6
- cell `n*8 + 2` is stored in bit 5
- cell `n*8 + 3` is stored in bit 4
- cell `n*8 + 4` is stored in bit 3
- cell `n*8 + 5` is stored in bit 2
- cell `n*8 + 6` is stored in bit 1
- cell `n*8 + 7` is stored in bit 0

The number of maze payload bytes is:

```text
ceil(width * height / 8)
```

Any unused trailing bits in the final byte must be zero.

## Reconstruction Rules

After reading the bitset:

- all `0` bits become wall cells
- all `1` bits become path cells
- `startIndex` is replaced with the start marker
- `goalIndex` is replaced with the goal marker

The start and goal cells must point to walkable cells in the bitset.

## Validation Rules

The current player enforces these rules:

- magic must be `MAZE`
- version must be `2`
- width and height must both be at least `3`
- width and height must not exceed the current application limit
- startIndex and goalIndex must be within bounds
- startIndex and goalIndex must be different
- file size must exactly match the expected payload size
- start and goal must land on walkable cells

The current application limit is `50000 x 50000` even though the varint format itself can encode larger values.

## Size Formula

Total file size is:

```text
4
+ 1
+ len(varint(width))
+ len(varint(height))
+ len(varint(startIndex))
+ len(varint(goalIndex))
+ ceil(width * height / 8)
```

Compared to the previous 2-bit layout, V2 reduces the maze body size by half because topology now uses 1 bit per cell instead of 2.

## Example

Example maze:

- width = `4`
- height = `2`
- startIndex = `1`
- goalIndex = `6`
- cells = `[wall, start, path, wall, wall, path, goal, wall]`

Bitset view after converting start and goal to walkable path:

```text
0 1 1 0 0 1 1 0
```

Packed into one byte:

```text
01100110 = 0x66
```

Full file bytes:

```text
4D 41 5A 45 02 04 02 01 06 66
```

Breakdown:

- `4D 41 5A 45` = `MAZE`
- `02` = version 2
- `04` = width 4
- `02` = height 2
- `01` = startIndex 1
- `06` = goalIndex 6
- `66` = maze topology bitset

## Usage

### Creating a .MAZE File
1. Generate a maze in the generator.
2. Click `Download .maze`.
3. The file is written using V2 only.

### Loading a .MAZE File
1. Open the player page.
2. Upload a `.maze` file.
3. The file must already be V2 format.

## Advantages

- Smaller payload than the previous 2-bit format
- Explicit magic and version for strict validation
- Start and goal are unambiguous
- Row-major bitset is simple to decode
- Binary-only structure with no text parsing

## Compatibility

- Generator: [scripts/gen.js](scripts/gen.js)
- Player parser: [scripts/main.js](scripts/main.js)
- Worker parser: [scripts/mazeWorker.js](scripts/mazeWorker.js)
- Version: `2`
- Backward compatibility: none
