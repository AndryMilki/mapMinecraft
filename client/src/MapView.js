import React, { useEffect, useState, useRef } from "react";
import L from "leaflet";

export default function MapView() {
  const mapRef = useRef(null);
  const [config, setConfig] = useState(null);
  const [players, setPlayers] = useState([]);
  const playersRef = useRef({});
  const [buildings, setBuildings] = useState({});
  const buildingsRef = useRef({});
  const [ws, setWs] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [cursorCoords, setCursorCoords] = useState(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [imgSize, setImgSize] = useState({ width: 1280, height: 634 });
  const [logFilePath, setLogFilePath] = useState("");
  const [logWatching, setLogWatching] = useState(false);
  const [logWatchMsg, setLogWatchMsg] = useState(null);
  const [logWatchLoading, setLogWatchLoading] = useState(false);
  const PLAYER_TIMEOUT_MS = 10000;
  const BUILDING_REMOVE_TIMEOUT_MS = 3 * 60 * 1000;
  const DISTANCE_THRESHOLD = 15;

  function distance2D(x1, z1, x2, z2) {
    const dx = x1 - x2;
    const dz = z1 - z2;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function groupNearbyPlayers(players) {
    const clusters = [];
    const visited = new Set();

    players.forEach((player, i) => {
      if (visited.has(i)) return;

      const cluster = [player];
      visited.add(i);

      players.forEach((other, j) => {
        if (i === j || visited.has(j)) return;
        if (distance2D(player.x, player.z, other.x, other.z) <= DISTANCE_THRESHOLD) {
          cluster.push(other);
          visited.add(j);
        }
      });

      clusters.push(cluster);
    });

    return clusters;
  }

const playerIcon = (name, y) => {
  let borderColor = "black";

  if (y > 200) {
    borderColor = "blue";
  } else if (y >= 63 && y <= 180) {
    borderColor = "red";
  } else if (y >= 0 && y <= 62) {
    borderColor = "black";
  }

return L.divIcon({
  className: "player-icon",
  html: `
    <div style="
      background-image: url('https://mc-heads.net/avatar/${name}/32');
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 4px solid ${borderColor};
      background-size: cover;
    "></div>
  `,
  iconSize: [32, 32],
});
};

  const clusterIcon = (count) =>
    L.divIcon({
      className: "player-cluster-icon",
      html: `<div style="
        background-color: rgba(0, 0, 0, 0.7);
        color: white;
        font-weight: bold;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        display: flex;
        justify-content: center;
        align-items: center;
        border: 2px solid white;
        font-size: 14px;
        user-select: none;
      ">
        +${count}
      </div>`,
      iconSize: [32, 32],
    });

  const buildingIcons = {
    "Башня лучников": "/icons/archerIcon.png",
    "Башня пушкарей": "/icons/cannonIcon.png",
    "Башня тесла": "/icons/teslaIcon.png",
    "Корабль лучников": "/icons/archerShipIcon.png",
    "Корабль пушкарей": "/icons/cannonShipIcon.png",
  };

  function buildingIcon(buildingType, percent) {
    let borderColor = "black";
    if (percent >= 60) borderColor = "green";
    else if (percent >= 20) borderColor = "red";

    return L.divIcon({
      className: "building-icon",
      html: `<div style="
        background-image: url('${buildingIcons[buildingType] || buildingIcons['Башня лучников']}');
        width: 20px;
        height: 20px;
        background-size: contain;
        background-repeat: no-repeat;
        border: 3px solid ${borderColor};
        border-radius: 6px;
        box-sizing: border-box;
      "></div>`,
      iconSize: [20, 20],
      iconAnchor: [12, 12],
    });
  }

  function mcToImageCoords(x, z) {
    if (!config) return [0, 0];

    const minX = Math.min(config.top_left[0], config.bottom_right[0]);
    const maxX = Math.max(config.top_left[0], config.bottom_right[0]);
    const minZ = Math.min(config.top_left[1], config.bottom_right[1]);
    const maxZ = Math.max(config.top_left[1], config.bottom_right[1]);

    const normX = (x - minX) / (maxX - minX);
    const normZ = (z - minZ) / (maxZ - minZ);

    const px = normX * imgSize.width;
    const py = (1 - normZ) * imgSize.height;

    return [px, py];
  }

  function imageCoordsToMC(px, py) {
    if (!config) return null;

    const minX = Math.min(config.top_left[0], config.bottom_right[0]);
    const maxX = Math.max(config.top_left[0], config.bottom_right[0]);
    const minZ = Math.min(config.top_left[1], config.bottom_right[1]);
    const maxZ = Math.max(config.top_left[1], config.bottom_right[1]);

    const normX = px / imgSize.width;
    const normZ = 1 - py / imgSize.height;

    const x = minX + normX * (maxX - minX);
    const z = minZ + normZ * (maxZ - minZ);

    return { x: x.toFixed(1), z: z.toFixed(1) };
  }

  useEffect(() => {
    fetch(`/map/config`)
      .then((res) => res.json())
      .then(setConfig)
      .catch(console.error);
  }, [refreshCounter]);

  useEffect(() => {
    if (!config) return;

    const imageUrl = `/maps/map.png?v=${refreshCounter}`;
    const img = new Image();
    img.onload = () => {
      setImgSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = imageUrl;
  }, [config, refreshCounter]);

  useEffect(() => {
    if (!config || !imgSize.width || !imgSize.height) return;

    if (mapRef.current) {
      mapRef.current.off();
      mapRef.current.remove();
      mapRef.current = null;
    }

    const bounds = [
      [0, 0],
      [imgSize.height, imgSize.width],
    ];

    const map = L.map("map", {
      crs: L.CRS.Simple,
      minZoom: -5,
      maxZoom: 5,
      zoomControl: true,
    });

    const imageUrl = `/maps/map.png?v=${refreshCounter}`;

    L.imageOverlay(imageUrl, bounds).addTo(map);
    map.fitBounds(bounds);

    mapRef.current = map;

    if (ws) {
      ws.close();
      setWs(null);
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/`);

    socket.onopen = () => {
      console.log("WebSocket connected");
    };

    socket.onmessage = (event) => {
      try {
        
        const data = JSON.parse(event.data);
        console.log("WS message:", data);
        
        if (data.type === "player_position" && data.name) {
          playersRef.current[data.name] = {
            x: Number(data.x),
            y: Number(data.y),
            z: Number(data.z),
            lastSeen: Date.now(),
          };
          setPlayers(
            Object.entries(playersRef.current).map(([name, pos]) => ({
              name,
              x: Number(pos.x),
              y: Number(pos.y),
              z: Number(pos.z),
            }))
          );
        }

        if (data.type === "building_damage") {
          const key = `${data.coords.x}_${data.coords.y}_${data.coords.z}`;
          buildingsRef.current[key] = {
            buildingType: data.buildingType,
            percent: data.percent,
            coords: data.coords,
            lastSeen: Date.now(),
          };
          setBuildings({ ...buildingsRef.current });
        }

        if (data.type === "building_remove") {
          const key = `${data.coords.x}_${data.coords.y}_${data.coords.z}`;
          delete buildingsRef.current[key];
          setBuildings({ ...buildingsRef.current });
        }
      } catch (e) {
        console.error(e);
      }
    };

    socket.onclose = () => {
      console.log("WebSocket closed");
    };

    map.on("mousemove", (e) => {
      if (!config) return;
      const { lat, lng } = e.latlng;
      const mcCoords = imageCoordsToMC(lng, lat);
      if (mcCoords) {
        setCursorCoords(mcCoords);
      } else {
        setCursorCoords(null);
      }
    });

    setWs(socket);

    return () => {
      if (mapRef.current) {
        mapRef.current.off();
        mapRef.current.remove();
        mapRef.current = null;
      }
      socket.close();
    };
  }, [config, refreshCounter, imgSize]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      let changed = false;
      Object.entries(playersRef.current).forEach(([name, pos]) => {
        if (now - pos.lastSeen > PLAYER_TIMEOUT_MS) {
          delete playersRef.current[name];
          changed = true;
        }
      });
      if (changed) {
        setPlayers(
          Object.entries(playersRef.current).map(([name, pos]) => ({
            name,
            x: Number(pos.x),
            y: Number(pos.y),
            z: Number(pos.z),
          }))
        );
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!Object.keys(buildings).length) return;

    const interval = setInterval(() => {
      const now = Date.now();
      let changed = false;
      Object.entries(buildingsRef.current).forEach(([key, data]) => {
        if (data.percent >= 60 && now - data.lastSeen > BUILDING_REMOVE_TIMEOUT_MS) {
          delete buildingsRef.current[key];
          changed = true;
        }
      });
      if (changed) {
        setBuildings({ ...buildingsRef.current });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [buildings]);

  useEffect(() => {
  if (!mapRef.current) return;

  mapRef.current.eachLayer((layer) => {
    if (layer instanceof L.Marker) {
      mapRef.current.removeLayer(layer);
    }
  });

  const clusters = groupNearbyPlayers(players);

  clusters.forEach((cluster) => {
    const { x, y, z } = cluster[0];
    const [px, py] = mcToImageCoords(x, z);

    if (cluster.length === 1) {
      const { name } = cluster[0];
      L.marker([py, px], { icon: playerIcon(name, y) })
        .addTo(mapRef.current)
        .bindPopup(`${name} (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
    } else {
      L.marker([py, px], { icon: clusterIcon(cluster.length) })
        .addTo(mapRef.current)
        .bindPopup(
          cluster
            .map((p) => `${p.name} (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`)
            .join("<br>")
        );
    }
  });

  Object.values(buildings).forEach(({ buildingType, percent, coords }) => {
    const [px, py] = mcToImageCoords(coords.x, coords.z);
    L.marker([py, px], { icon: buildingIcon(buildingType, percent) })
      .addTo(mapRef.current)
      .bindPopup(`${buildingType} (${percent}%)`);
  });
}, [players, buildings, config, imgSize]);


  async function handleUpload(e) {
    e.preventDefault();
    setUploading(true);

    const form = e.target;
    const file = form.file.files[0];
    const top_left_x = form.top_left_x.value;
    const top_left_z = form.top_left_z.value;
    const bottom_right_x = form.bottom_right_x.value;
    const bottom_right_z = form.bottom_right_z.value;

    if (!file || !top_left_x || !top_left_z || !bottom_right_x || !bottom_right_z) {
      alert("Все поля должны быть заполнены");
      setUploading(false);
      return;
    }

    const data = new FormData();
    data.append("file", file);

    try {
      let res = await fetch(`/map/upload`, {
        method: "POST",
        body: data,
      });
      let json = await res.json();
      if (json.status !== "ok") throw new Error("Ошибка загрузки файла");

      res = await fetch("/map/set_bounds", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          top_left_x,
          top_left_z,
          bottom_right_x,
          bottom_right_z,
        }),
      });
      json = await res.json();
      if (json.status !== "ok") throw new Error("Ошибка установки границ");

      alert("Карта обновлена!");
      setRefreshCounter((c) => c + 1);
    } catch (err) {
      alert("Ошибка: " + err.message);
    }

    setUploading(false);
  }

  async function handleLogWatch(e) {
    e.preventDefault();
    setLogWatchLoading(true);
    setLogWatchMsg(null);

    try {
      const res = await fetch(`/map/watch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logFilePath }),
      });
      const json = await res.json();

      if (json.status === "ok") {
        setLogWatching(true);
        setLogWatchMsg({ type: "success", text: json.message || "Слежение запущено" });
        setRefreshCounter((c) => c + 1); 
      } else {
        setLogWatching(false);
        setLogWatchMsg({ type: "error", text: json.message || "Ошибка запуска слежения" });
      }
    } catch (err) {
      setLogWatching(false);
      setLogWatchMsg({ type: "error", text: err.message });
    }

    setLogWatchLoading(false);
  }

  return (
    <>
<div style={{ display: "flex" }}>
  <div id="map" style={{ height: "60vh", width: "75%" }}></div>

  <div style={{
    width: "25%",
    display: "flex",
    flexDirection: "column",
    padding: "10px",
    boxSizing: "border-box",
    background: "#f9f9f9",
    borderLeft: "1px solid #ccc"
    }}>
    <div style={{ flex: "0 0 auto", marginBottom: "10px", textAlign: "center" }}>
      <img
        src="importantGif.gif"
        style={{ maxWidth: "100%", height: "auto", borderRadius: "8px" }}
      />
    </div>
    <div style={{
        flex: "1 1 auto",
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: "6px",
        padding: "8px",
        overflowY: "auto"
        }}>
        <h4 style={{ marginTop: 4,textAlign: "center" }}>Легенда карты</h4>
        <ul style={{ paddingLeft: "12px", margin: 0 }}>
          <li><span style={{ color: "red" }}>●</span> Игроки на средней высоте (63–180), </li>
          <li><span style={{ color: "blue" }}>●</span> Игроки высоко (&gt;200), </li>
          <li><span style={{ color: "black" }}>●</span> Игроки низко (&lt;63) </li>
          <li><img src="/icons/archerIcon.png" alt="Башня лучников" style={{ height: "16px", verticalAlign: "middle" }} /> - Башня лучников</li>
          <li><img src="/icons/cannonIcon.png" alt="Башня пушкарей" style={{ height: "16px", verticalAlign: "middle" }} /> - Башня пушкарей</li>
          <li><img src="/icons/teslaIcon.png" alt ="Башня тесла" style={{ height: "16px", verticalAlign: "middle" }} /> - Башня тесла</li>
          <li><img src="/icons/archerShipIcon.png" alt ="Корабль лучников" style={{ height: "16px", verticalAlign: "middle" }} /> - Корабль лучников</li>
          <li><img src="/icons/battleShipIcon.png" alt ="Корабль пушкарей" style={{ height: "16px", verticalAlign: "middle" }} /> - Корабль пушкарей</li>
          <li>Зеленая обводка - (100% - 60%), Красная обводка - (60% - 20%), Черная обводка - (20% - 0%) (ПОСТРОЙКИ!)</li>
        </ul>
    </div>
  </div>
</div>

      {cursorCoords && (
        <div style={{ marginTop: 10 }}>
          Координаты Minecraft: X = {cursorCoords.x}, Z = {cursorCoords.z}
        </div>
      )}
      <div
  style={{
    display: "flex",
    gap: "20px",
    alignItems: "stretch", 
  }}
>
  <form
    onSubmit={handleUpload}
    style={{
      marginTop: 20,
      padding: 10,
      flex: "1",
      border: "1px solid #ccc",
      borderRadius: "8px",
      background: "#f9f9f9",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between", 
    }}
  >
    <h3>Загрузить карту и установить границы</h3>
    <div>
      <input type="file" name="file" accept="image/*" />
    </div>
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        maxWidth: "300px",
      }}
    >
      <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        Верхний левый X:
        <input type="number" name="top_left_x" step="0.1" style={{ width: "150px" }} />
      </label>
      <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        Верхний левый Z:
        <input type="number" name="top_left_z" step="0.1" style={{ width: "150px" }} />
      </label>
      <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        Нижний правый X:
        <input type="number" name="bottom_right_x" step="0.1" style={{ width: "150px" }} />
      </label>
      <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        Нижний правый Z:
        <input type="number" name="bottom_right_z" step="0.1" style={{ width: "150px" }} />
      </label>
      <button disabled={uploading} type="submit">
        {uploading ? "Загрузка..." : "Обновить карту"}
      </button>
    </div>
  </form>

  <div
    style={{
      flex: "1",
      background: "#fff7e6",
      border: "1px solid #f0c36d",
      borderRadius: "8px",
      padding: 10,
      marginTop: 20,
    }}
  >
    <h3>Инструкция</h3>
    <ol>
      <li>Выберите файл скриншота карты (PNG, JPG).</li>
      <li>При загрузке карты необходимо запомнить координаты верхнего левого и нижнего правого угла.</li>
      <li>Заполните соответствующие поля с координатами.</li>
      <li>Нажмите <b>Обновить карту</b>.</li>
      <li>Дождитесь сообщения об успешной загрузке.</li>
      <li>Предоставьте путь к документу latest.log, предположительный путь написан ниже.</li>
    </ol>
  </div>
</div>

      <form onSubmit={handleLogWatch} style={{ marginTop: 30, padding: 10, borderTop: "1px solid #ccc" }}>
        <h3>Выбрать файл логов для слежения</h3>
        <div>
          <input
            type="text"
            placeholder="Путь к файлу логов, например C:\\Users\\Андрей\\.cristalix\\updates\\Minigames\\logs\\latest.log"
            value={logFilePath}
            onChange={(e) => setLogFilePath(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <button disabled={logWatchLoading || !logFilePath.trim()} type="submit" style={{ marginTop: 10 }}>
          {logWatchLoading ? "Запуск..." : "Начать слежение"}
        </button>
        {logWatchMsg && (
          <div style={{ marginTop: 10, color: logWatchMsg.type === "error" ? "red" : "green" }}>
            {logWatchMsg.text}
          </div>
        )}
      </form>
    </>
  );
}