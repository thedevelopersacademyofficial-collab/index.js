import express from "express";
import multer from "multer";
import { exec } from "child_process";
import fs from "fs";

// =======================
// CONFIG (TikTok Optimized)
// =======================
const STEP_SECONDS = 0.7;        // time per caption chunk
const WORDS_PER_STEP = 3;       // show 2–3 words at once
const FONT_SIZE = 52;
const BOTTOM_MARGIN = 260;

// =======================
// HELPERS
// =======================
function escapeFFmpeg(text) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%")
    .replace(/\n/g, " ");
}

function chunkWords(words, size) {
  const chunks = [];
  for (let i = 0; i < words.length; i += size) {
    chunks.push(words.slice(i, i + size).join(" "));
  }
  return chunks;
}

function generateDynamicCaptionFilter(caption) {
  if (!caption || !caption.trim()) return "";

  const words = caption.split(/\s+/);
  const chunks = chunkWords(words, WORDS_PER_STEP);
  let filters = [];

  chunks.forEach((chunk, index) => {
    const safeText = escapeFFmpeg(chunk);
    const start = (index * STEP_SECONDS).toFixed(2);
    const end = ((index + 1) * STEP_SECONDS).toFixed(2);

    filters.push(
      `drawtext=fontfile=/opt/render/project/src/Roboto-Bold.ttf:` +
      `text='${safeText}':` +
      `fontcolor=white:` +
      `borderw=4:` +
      `bordercolor=black:` +
      `fontsize=${FONT_SIZE}:` +
      `x=(w-text_w)/2:` +
      `y=h-${BOTTOM_MARGIN}:` +
      `enable='between(t,${start},${end})'`
    );
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

      const filter = generateDynamicCaptionFilter(caption);
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
