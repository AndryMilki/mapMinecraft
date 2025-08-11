const fs = require("fs");
const express = require("express");
const cors = require("cors");
const path = require("path");
const WebSocket = require("ws");
const wsManager = require("./components/wsManager");
const mapRouter = require("./routes/map");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/map", mapRouter);
app.use("/maps", express.static(path.join(__dirname, "data/maps")));

const server = app.listen(5000, () => {
  console.log("Server is running on port 5000");
});

const wss = new WebSocket.Server({ server, path: "/ws/" });
wss.on("connection", (ws) => {
  wsManager.add(ws);
  console.log("New WebSocket connection");
  ws.on("close", () => wsManager.remove(ws));
});

