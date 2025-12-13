import express from "express";
import multer from "multer";
import { exec } from "child_process";
import fs from "fs";

const app = express();
const upload = multer({ dest: "/tmp" });

app.post("/merge", upload.fields([
  { name: "video" },
  { name: "audio" }
]), (req, res) => {
  const video = req.files.video[0].path;
  const audio = req.files.audio[0].path;
  const output = `/tmp/output-${Date.now()}.mp4`;

  exec(
    `ffmpeg -i ${video} -i ${audio} -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -shortest ${output}`,
    (err) => {
      if (err) return res.status(500).send(err.message);
      res.sendFile(output, () => {
        fs.unlinkSync(video);
        fs.unlinkSync(audio);
        fs.unlinkSync(output);
      });
    }
  );
});

app.listen(process.env.PORT || 3000);
