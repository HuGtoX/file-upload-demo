const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = 8080;
const UPLOAD_DIR = path.join(__dirname, "uploads");

const corsOptions = {
  origin: true,
  methods: ["GET", "POST", "PUT", "HEAD", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Content-Range", "Authorization"],
  exposedHeaders: ["Content-Length", "Content-Range"],
};

app.use(cors(corsOptions));

// 添加OPTIONS请求处理
app.options("*", cors(corsOptions));

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());

// 处理文件上传（断点续传）
app.put("/upload/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    const contentRange = req.headers["content-range"];

    if (!contentRange) {
      return res.status(400).send("Content-Range header required");
    }

    const match = contentRange.match(/bytes (\d+)-(\d+)\/(\d+|\*)/);
    if (!match) {
      return res.status(400).send("Invalid Content-Range format");
    }

    const start = parseInt(match[1], 10);
    const filePath = path.join(UPLOAD_DIR, filename);

    // 获取当前文件大小
    let currentSize = 0;
    try {
      const stats = await fs.promises.stat(filePath);
      currentSize = stats.size;
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }

    // 验证起始位置
    if (start !== currentSize) {
      res.set("Content-Range", `bytes */${currentSize}`);
      return res.status(416).send("Invalid chunk position");
    }

    // 创建可写流（追加模式）
    const writeStream = fs.createWriteStream(filePath, {
      flags: "a",
    });

    req.pipe(writeStream);

    writeStream.on("finish", () => {
      res.status(200).send("Chunk uploaded successfully");
    });

    writeStream.on("error", (err) => {
      console.error("Write error:", err);
      res.status(500).send("Upload failed");
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// 处理文件下载（支持断点续传）
app.get("/download/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(UPLOAD_DIR, filename);
    const stats = await fs.promises.stat(filePath);
    const fileSize = stats.size;

    // 处理范围请求
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.status(416).header("Content-Range", `bytes */${fileSize}`);
        return res.end();
      }

      const chunkSize = end - start + 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": "application/octet-stream",
      });

      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.header({
        "Content-Length": fileSize,
        "Content-Type": "application/octet-stream",
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    if (err.code === "ENOENT") {
      res.status(404).send("File not found");
    } else {
      console.error(err);
      res.status(500).send("Download failed");
    }
  }
});

// 获取文件信息（用于续传）
app.head("/upload/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(UPLOAD_DIR, filename);
    const stats = await fs.promises.stat(filePath);

    res
      .header({
        "Content-Length": stats.size,
        "Accept-Ranges": "bytes",
      })
      .end();
  } catch (err) {
    res.status(404).end();
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
