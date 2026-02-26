import express from "express";
import multer from "multer";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

// =======================
// CONFIG
// =======================

const FONT_SIZE = 90;
const BOTTOM_MARGIN = 320;
const FONT_PATH = "/opt/render/project/src/Roboto-Bold.ttf";
const OVERLAY_PATH = "/opt/render/project/src/reelstemplate.png";

// =======================
// APP SETUP
// =======================

const app = express();
const upload = multer({ dest: "/tmp" });

// =======================
// RENDER ENDPOINT
// =======================

app.post("/render", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("Video file missing");
    }

    const videoPath = req.file.path;
    const price = req.body.price || "";
    const outputPath = `/tmp/output-${Date.now()}.mp4`;

    // escape single quotes safely
    const safePrice = price.replace(/'/g, "\\'");

    // =======================
    // FFMPEG FILTER
    // =======================

    const filterComplex = `
    scale=1080:1920:force_original_aspect_ratio=increase,
    crop=1080:1920,
    overlay=0:0,
    drawtext=
    fontfile=${FONT_PATH}:
    text='${safePrice}':
    fontcolor=white:
    borderw=4:
    bordercolor=black:
    fontsize=${FONT_SIZE}:
    shadowcolor=black:
    shadowx=3:
    shadowy=3:
    x=(w-text_w)/2:
    y=h-${BOTTOM_MARGIN}
    `;

    // =======================
    // BUILD FFMPEG COMMAND
    // =======================

    const ffmpegCmd = `
    ffmpeg -y
    -i "${videoPath}"
    -i "${OVERLAY_PATH}"
    -filter_complex "${filterComplex}"
    -map 0:v
    -map 0:a?
    -c:v libx264
    -preset veryfast
    -crf 23
    -movflags +faststart
    -c:a aac
    -shortest
    "${outputPath}"
    `.replace(/\s+/g, " ").trim();

    // =======================
    // EXECUTE FFMPEG
    // =======================

    exec(ffmpegCmd, (err) => {
      if (err) {
        console.error("FFMPEG ERROR:", err.message);
        return res.status(500).send(err.message);
      }

      res.setHeader("Content-Type", "video/mp4");

      res.sendFile(path.resolve(outputPath), () => {
        try {
          fs.unlinkSync(videoPath);
          fs.unlinkSync(outputPath);
        } catch (cleanupErr) {
          console.error("Cleanup error:", cleanupErr.message);
        }
      });
    });

  } catch (error) {
    console.error("SERVER ERROR:", error.message);
    res.status(500).send(error.message);
  }
});

// =======================
// START SERVER
// =======================

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running...");
});
