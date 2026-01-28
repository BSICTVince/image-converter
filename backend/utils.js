import sharp from "sharp";
import { optimize as svgoOptimize } from "svgo";

/**
 * Convert raster image to SVG using image-tracer-js
 * @param {Buffer} buffer - input raster image buffer
 * @returns {Promise<Buffer>} SVG buffer
 */
// Raster -> SVG conversion
async function rasterToSVG(buffer) {
  // Dynamic import inside async function
  const ImageTracer = await import('image-tracer').then(m => m.default);

  // Convert buffer to base64 data URL
  const base64 = buffer.toString('base64');
  const imgDataUrl = `data:image/png;base64,${base64}`;

  // Return a promise that resolves to SVG buffer
  return new Promise((resolve, reject) => {
    ImageTracer.imageToSVG(
      imgDataUrl,
      (svgString) => {
        resolve(Buffer.from(svgString, 'utf-8'));
      },
      {
        scale: 1,
        colorsampling: 2,
        ltres: 1,
        qtres: 1
      }
    );
  });
}

/**
 * Optimize and convert an image
 * @param {Buffer} buffer - input image buffer
 * @param {string} format - target format: jpg, png, webp, tiff, svg
 * @param {number|null} targetKB - desired file size in KB
 * @param {number|null} percent - compression percentage
 * @param {[number, number]|null} resize - [width, height]
 * @returns {Buffer} optimized image buffer
 */
export async function optimizeImage(buffer, format, targetKB = null, percent = null, resize = null) {
  format = format.toLowerCase();
  if (format === "jpg") format = "jpeg"; // Sharp internal

  // ----- SVG handling first -----
  if (format === "svg") {
    const metadata = await sharp(buffer).metadata().catch(() => null);

    if (metadata && metadata.format === "svg") {
      // Already SVG, just optimize
      let svgString = buffer.toString("utf-8");

      // Optional resize
      if (resize) {
        const [width, height] = resize;
        svgString = svgString.replace(/width="[^"]*"/, `width="${width}"`)
                             .replace(/height="[^"]*"/, `height="${height}"`);
        if (!/width=/.test(svgString)) svgString = svgString.replace("<svg", `<svg width="${width}"`);
        if (!/height=/.test(svgString)) svgString = svgString.replace("<svg", `<svg height="${height}"`);
      }

      const optimized = svgoOptimize(svgString, { multipass: true });
      return Buffer.from(optimized.data, "utf-8");
    } else {
      // Raster → SVG conversion
      return await rasterToSVG(buffer);
    }
  }

  // ----- Raster image workflow (unchanged) -----
  let img = sharp(buffer);

  // Resize if specified
  if (resize) img = img.resize(resize[0], resize[1], { fit: "inside", withoutEnlargement: true });

  // Detect transparency
  const metadata = await img.metadata();
  const hasAlpha = metadata.hasAlpha || false;

  // Flatten transparent backgrounds for formats that don't support transparency
  if (hasAlpha && ["jpg", "jpeg", "tiff"].includes(format)) {
    img = img.flatten({ background: { r: 255, g: 255, b: 255 } }); // white background
  }

  // ---- Iterative targetKB compression -----
  if (targetKB) {
    let quality = 95;        // Start high
    const MIN_QUALITY = 50;  // Do not go below
    const MAX_ITER = 20;     // Safety iteration limit
    let bufferOut = await img.toFormat(format, { quality }).toBuffer();
    let kb = bufferOut.length / 1024;
    let iter = 0;

    while ((kb > targetKB || kb < targetKB - 5) && iter < MAX_ITER) {
      iter++;
      if (kb > targetKB) {
        quality -= 2;
        if (quality < MIN_QUALITY) quality = MIN_QUALITY;
      } else if (kb < targetKB - 5) {
        quality += 1;
        if (quality > 95) quality = 95;
      }

      bufferOut = await img.toFormat(format, { quality }).toBuffer();
      kb = bufferOut.length / 1024;

      if (quality === MIN_QUALITY || quality === 95) break;
    }

    return bufferOut;
  }

  // ---- Percent-based compression -----
  if (percent) {
    const q = Math.max(1, Math.min(100, parseInt(percent)));
    return await img.toFormat(format, { quality: q }).toBuffer();
  }

  // ---- Default conversion -----
  return await img.toFormat(format).toBuffer();
}
