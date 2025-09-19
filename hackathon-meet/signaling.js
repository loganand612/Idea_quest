const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("ready", () => {
    // Notify other clients a new peer is ready
    socket.broadcast.emit("new-peer");
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

