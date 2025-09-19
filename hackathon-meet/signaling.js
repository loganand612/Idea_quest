const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

let waitingClient = null;

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("ready", () => {
    if (waitingClient) {
      // Pair with the waiting client
      socket.emit("start-call", { remoteId: waitingClient });
      io.to(waitingClient).emit("start-call", { remoteId: socket.id });
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
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});