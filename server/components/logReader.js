const fs = require("fs");
const path = require("path");
const wsManager = require("./wsManager");

const BUILDING_TYPES = [
  "Башня лучников",
  "Башня пушкарей",
  "Башня тесла",
  "Корабль лучников",
  "Корабль пушкарей",
  "Корабль тесла",
];

const buildingRegex = new RegExp(
  `Здание\\s*[^\\w\\d\\s]*\\s*(${BUILDING_TYPES.join("|")})\\s*\\((\\d+)%\\)\\s+на координатах\\s+world,(-?\\d+),(-?\\d+),(-?\\d+) повреждено!`
);


let buildings = {};

class LogWatcher {
  constructor() {
    this.logFile = null;
    this.position = 0;
    this.intervalId = null;
  }

  start(logFile) {
    if (!fs.existsSync(logFile)) {
      console.error(`Log file not found: ${logFile}`);
      return false;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      buildings = {}; 
      wsManager.broadcast({ type: "building_clear" }); 
    }

    this.logFile = logFile;
    this.position = fs.statSync(logFile).size;

    this.intervalId = setInterval(() => {
      this.checkUpdates();
    }, 50);

    console.log(`Started watching log file: ${logFile}`);
    return true;
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logFile = null;
      buildings = {};
      wsManager.broadcast({ type: "building_clear" });
      console.log("Stopped watching log file");
    }
  }

  checkUpdates() {
    if (!this.logFile) return;

    try {
      const stats = fs.statSync(this.logFile);
      if (stats.size > this.position) {
        const stream = fs.createReadStream(this.logFile, {
          start: this.position,
          end: stats.size - 1,
          encoding: "utf-8",
        });

        let buffer = "";
        stream.on("data", (chunk) => {
          buffer += chunk;
        });

        stream.on("end", () => {
          this.position = stats.size;

          const lines = buffer.split("\n");

          lines.forEach((line) => {
            const playerRegex =
              /Разведчики засекли игрока ([^\(\s\[]+)(?:\([^\)]*\))?(?:.*?координатах\s+|.*?на координатах\s+)(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*)/;
            const matchPlayer = playerRegex.exec(line);
            if (matchPlayer) {
              const playerName = matchPlayer[1];
              const x = parseFloat(matchPlayer[2]);
              const z = parseFloat(matchPlayer[4]);

              wsManager.broadcast({
                type: "player_position",
                name: playerName,
                x,
                z,
              });
              return;
            }

            const matchBuilding = buildingRegex.exec(line);
            if (matchBuilding) {
              const buildingType = matchBuilding[1];
              const percent = Number(matchBuilding[2]);
              const x = Number(matchBuilding[3]);
              const y = Number(matchBuilding[4]);
              const z = Number(matchBuilding[5]);

              const key = `${x}_${y}_${z}`;
              buildings[key] = {
                buildingType,
                percent,
                coords: { x, y, z },
                timestamp: Date.now(),
              };

              wsManager.broadcast({
                type: "building_damage",
                buildingType,
                percent,
                coords: { x, y, z },
                timestamp: buildings[key].timestamp,
              });
            }
          });
        });
      }

      const now = Date.now();
      const timeoutMs = 3 * 60 * 1000;

      Object.entries(buildings).forEach(([key, data]) => {
        if (data.percent >= 60 && now - data.timestamp > timeoutMs) {
          wsManager.broadcast({
            type: "building_remove",
            coords: data.coords,
          });
          delete buildings[key];
        }
      });
    } catch (err) {
      console.error("Error reading log file:", err);
    }
  }
}

const logWatcherInstance = new LogWatcher();

module.exports = {
  startLogWatcher: (logDir) => logWatcherInstance.start(logDir),
  stopLogWatcher: () => logWatcherInstance.stop(),
  logWatcherInstance,
};
