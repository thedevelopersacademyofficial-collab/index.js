import express from "express";
import multer from "multer";
import { exec } from "child_process";
import fs from "fs";

// =======================
// CONFIG (TikTok Optimized)
// =======================
const STEP_SECONDS = 0.6;
const FONT_SIZE = 46;
const BOTTOM_MARGIN = 280;

// =======================
// HELPERS
// =======================
function escapeFFmpeg(text) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\n/g, " ");
}

function estimateWidth(word) {
  return word.length * 22;
}

function generateKaraokeFilter(caption) {
  if (!caption || !caption.trim()) return "";

  const words = caption.split(/\s+/);
  const safeCaption = escapeFFmpeg(caption);
  let filters = [];

  // Base white text
  filters.push(
    `drawtext=fontfile=/opt/render/project/src/Roboto-Regular.ttf:` +
    `text='${safeCaption}':` +
    `fontcolor=white:` +
    `borderw=3:` +
    `bordercolor=black:` +
    `fontsize=${FONT_SIZE}:` +
    `line_spacing=6:` +
    `x=(w-text_w)/2:` +
    `y=h-${BOTTOM_MARGIN}`
  );

  let offset = 0;

  // Yellow word highlight
  words.forEach((word, i) => {
    const safeWord = escapeFFmpeg(word);
    const start = (i * STEP_SECONDS).toFixed(2);
    const end = ((i + 1) * STEP_SECONDS).toFixed(2);

    filters.push(
      `drawtext=fontfile=/opt/render/project/src/Roboto-Bold.ttf:` +
      `text='${safeWord}':` +
      `fontcolor=yellow:` +
      `borderw=3:` +
      `bordercolor=black:` +
      `fontsize=${FONT_SIZE}:` +
      `x=(w-text_w)/2+${offset}:` +
      `y=h-${BOTTOM_MARGIN}:` +
      `enable='between(t,${start},${end})'`
    );

    offset += estimateWidth(word + " ");
  });

  return filters.join(",");
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
      const caption = req.body.caption || "";
      const output = `/tmp/output-${Date.now()}.mp4`;

      console.log("CAPTION:", caption);

      const filter = generateKaraokeFilter(caption);
      console.log("FILTER:", filter);

      const ffmpegCmd =
        `ffmpeg -i ${video} -i ${audio} ` +
        `-vf "${filter}" ` +
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
