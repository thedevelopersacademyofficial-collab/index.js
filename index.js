import express from "express";
import multer from "multer";
import { exec } from "child_process";
import fs from "fs";

// =======================
// CONFIG (TikTok Optimized)
// =======================
const WORDS_PER_CHUNK = 3;
const FONT_SIZE = 52;
const BOTTOM_MARGIN = 260;
const MAX_CHARS_PER_LINE = 18;

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
    if ((current + " " + word).length > MAX_CHARS_PER_LINE) {
      lines.push(current);
      current = word;
    } else {
      current += (current ? " " : "") + word;
    }
  });

  if (current) lines.push(current);
  return lines.join("\\n");
}

function wordDuration(word) {
  let base = 0.22;
  if (word.length > 6) base += 0.1;
  if (/[.,!?]/.test(word)) base += 0.2;
  return base;
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

function generateDynamicKaraoke(caption, audioDuration) {
  const words = caption.split(/\s+/);
  let filters = [];
  let currentTime = 0;

  for (let i = 0; i < words.length; i++) {
    const chunkWords = words.slice(i, i + WORDS_PER_CHUNK);
    const chunkText = wrapText(chunkWords.join(" "));
    const safeChunk = escapeFFmpeg(chunkText);
    const safeWord = escapeFFmpeg(words[i]);

    const duration = wordDuration(words[i]);
    const start = currentTime.toFixed(2);
    const end = (currentTime + duration).toFixed(2);
    currentTime += duration;

    // White multiline base
    filters.push(
      `drawtext=fontfile=/opt/render/project/src/Roboto-Bold.ttf:` +
      `text='${safeChunk}':` +
      `fontcolor=white:` +
      `borderw=4:` +
      `bordercolor=black:` +
      `fontsize=${FONT_SIZE}:` +
      `line_spacing=10:` +
      `x=(w-text_w)/2:` +
      `y=h-${BOTTOM_MARGIN}:` +
      `enable='between(t,${start},${end})'`
    );

    // Yellow current word
    filters.push(
      `drawtext=fontfile=/opt/render/project/src/Roboto-Bold.ttf:` +
      `text='${safeWord}':` +
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
  upload.fields([
    { name: "video" },
    { name: "audio" }
  ]),
  async (req, res) => {
    try {
      const video = req.files.video[0].path;
      const audio = req.files.audio[0].path;
      const caption = req.body.caption || "";
      const output = `/tmp/output-${Date.now()}.mp4`;

      const duration = await getAudioDuration(audio);
      const filter = generateDynamicKaraoke(caption, duration);

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
