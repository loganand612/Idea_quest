const socket = io("http://localhost:5000");
const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const statsDiv = document.getElementById("stats");
const leaveBtn = document.getElementById("leaveBtn");

let localStream;
let remoteSocketId = null;

// Initialize local media
async function initMedia() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  socket.emit("ready"); // notify server we are ready
}
initMedia();

// Remote tracks
pc.ontrack = event => { remoteVideo.srcObject = event.streams[0]; };

// ICE candidates
pc.onicecandidate = e => {
  if (e.candidate && remoteSocketId) {
    socket.emit("ice-candidate", { candidate: e.candidate, socketId: remoteSocketId });
  }
};

// Get existing clients
socket.on("all-clients", data => {
  if (data.clients.length > 0) {
    remoteSocketId = data.clients[0]; // pick the first peer
    startCall();
  }
});

// New peer joined
socket.on("new-peer", data => {
  if (!remoteSocketId) {
    remoteSocketId = data.socketId;
    startCall();
  }
});

// Receive offer
socket.on("offer", async data => {
  remoteSocketId = data.socketId;
  await pc.setRemoteDescription(data.offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit("answer", { answer, socketId: remoteSocketId });
});

// Receive answer
socket.on("answer", async data => {
  await pc.setRemoteDescription(data.answer);
});

// Receive ICE candidates
socket.on("ice-candidate", async data => {
  await pc.addIceCandidate(data.candidate);
});

// Start call
async function startCall() {
  if (!remoteSocketId || !localStream) return;
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("offer", { offer, socketId: remoteSocketId });
}
