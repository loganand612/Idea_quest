const socket = io("http://localhost:5000");
const peerConnection = new RTCPeerConnection({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
});

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const statsDiv = document.getElementById("stats");
const leaveBtn = document.getElementById("leaveBtn");

let localStream;
let isCaller = false;
let remoteSocketId = null;

// Get local media and add tracks
async function initMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  } catch (err) {
    console.error("Error accessing media devices:", err);
  }
}

initMedia();

// Handle incoming remote tracks
peerConnection.ontrack = event => {
  console.log("Received remote track event:", event);
  if (event.streams && event.streams[0]) {
    console.log("Setting remote video srcObject");
    remoteVideo.srcObject = event.streams[0];
  } else {
    console.warn("No streams found in ontrack event");
  }
};

// Send ICE candidates to remote peer
peerConnection.onicecandidate = event => {
  if (event.candidate && remoteSocketId) {
    socket.emit("ice-candidate", { candidate: event.candidate, socketId: remoteSocketId });
  }
};

// Socket events

socket.on("connect", () => {
  console.log("Connected with ID:", socket.id);
  socket.emit("ready"); // notify server we are ready
});

socket.on("start-call", (data) => {
  console.log("Received start-call:", data);
  remoteSocketId = data.remoteId;
  isCaller = true; // The server has designated this client as the caller
  startCall();
});

socket.on("wait", () => {
  console.log("Waiting for another peer...");
});

socket.on("offer", async data => {
  console.log("Received offer:", data);
  remoteSocketId = data.socketId;
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit("answer", { answer, socketId: remoteSocketId });
});

socket.on("answer", async data => {
  console.log("Received answer:", data);
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
});

socket.on("ice-candidate", async data => {
  console.log("Received ICE candidate:", data);
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
  } catch (err) {
    console.error("Error adding ICE candidate:", err);
  }
});

// Start call as caller
async function startCall() {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit("offer", { offer, socketId: remoteSocketId });
}

// Stats panel
setInterval(async () => {
  if (!peerConnection) return;
  const stats = await peerConnection.getStats();
  let statsText = '';
  stats.forEach(report => {
    if (report.type === 'inbound-rtp' && report.kind === 'video') {
      if (report.bitrateMean !== undefined) statsText += `Bitrate: ${Math.round(report.bitrateMean/1000)} kbps<br>`;
      statsText += `Packet Loss: ${report.packetsLost || 0}<br>`;
    }
  });
  statsDiv.innerHTML = statsText;
}, 1000);

// Leave button
leaveBtn.onclick = () => {
  if (localStream) localStream.getTracks().forEach(track => track.stop());
  if (peerConnection) peerConnection.close();
  remoteVideo.srcObject = null;
  localVideo.srcObject = null;
  socket.disconnect();
  console.log("Call ended");
};