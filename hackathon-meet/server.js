const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname)));

let waitingClient = null;

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("ready", () => {
    if (waitingClient) {
      // Pair with the waiting client
      socket.emit("start-call", { remoteId: waitingClient, isCaller: true });
      io.to(waitingClient).emit("start-call", { remoteId: socket.id, isCaller: false });
      waitingClient = null; // Reset for the next pair
    } else {
      // Wait for another client
      waitingClient = socket.id;
      socket.emit("wait");
    }
  });

  socket.on("offer", (data) => {
    socket.to(data.socketId).emit("offer", { offer: data.offer, socketId: socket.id });
  });

  socket.on("answer", (data) => {
    socket.to(data.socketId).emit("answer", { answer: data.answer, socketId: socket.id });
  });

  socket.on("ice-candidate", (data) => {
    socket.to(data.socketId).emit("ice-candidate", { candidate: data.candidate, socketId: socket.id });
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    if (waitingClient === socket.id) {
      waitingClient = null;
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});