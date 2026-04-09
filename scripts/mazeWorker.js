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
    if (!arrayBuffer || arrayBuffer.byteLength < 3) {
        throw new Error('.maze file is corrupted (too small)');
    }

    const view = new DataView(arrayBuffer);
    const bytesPerDim = view.getUint8(0);
    if (bytesPerDim < 1 || bytesPerDim > 4) {
        throw new Error('.maze file has invalid header');
    }

    let width = 0;
    for (let i = 0; i < bytesPerDim; i++) {
        width |= view.getUint8(1 + i) << (i * 8);
    }

    let height = 0;
    for (let i = 0; i < bytesPerDim; i++) {
        height |= view.getUint8(1 + bytesPerDim + i) << (i * 8);
    }

    if (width < 3 || height < 3 || width > 50000 || height > 50000) {
        throw new Error('.maze file has invalid dimensions: ' + width + 'x' + height);
    }

    const totalCells = width * height;
    if (!Number.isFinite(totalCells) || totalCells <= 0) {
        throw new Error('.maze file dimensions overflowed');
    }

    const headerSize = 1 + bytesPerDim * 2;
    const expectedSize = headerSize + Math.ceil(totalCells * 2 / 8);
    if (arrayBuffer.byteLength < expectedSize) {
        throw new Error('.maze file is truncated or corrupted');
    }

    const packed = new Uint8Array(arrayBuffer, headerSize);
    const cells = new Uint8Array(totalCells);

    let bitIndex = 0;
    let startIndex = -1;
    let goalIndex = -1;

    for (let i = 0; i < totalCells; i++) {
        const byteIndex = bitIndex >> 3;
        if (byteIndex >= packed.length) {
            throw new Error('.maze file data is corrupted');
        }

        const offset = 6 - (bitIndex % 8);
        const cell = (packed[byteIndex] >> offset) & 0b11;
        bitIndex += 2;

        cells[i] = cell;

        if (cell === 2 && startIndex === -1) {
            startIndex = i;
        } else if (cell === 3 && goalIndex === -1) {
            goalIndex = i;
        }
    }

    if (startIndex === -1 || goalIndex === -1) {
        throw new Error('Invalid .maze file: missing start or goal');
    }

    return {
        width,
        height,
        cells,
        startIndex,
        goalIndex
    };
}
