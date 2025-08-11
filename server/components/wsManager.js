const WebSocket = require('ws');

const wsManager = {
  clients: new Set(),

  add(ws) {
    this.clients.add(ws);
  },

  remove(ws) {
    this.clients.delete(ws);
  },

  broadcast(data) {
    const message = typeof data === "string" ? data : JSON.stringify(data);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
};

module.exports = wsManager;
