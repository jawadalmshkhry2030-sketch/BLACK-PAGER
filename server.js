const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

io.on("connection", (socket) => {
  let lastMessage = 0;

  socket.on("send-message", (message) => {
    if (typeof message !== "string") return;
    if (!message.trim() || message.length > 200) return;

    const now = Date.now();
    if (now - lastMessage < 700) return;
    lastMessage = now;

    socket.broadcast.emit("pager-message", message);
    socket.emit("send-success");
  });
});

const PORT = process.env.PORT || 8080;

server.listen(PORT, "0.0.0.0", () => {
  console.log("BLACK PAGER running on port " + PORT);
});
