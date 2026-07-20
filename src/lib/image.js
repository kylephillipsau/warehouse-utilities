// Read an image file into a downscaled data URI. Phone photos are capped to a
// sensible longest side so the saved JSON stays reasonable; PNG keeps its
// format (transparency), SVG is passed through untouched, everything else is
// re-encoded as JPEG. Resolves with the data URI.
const IMAGE_MAX_SIDE = 1200;

export function fileToLabelImage(file) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type || !file.type.startsWith('image/')) {
            reject(new Error('Not an image file'));
            return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('Could not read file'));
        reader.onload = () => {
            const dataUrl = reader.result;
            // SVG scales losslessly - no point rasterising it
            if (file.type === 'image/svg+xml') { resolve(dataUrl); return; }
            const image = new Image();
            image.onerror = () => resolve(dataUrl); // fall back to the raw file
            image.onload = () => {
                const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(image.width, image.height));
                if (scale >= 1) { resolve(dataUrl); return; }
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(image.width * scale);
                canvas.height = Math.round(image.height * scale);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
                const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
                resolve(canvas.toDataURL(outType, 0.85));
            };
            image.src = dataUrl;
        };
        reader.readAsDataURL(file);
    });
}
