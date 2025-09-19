const socket = io("http://localhost:5000");
const pc = new RTCPeerConnection();

// Video elements
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const statsDiv = document.getElementById("stats");

// Get local stream
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  localVideo.srcObject = stream;
  stream.getTracks().forEach(track => pc.addTrack(track, stream));
});

// Remote stream
pc.ontrack = event => remoteVideo.srcObject = event.streams[0];

// ICE candidates
pc.onicecandidate = event => {
  if (event.candidate) socket.emit("ice-candidate", { candidate: event.candidate, socketId: remoteSocketId });
};

// Offer/answer handling via Socket.IO
socket.on("offer", async data => {
  await pc.setRemoteDescription(data.offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit("answer", { answer, socketId: data.socketId });
});

socket.on("answer", async data => await pc.setRemoteDescription(data.answer));
socket.on("ice-candidate", async data => await pc.addIceCandidate(data.candidate));

// Stats panel (frontend)
setInterval(async () => {
  if (!pc) return;
  const stats = await pc.getStats();
  let statsText = '';
  stats.forEach(report => {
    if (report.type === 'inbound-rtp' && report.kind === 'video') {
      statsText += `Bitrate: ${Math.round(report.bitrateMean/1000)} kbps<br>`;
      statsText += `Packet Loss: ${report.packetsLost}<br>`;
    }
  });
  statsDiv.innerHTML = statsText;
}, 1000);
