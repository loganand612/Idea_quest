const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send existing clients to new client
  const otherClients = Array.from(io.sockets.sockets.keys()).filter(id => id !== socket.id);
  socket.emit("all-clients", { clients: otherClients });

  // Notify all other clients that a new peer joined
  socket.broadcast.emit("new-peer", { socketId: socket.id });

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

