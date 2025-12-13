import express from "express";
import multer from "multer";
import { exec } from "child_process";
import fs from "fs";

// =======================
// CONFIG (TikTok Optimized)
// =======================
const FONT_SIZE = 52;
const BOTTOM_MARGIN = 260;
const MAX_CHARS_PER_LINE = 20;

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

function wrapText(text) {
  const words = text.split(" ");
  let lines = [];
  let current = "";

  words.forEach(word => {
    if ((current + " " + word).trim().length > MAX_CHARS_PER_LINE) {
      lines.push(current);
      current = word;
    } else {
      current += (current ? " " : "") + word;
    }
  });

  if (current) lines.push(current);
  return lines.join("\n");
}

function highlightMask(words, index) {
  return words
    .map((w, i) => (i === index ? w : " ".repeat(w.length)))
    .join(" ");
}

function getAudioDuration(audioPath) {
  return new Promise((resolve, reject) => {
    exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${audioPath}`,
      (err, stdout) => {
        if (err) reject(err);
        else resolve(parseFloat(stdout));
      }
    );
  });
}

function generateInlineKaraoke(caption, audioDuration) {
  const words = caption.split(/\s+/);
  const wrappedText = wrapText(caption);
  const safeBase = escapeFFmpeg(wrappedText);

  const secondsPerWord = audioDuration / words.length;
  let filters = [];

  // Base white text (visible for full audio)
  filters.push(
    `drawtext=fontfile=/opt/render/project/src/Roboto-Bold.ttf:` +
    `text='${safeBase}':` +
    `fontcolor=white:` +
    `borderw=4:` +
    `bordercolor=black:` +
    `fontsize=${FONT_SIZE}:` +
    `line_spacing=10:` +
    `x=(w-text_w)/2:` +
    `y=h-${BOTTOM_MARGIN}:` +
    `enable='between(t,0,${audioDuration.toFixed(2)})'`
  );

  // Yellow inline highlight (one word at a time)
  words.forEach((_, i) => {
    const mask = highlightMask(words, i);
    const wrappedMask = wrapText(mask);
    const safeMask = escapeFFmpeg(wrappedMask);

    const start = (i * secondsPerWord).toFixed(2);
    const end = ((i + 1) * secondsPerWord).toFixed(2);

    filters.push(
      `drawtext=fontfile=/opt/render/project/src/Roboto-Bold.ttf:` +
      `text='${safeMask}':` +
      `fontcolor=yellow:` +
      `borderw=4:` +
      `bordercolor=black:` +
      `fontsize=${FONT_SIZE}:` +
      `line_spacing=10:` +
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
  upload.fields([{ name: "video" }, { name: "audio" }]),
  async (req, res) => {
    try {
      const video = req.files.video[0].path;
      const audio = req.files.audio[0].path;
      const caption = req.body.caption || "";
      const output = `/tmp/output-${Date.now()}.mp4`;

      const duration = await getAudioDuration(audio);
      const filter = generateInlineKaraoke(caption, duration);

      const ffmpegCmd =
        `ffmpeg -i ${video} -i ${audio} ` +
        `-vf "${filter}" ` +
        `-map 0:v -map 1:a ` +
        `-c:v libx264 -c:a aac -shortest ${output}`;

      exec(ffmpegCmd, (err) => {
        if (err) return res.status(500).send(err.message);

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
