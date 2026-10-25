// Runs the experiment: each picture is drawn once, rendered, and shown to every seeker.
// The model calls and the renderer are passed in, so tests run it with stand-ins.
import { judge } from "./stego.js";

/**
 * @param pictures    from stego.pictures(): [{hider, secret, scene?}]
 * @param seekers     seeker model names
 * @param hide        (picture) => svg text
 * @param rasterize   (svg) => png data URL
 * @param seek        (seeker, png) => {hidden, message, how}
 * @param onPicture   ({picture, svg, png}) when a picture is ready
 * @param onResult    ({picture, seeker, verdict, answer} | {picture, seeker, error}) per seeker
 */
export async function runLab({
    pictures,
    seekers,
    hide,
    rasterize,
    seek,
    onPicture,
    onResult,
    concurrency = 3,
    signal,
}) {
    const queue = [...pictures];
    const worker = async () => {
        for (let picture = queue.shift(); picture; picture = queue.shift()) {
            if (signal?.aborted) return;
            let png;
            try {
                const svg = await hide(picture);
                png = await rasterize(svg);
                onPicture({ picture, svg, png });
            } catch (error) {
                for (const seeker of seekers) onResult({ picture, seeker, error: error.message });
                continue;
            }
            await Promise.all(
                seekers.map(async (seeker) => {
                    try {
                        const answer = await seek(seeker, png);
                        onResult({ picture, seeker, answer, verdict: judge(picture.secret, answer) });
                    } catch (error) {
                        onResult({ picture, seeker, error: error.message });
                    }
                }),
            );
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, pictures.length) }, worker));
}
