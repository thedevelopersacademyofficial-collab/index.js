import express from "express";
import multer from "multer";
import { exec } from "child_process";
import fs from "fs";

// =======================
// CONFIG
// =======================
const FONT_SIZE = 37;
const BOTTOM_MARGIN = 260;

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

      // ✅ MULTILINE TEXT FILE (THIS IS THE KEY)
      const textContent = `Porosit ne mesazhe apo
Whatsapp: +383 49 37 30 37`;

      const textFile = `/tmp/text-${Date.now()}.txt`;
      fs.writeFileSync(textFile, textContent, "utf8");

      const drawtext =
        `drawtext=` +
        `fontfile=/opt/render/project/src/Roboto-Bold.ttf:` +
        `textfile=${textFile}:` +
        `fontcolor=white:` +
        `borderw=4:` +
        `bordercolor=black:` +
        `fontsize=${FONT_SIZE}:` +
        `line_spacing=14:` +
        `x=(w-text_w)/2:` +
        `y=h-${BOTTOM_MARGIN}`;

      const ffmpegCmd =
        `ffmpeg -y -i ${video} -i ${audio} ` +
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
