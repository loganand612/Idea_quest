const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use(express.static(path.join(__dirname)));
app.use('/models', express.static(path.join(__dirname, 'models')));

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Tell the new client about existing peers
  socket.broadcast.emit("new-peer", { socketId: socket.id });

  socket.on("offer", (data) => {
    socket.to(data.socketId).emit("offer", {
      offer: data.offer,
      socketId: socket.id
    });
  });

  socket.on("answer", (data) => {
    socket.to(data.socketId).emit("answer", {
      answer: data.answer,
      socketId: socket.id
    });
  });

  socket.on("ice-candidate", (data) => {
    socket.to(data.socketId).emit("ice-candidate", {
      candidate: data.candidate,
      socketId: socket.id
    });
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    socket.broadcast.emit("peer-disconnected", { socketId: socket.id });
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});