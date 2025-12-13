import express from "express";
import multer from "multer";
import { exec } from "child_process";
import fs from "fs";

// =======================
// CONFIG (TikTok Optimized)
// =======================
const WORDS_PER_WINDOW = 3;
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

function getAudioDuration(audioPath) {
  return new Promise((resolve, reject) => {
    exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`,
      (err, stdout) => {
        if (err) reject(err);
        else resolve(parseFloat(stdout));
      }
    );
  });
}

// Build highlight mask where ONLY active word is visible
function buildHighlightMask(windowWords, activeIndex) {
  return windowWords
    .map((w, i) => (i === activeIndex ? w : " ".repeat(w.length)))
    .join(" ");
}

// =======================
// FILTER GENERATOR
// =======================
function generate3WordKaraoke(caption, audioDuration) {
  const words = caption.split(/\s+/);
  if (!words.length) return "";

  const secondsPerWord = audioDuration / words.length;
  let filters = [];

  for (let i = 0; i < words.length; i++) {
    const windowWords = words.slice(i, i + WORDS_PER_WINDOW);
    if (!windowWords.length) continue;

    const baseText = escapeFFmpeg(windowWords.join(" "));
    const activeIndex = 0; // always highlight first word in window

    const maskText = escapeFFmpeg(
      buildHighlightMask(windowWords, activeIndex)
    );

    const start = (i * secondsPerWord).toFixed(2);
    const end = ((i + 1) * secondsPerWord).toFixed(2);

    // White base text (ONLY during this word time)
    filters.push(
      `drawtext=fontfile=/opt/render/project/src/Roboto-Bold.ttf:` +
      `text='${baseText}':` +
      `fontcolor=white:` +
      `borderw=4:` +
      `bordercolor=black:` +
      `fontsize=${FONT_SIZE}:` +
      `x=(w-text_w)/2:` +
      `y=h-${BOTTOM_MARGIN}:` +
      `enable='between(t,${start},${end})'`
    );

    // Yellow highlighted word (inline illusion)
    filters.push(
      `drawtext=fontfile=/opt/render/project/src/Roboto-Bold.ttf:` +
      `text='${maskText}':` +
      `fontcolor=yellow:` +
      `borderw=4:` +
      `bordercolor=black:` +
      `fontsize=${FONT_SIZE}:` +
      `x=(w-text_w)/2:` +
      `y=h-${BOTTOM_MARGIN}:` +
      `enable='between(t,${start},${end})'`
    );
  }

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
  upload.fields([{ name: "video" }, { name: "audio" }]),
  async (req, res) => {
    try {
      const video = req.files.video[0].path;
      const audio = req.files.audio[0].path;
      const caption = req.body.caption || "";
      const output = `/tmp/output-${Date.now()}.mp4`;

      const duration = await getAudioDuration(audio);
      const filter = generate3WordKaraoke(caption, duration);

      const ffmpegCmd =
        `ffmpeg -i "${video}" -i "${audio}" ` +
        `-vf "${filter}" ` +
        `-map 0:v -map 1:a ` +
        `-c:v libx264 -c:a aac -shortest "${output}"`;

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
