self.addEventListener('message', (event) => {
    const data = event.data || {};
    const { id, type, arrayBuffer } = data;

    if (type !== 'parseMazeFormat') {
        return;
    }

    try {
        const result = parseMazeFormat(arrayBuffer);
        self.postMessage({
            id,
            ok: true,
            result
        });
    } catch (err) {
        self.postMessage({
            id,
            ok: false,
            error: err && err.message ? err.message : 'Failed to parse .maze file'
        });
    }
});

function parseMazeFormat(arrayBuffer) {
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

    return {
        width,
        height,
        cells,
        startIndex,
        goalIndex
    };
}
