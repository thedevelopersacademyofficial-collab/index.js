import express from "express";
import multer from "multer";
import { exec } from "child_process";
import fs from "fs";

// =======================
// CONFIG
// =======================
const FONT_SIZE = 55;
const BOTTOM_MARGIN = 320;
const FONT_PATH = "/opt/render/project/src/Roboto-Bold.ttf";

// =======================
// APP SETUP
// =======================
const app = express();
const upload = multer({ dest: "/tmp" });

// =======================
// HELPERS
// =======================

// get video width / height using ffprobe
function getVideoDimensions(filePath) {
  return new Promise((resolve, reject) => {
    exec(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${filePath}"`,
      (err, stdout) => {
        if (err) return reject(err);
        const [width, height] = stdout.trim().split(",").map(Number);
        resolve({ width, height });
      }
    );
  });
}

// check if video is approximately 9:16
function isVerticalVideo(width, height) {
  const ratio = width / height;
  const target = 9 / 16;
  return Math.abs(ratio - target) < 0.05; // tolerance
}

// =======================
// MERGE ENDPOINT
// =======================
app.post(
  "/merge",
  upload.fields([
    { name: "video" },
    { name: "audio" }
  ]),
  async (req, res) => {
    try {
      if (!req.files?.video || !req.files?.audio) {
        return res.status(400).send("Video or audio missing");
      }

      const video = req.files.video[0].path;
      const audio = req.files.audio[0].path;
      const output = `/tmp/output-${Date.now()}.mp4`;

      // =======================
      // MULTILINE TEXT (SAFE)
      // =======================
      const textContent = `Porosit ne mesazhe apo
Whatsapp: +383 49 37 30 37`;

      const textFile = `/tmp/text-${Date.now()}.txt`;
      fs.writeFileSync(textFile, textContent, "utf8");

      // =======================
      // DETECT VIDEO TYPE
      // =======================
      const { width, height } = await getVideoDimensions(video);
      const vertical = isVerticalVideo(width, height);

      // =======================
      // BUILD FILTER
      // =======================
      let filterComplex;

      if (vertical) {
        // ✅ already 9:16 → just resize
        filterComplex = `
        scale=1080:1920,
        drawtext=
        fontfile=${FONT_PATH}:
        textfile=${textFile}:
        fontcolor=white:
        borderw=4:
        bordercolor=black:
        fontsize=${FONT_SIZE}:
        line_spacing=14:
        x=(w-text_w)/2:
        y=h-${BOTTOM_MARGIN}
        `;
      } else {
        // 🔥 not vertical → blurred background
        filterComplex = `
        [0:v]scale=1080:1920:force_original_aspect_ratio=increase,
        crop=1080:1920,
        boxblur=20:1,
        eq=brightness=-0.1[bg];
        [0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];
        [bg][fg]overlay=(W-w)/2:(H-h)/2,
        drawtext=
        fontfile=${FONT_PATH}:
        textfile=${textFile}:
        fontcolor=white:
        borderw=4:
        bordercolor=black:
        fontsize=${FONT_SIZE}:
        line_spacing=14:
        x=(w-text_w)/2:
        y=h-${BOTTOM_MARGIN}
        `;
      }

      // =======================
      // FFMPEG COMMAND
      // =======================
      const ffmpegCmd = `
      ffmpeg -y
      -i "${video}"
      -i "${audio}"
      -filter_complex "${filterComplex}"
      -map 0:v
      -map 1:a
      -c:v libx264
      -preset ultrafast
      -movflags +faststart
      -c:a aac
      -shortest
      "${output}"
      `.replace(/\s+/g, " ").trim();

      exec(ffmpegCmd, (err) => {
        if (err) {
          console.error("FFMPEG ERROR:", err.message);
          return res.status(500).send(err.message);
        }

        res.sendFile(output, () => {
          // cleanup
          fs.unlinkSync(video);
          fs.unlinkSync(audio);
          fs.unlinkSync(output);
          fs.unlinkSync(textFile);
        });
      });

    } catch (e) {
      console.error("SERVER ERROR:", e.message);
      res.status(500).send(e.message);
    }
  }
);

// =======================
// START SERVER
// =======================
app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
