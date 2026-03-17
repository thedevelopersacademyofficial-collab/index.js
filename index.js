import express from "express";
import multer from "multer";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

// =======================
// CONFIG
// =======================

const FONT_SIZE = 55;
const BOTTOM_MARGIN = 285;
const FONT_PATH = "/opt/render/project/src/Montserrat-Bold.ttf";
const OVERLAY_PATH = "/opt/render/project/src/reelstemplate.png";

// =======================
// APP SETUP
// =======================

const app = express();
const upload = multer({ dest: "/tmp" });

// =======================
// RENDER (VIDEO + AUDIO + PRICE)
// =======================

app.post("/render", upload.fields([
  { name: "video", maxCount: 1 },
  { name: "audio", maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files.video) {
      return res.status(400).send("Video file missing");
    }

    const videoPath = req.files.video[0].path;
    const audioPath = req.files.audio ? req.files.audio[0].path : null;
    const price = req.body.price || "";

    const outputPath = `/tmp/output-${Date.now()}.mp4`;

    // Escape text safely
    const safePrice = price.replace(/'/g, "\\'");

    // =======================
    // FILTER COMPLEX
    // =======================

    const filterComplex = `
      [0:v]scale=1080:1920:force_original_aspect_ratio=increase,
      crop=1080:1920[v0];
      [v0][1:v]overlay=0:0,
      drawtext=
      fontfile=${FONT_PATH}:
      text='${safePrice}':
      fontcolor=white:
      fontsize=${FONT_SIZE}:
      x=(w-text_w)/2:
      y=h-${BOTTOM_MARGIN}
    `;

    // =======================
    // BUILD FFMPEG COMMAND
    // =======================

    let ffmpegCmd = `
      ffmpeg -y
      -i "${videoPath}"
      -i "${OVERLAY_PATH}"
    `;

    if (audioPath) {
      ffmpegCmd += ` -i "${audioPath}" `;
    }

    ffmpegCmd += `
      -filter_complex "${filterComplex}"
      -map 0:v
      ${audioPath ? "-map 2:a" : "-map 0:a?"}
      -c:v libx264
      -preset ultrafast
      -crf 26
      -threads 2
      -movflags +faststart
      -c:a aac
      -shortest
      "${outputPath}"
    `;

    ffmpegCmd = ffmpegCmd.replace(/\s+/g, " ").trim();

    // =======================
    // EXECUTE
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
          if (audioPath) fs.unlinkSync(audioPath);
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
