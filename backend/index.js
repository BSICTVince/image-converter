import express from "express";
import multer from "multer";
import cors from "cors";
import AdmZip from "adm-zip";
import { optimizeImage } from "./utils.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors());
app.use(express.json());

// Serve the frontend folder
app.use(express.static(path.join(__dirname, "../frontend")));

// Serve index.html for root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});


// Single image
app.post("/convert", upload.single("image"), async (req, res) => {
  try {
    const { format, targetKB, percent, width, height } = req.body;
    const resize = width && height ? [parseInt(width), parseInt(height)] : null;
    const optimized = await optimizeImage(
      req.file.buffer,
      format,
      targetKB ? parseInt(targetKB) : null,
      percent ? parseInt(percent) : null,
      resize
    );
    res.set("Content-Type", `image/${format}`);
    res.send(optimized);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Conversion failed" });
  }
});

// Batch image conversion -> ZIP
app.post("/batch", upload.array("images"), async (req, res) => {
  try {
    const { format, targetKB, percent, width, height } = req.body;
    const resize = width && height ? [parseInt(width), parseInt(height)] : null;
    const zip = new AdmZip();

    await Promise.all(
      req.files.map(async (file) => {
        const optimized = await optimizeImage(
          file.buffer,
          format,
          targetKB ? parseInt(targetKB) : null,
          percent ? parseInt(percent) : null,
          resize
        );
        zip.addFile(`${file.originalname}.${format}`, optimized);
      })
    );

    res.set("Content-Type", "application/zip");
    res.set("Content-Disposition", "attachment; filename=converted.zip");
    res.send(zip.toBuffer());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Batch conversion failed" });
  }
});



app.listen(3000, () => console.log("Backend running on http://localhost:3000"));
