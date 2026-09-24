import express from "express";
import multer from "multer";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";

const WATERMARK_PATH = path.resolve("watermark.png");

const app = express();
const upload = multer({ dest: "/tmp" });

app.get("/", (req, res) => {
  res.send("Server running 🚀");
});

app.post("/render", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("Video missing");
  }

  if (!fs.existsSync(WATERMARK_PATH)) {
    try {
      fs.unlinkSync(req.file.path);
    } catch {}

    return res.status(500).send("Watermark PNG missing");
  }

  const videoPath = req.file.path;
  const outputPath = `/tmp/output-${Date.now()}.mp4`;

  const args = [
    "-y",

    "-i",
    videoPath,

    "-i",
    WATERMARK_PATH,

    "-filter_complex",
    `
      [0:v]
      scale=1080:1920:force_original_aspect_ratio=increase,
      crop=1080:1920
      [video];

      [video][1:v]
      overlay=0:0
      [outv]
    `,

    "-map",
    "[outv]",

    "-c:v",
    "libx264",

    "-preset",
    "veryfast",

    "-crf",
    "23",

    "-pix_fmt",
    "yuv420p",

    "-an",

    "-movflags",
    "+faststart",

    outputPath,
  ];

  execFile("ffmpeg", args, (err, stdout, stderr) => {
    if (err) {
      console.error("FFMPEG ERROR:", stderr);

      try {
        fs.unlinkSync(videoPath);
      } catch {}

      return res.status(500).send("Video rendering failed");
    }

    res.setHeader("Content-Type", "video/mp4");

    res.sendFile(path.resolve(outputPath), (sendErr) => {
      if (sendErr) {
        console.error("SEND ERROR:", sendErr.message);
      }

      try {
        fs.unlinkSync(videoPath);
        fs.unlinkSync(outputPath);
      } catch (e) {
        console.error("Cleanup error:", e.message);
      }
    });
  });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Watermark engine running 🚀");
});
