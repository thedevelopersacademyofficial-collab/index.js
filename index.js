import express from "express";
import multer from "multer";
import { exec } from "child_process";
import fs from "fs";

// =======================
// CONFIG
// =======================
const STEP_SECONDS = 0.6;   // how long each word is highlighted
const FONT_SIZE = 46;      // TikTok-friendly size
const BOTTOM_MARGIN = 280; // distance from bottom
const MAX_TEXT_WIDTH = 0.8; // 80% of video width
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
  return word.length * 22; // rough width estimation
}

function generateKaraokeFilter(caption) {
  if (!caption || !caption.trim()) return "";

  const words = caption.split(/\s+/);
  const safeCaption = escapeFFmpeg(caption);
  let filters = [];

  // Base white text (always visible)
  filters.push(
  `drawtext=fontfile=Roboto-Regular.ttf:` +
  `text='${safeCaption}':` +
  `fontcolor=white:` +
  `fontsize=${FONT_SIZE}:` +
  `line_spacing=6:` +
  `max_text_width=w*${MAX_TEXT_WIDTH}:` +
  `x=(w-text_w)/2:` +
  `y=h-${BOTTOM_MARGIN}`
);

  let offset = 0;

  words.forEach((word, i) => {
    const safeWord = escapeFFmpeg(word);
    const start = (i * STEP_SECONDS).toFixed(2);
    const end = ((i + 1) * STEP_SECONDS).toFixed(2);

    filters.push(
      `drawtext=fontfile=Roboto-Bold.ttf:` +
      `text='${safeWord}':` +
      `fontcolor=yellow:` +
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

      const filter = generateKaraokeFilter(caption);

      const ffmpegCmd =
        filter
          ? `ffmpeg -i ${video} -i ${audio} ` +
            `-vf "${filter}" ` +
            `-map 0:v -map 1:a ` +
            `-c:v libx264 -c:a aac -shortest ${output}`
          : `ffmpeg -i ${video} -i ${audio} ` +
            `-map 0:v -map 1:a ` +
            `-c:v libx264 -c:a aac -shortest ${output}`;

      exec(ffmpegCmd, (err) => {
        if (err) {
          return res.status(500).send(err.message);
        }

        res.sendFile(output, () => {
          fs.unlinkSync(video);
          fs.unlinkSync(audio);
          fs.unlinkSync(output);
        });
      });
    } catch (e) {
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
