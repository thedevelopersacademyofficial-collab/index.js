import express from "express";
import multer from "multer";
import { exec } from "child_process";
import fs from "fs";

// =======================
// CONFIG (TikTok Optimized)
// =======================
const FONT_SIZE = 42;
const BOTTOM_MARGIN = 260;

// =======================
// HELPERS
// =======================
function escapeFFmpeg(text) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n");
}

// =======================
// APP SETUP
// =======================
const app = express();
const upload = multer({ dest: "/tmp" });

// =======================
// MERGE ENDPOINT
// =======================
app.post(
  "/merge",
  upload.fields([
    { name: "video" },
    { name: "audio" }
  ]),
  (req, res) => {
    try {
      const video = req.files.video[0].path;
      const audio = req.files.audio[0].path;
      const output = `/tmp/output-${Date.now()}.mp4`;

      const text = escapeFFmpeg(
        "Porosit ne mesazhe apo\nWhatsapp: +383 49 37 30 37"
      );

      const drawtext =
        `drawtext=fontfile=/opt/render/project/src/Roboto-Bold.ttf:` +
        `text='${text}':` +
        `text_shaping=1:` +              // ✅ REQUIRED for newline
        `fontcolor=white:` +
        `borderw=4:` +
        `bordercolor=black:` +
        `fontsize=${FONT_SIZE}:` +
        `line_spacing=12:` +
        `x=(w-text_w)/2:` +
        `y=h-${BOTTOM_MARGIN}`;

      const ffmpegCmd =
        `ffmpeg -i ${video} -i ${audio} ` +
        `-vf "${drawtext}" ` +
        `-map 0:v -map 1:a ` +
        `-c:v libx264 -c:a aac -shortest ${output}`;

      exec(ffmpegCmd, (err) => {
        if (err) {
          console.error("FFMPEG ERROR:", err.message);
          return res.status(500).send(err.message);
        }

        res.sendFile(output, () => {
          fs.unlinkSync(video);
          fs.unlinkSync(audio);
          fs.unlinkSync(output);
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
