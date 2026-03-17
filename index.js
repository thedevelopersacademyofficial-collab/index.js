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
// APP
// =======================

const app = express();
const upload = multer({ dest: "/tmp" });

// =======================
// RENDER CINEMATIC
// =======================

app.post("/render", upload.fields([
  { name: "video", maxCount: 1 },
  { name: "audio", maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files.video) {
      return res.status(400).send("Video missing");
    }

    const videoPath = req.files.video[0].path;
    const audioPath = req.files.audio ? req.files.audio[0].path : null;
    const price = req.body.price || "";

    const outputPath = `/tmp/output-${Date.now()}.mp4`;

    const safePrice = price.replace(/'/g, "\\'");

    // =======================
    // VIDEO FILTER (CINEMATIC LOOK)
    // =======================

    const videoFilter = `
      [0:v]scale=1080:1920:force_original_aspect_ratio=increase,
      crop=1080:1920,
      eq=contrast=1.08:saturation=1.12:brightness=0.02,
      unsharp=5:5:0.6:5:5:0.0[v0];
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
    // AUDIO FILTER (ADS STYLE)
    // =======================

    const audioFilter = audioPath
      ? "-filter:a \"loudnorm, equalizer=f=100:t=q:w=1:g=3\""
      : "";

    // =======================
    // BUILD COMMAND
    // =======================

    let cmd = `
      ffmpeg -y
      -i "${videoPath}"
      -i "${OVERLAY_PATH}"
    `;

    if (audioPath) {
      cmd += ` -i "${audioPath}" `;
    }

    cmd += `
      -filter_complex "${videoFilter}"
      -map 0:v
      ${audioPath ? "-map 2:a" : "-map 0:a?"}
      ${audioFilter}
      -c:v libx264
      -preset veryfast
      -crf 23
      -movflags +faststart
      -c:a aac
      -b:a 192k
      -shortest
      "${outputPath}"
    `;

    cmd = cmd.replace(/\s+/g, " ").trim();

    // =======================
    // EXECUTE
    // =======================

    exec(cmd, (err) => {
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
        } catch (e) {}
      });
    });

  } catch (err) {
    console.error("SERVER ERROR:", err.message);
    res.status(500).send(err.message);
  }
});

// =======================
// START
// =======================

app.listen(process.env.PORT || 3000, () => {
  console.log("Cinematic engine running 🚀");
});
