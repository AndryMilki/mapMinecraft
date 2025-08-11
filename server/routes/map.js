const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const { logWatcherInstance } = require("../components/logReader");
const DATA_DIR = path.join(__dirname, "../data");
const MAPS_DIR = path.join(DATA_DIR, "maps");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

fs.mkdirSync(MAPS_DIR, { recursive: true });

const upload = multer({ dest: MAPS_DIR });

router.post("/upload", upload.single("file"), (req, res) => {
  const tempPath = req.file.path; 
  const targetPath = path.join(MAPS_DIR, "map.png");

  try {
    fs.copyFileSync(tempPath, targetPath);
    fs.unlinkSync(tempPath);
    res.json({ status: "ok", filename: "map.png" });
  } catch (err) {
    console.error("Error while saving:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});


router.post("/set_bounds", express.urlencoded({ extended: true }), (req, res) => {
  const config = {
    top_left: [parseFloat(req.body.top_left_x), parseFloat(req.body.top_left_z)],
    bottom_right: [parseFloat(req.body.bottom_right_x), parseFloat(req.body.bottom_right_z)],
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  res.json({ status: "ok" });
});

router.get("/config", (req, res) => {
  if (fs.existsSync(CONFIG_FILE)) {
    const data = fs.readFileSync(CONFIG_FILE, "utf-8");
    res.json(JSON.parse(data));
  } else {
    res.json({});
  }
});

router.post("/watch", (req, res) => {
  console.log("POST /watch received:", req.body);
  
  let { logFilePath } = req.body;

  if (!logFilePath || typeof logFilePath !== "string") {
    return res.status(400).json({ status: "error", message: "Invalid logFilePath" });
  }

  try {
    let containerPath;

    if (logFilePath.startsWith('/host/Users/')) {
      containerPath = logFilePath;
    } else if (logFilePath.match(/^C:\\Users\\/i)) {
      containerPath = logFilePath
        .replace(/^C:\\Users\\/i, '/host/Users/Андрей/') 
        .replace(/\\/g, '/');
    } else {
      return res.status(400).json({ 
        status: "error", 
        message: "Supports only paths in the C:\\Users\\ folder or /host/Users/ path" 
      });
    }

    console.log("Original path:", logFilePath);
    console.log("Resolved container path:", containerPath);

    if (!fs.existsSync(containerPath)) {
      return res.status(404).json({ 
        status: "error", 
        message: `File not found: ${containerPath}` 
      });
    }

    logWatcherInstance.stop();
    const started = logWatcherInstance.start(containerPath);

    if (started) {
      res.json({ 
        status: "ok", 
        message: `Started watching file: ${containerPath}` 
      });
    } else {
      res.status(500).json({ 
        status: "error", 
        message: "Failed to start watching file" 
      });
    }
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

module.exports = router;
