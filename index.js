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
// HEALTH CHECK (WAKE)
// =======================

app.get("/", (req, res) => {
  res.send("Server running 🚀");
});

// =======================
// RENDER ENGINE (2 STEP)
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

    const tempVideo = `/tmp/temp-${Date.now()}.mp4`;
    const finalOutput = `/tmp/output-${Date.now()}.mp4`;

    const safePrice = price.replace(/'/g, "\\'");

    // =======================
    // STEP 1: VIDEO RENDER (NO AUDIO)
    // =======================

    const step1 = `
      ffmpeg -y
      -i "${videoPath}"
      -i "${OVERLAY_PATH}"
      -filter_complex "
        [0:v]scale=1080:1920:force_original_aspect_ratio=increase,
        crop=1080:1920[v0];
        [v0][1:v]overlay=0:0,
        drawtext=fontfile=${FONT_PATH}:
        text='${safePrice}':
        fontcolor=white:
        fontsize=${FONT_SIZE}:
        x=(w-text_w)/2:
        y=h-${BOTTOM_MARGIN}
      "
      -map 0:v
      -c:v libx264
      -preset ultrafast
      -crf 28
      -threads 1
      -an
      "${tempVideo}"
    `.replace(/\s+/g, " ").trim();

    exec(step1, (err) => {
      if (err) {
        console.error("STEP1 ERROR:", err.message);
        return res.status(500).send(err.message);
      }

      // =======================
      // STEP 2: MERGE AUDIO (LIGHT)
      // =======================

      let step2;

      if (audioPath) {
        step2 = `
          ffmpeg -y
          -i "${tempVideo}"
          -i "${audioPath}"
          -map 0:v
          -map 1:a
          -c:v copy
          -c:a aac
          -b:a 128k
          -shortest
          "${finalOutput}"
        `;
      } else {
        step2 = `
          ffmpeg -y
          -i "${tempVideo}"
          -c copy
          "${finalOutput}"
        `;
      }

      step2 = step2.replace(/\s+/g, " ").trim();

      exec(step2, (err2) => {
        if (err2) {
          console.error("STEP2 ERROR:", err2.message);
          return res.status(500).send(err2.message);
        }

        res.setHeader("Content-Type", "video/mp4");

        res.sendFile(path.resolve(finalOutput), () => {
          try {
            fs.unlinkSync(videoPath);
            if (audioPath) fs.unlinkSync(audioPath);
            fs.unlinkSync(tempVideo);
            fs.unlinkSync(finalOutput);
          } catch (e) {
            console.error("Cleanup error:", e.message);
          }
        });
      });
    });

  } catch (error) {
    console.error("SERVER ERROR:", error.message);
    res.status(500).send(error.message);
  }
});

// =======================
// START
// =======================

app.listen(process.env.PORT || 3000, () => {
  console.log("1080p Engine running 🚀");
});
