// Renders SVG text to a PNG data URL, the only thing a seeker is shown. An <img> never runs scripts.
export async function rasterize(svg, size = 512) {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    try {
        await image.decode();
    } catch {
        throw new Error("The SVG could not be drawn.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, size, size);
    context.drawImage(image, 0, 0, size, size);
    return canvas.toDataURL("image/png");
}
