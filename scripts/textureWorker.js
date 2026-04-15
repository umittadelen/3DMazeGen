self.addEventListener('message', (event) => {
    const data = event.data || {};
    const { id, type, textures = [], atlasVariants = 0, textureRepeat = 1, mazeTextureSeed = 0 } = data;

    if (type !== 'buildTextureAtlases') {
        return;
    }

    try {
        const atlases = buildTextureAtlases(textures, atlasVariants, textureRepeat, mazeTextureSeed);
        self.postMessage({
            id,
            ok: true,
            result: { atlases }
        }, atlases);
    } catch (err) {
        self.postMessage({
            id,
            ok: false,
            error: err && err.message ? err.message : 'Texture worker failed'
        });
    } finally {
        for (const texture of textures) {
            if (texture && typeof texture.close === 'function') {
                texture.close();
            }
        }
    }
});

function buildTextureAtlases(textures, atlasVariants, textureRepeat, mazeTextureSeed) {
    if (typeof OffscreenCanvas === 'undefined' || textures.length === 0) {
        return [];
    }

    const base = textures[0];
    const tileWidth = base.width;
    const tileHeight = base.height;
    const atlases = [];

    for (let variantIndex = 0; variantIndex < atlasVariants; variantIndex++) {
        const atlas = new OffscreenCanvas(tileWidth * textureRepeat, tileHeight * textureRepeat);
        const atlasCtx = atlas.getContext('2d', { alpha: false });
        atlasCtx.imageSmoothingEnabled = false;

        for (let ty = 0; ty < textureRepeat; ty++) {
            for (let tx = 0; tx < textureRepeat; tx++) {
                const subtileHash = hashCoord(
                    mazeTextureSeed ^ Math.imul((variantIndex + 1), 0x9e3779b9),
                    tx,
                    ty
                );
                const src = textures[subtileHash % textures.length];
                atlasCtx.drawImage(src, tx * tileWidth, ty * tileHeight, tileWidth, tileHeight);
            }
        }

        atlases.push(atlas.transferToImageBitmap());
    }

    return atlases;
}

function hashCoord(seed, x, y) {
    let h = (seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}
