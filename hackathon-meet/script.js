const socket = io("http://localhost:3002");
const peerConnection = new RTCPeerConnection({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
});

// Add this for debugging
peerConnection.oniceconnectionstatechange = () => {
  console.log(`ICE Connection State: ${peerConnection.iceConnectionState}`);
};

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const statsDiv = document.getElementById("stats");
const engagementDiv = document.getElementById("engagementScore");
const leaveBtn = document.getElementById("leaveBtn");

const remoteStream = new MediaStream();
remoteVideo.srcObject = remoteStream;

let localStream;
let isCaller = false;
let remoteSocketId = null;

// Load face-api.js models
async function loadFaceAPI() {
  console.log("Loading face-api models...");
  await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
  console.log("Models loaded.");
}

// Get local media
async function initMedia() {
  console.log("Initializing media...");
  try {
    console.log("Requesting user media...");
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    console.log("Got local stream:", localStream);
    localVideo.srcObject = localStream;
    console.log("Set local video srcObject.");
    localStream.getTracks().forEach(track => {
      console.log("Adding local track to peer connection:", track);
      peerConnection.addTrack(track, localStream);
    });
    console.log("Media initialized, signaling ready.");
    socket.emit("ready"); // Emit ready after media is set up
  } catch (err) {
    console.error("Error accessing media devices:", err);
    alert(`Error accessing media devices: ${err.name} - ${err.message}`);
  }
}

// Face detection
async function detectFace() {
    if (!localStream || !localVideo.srcObject || localVideo.paused || localVideo.ended || !faceapi.nets.tinyFaceDetector.params) {
        return;
    }

    const detections = await faceapi.detectAllFaces(localVideo, new faceapi.TinyFaceDetectorOptions());

    if (detections.length > 0) {
        const engagement = (detections[0].score * 100).toFixed(2);
        engagementDiv.innerText = `Engagement: ${engagement}%`;
    } else {
        engagementDiv.innerText = "Engagement: 0%";
    }
}

async function main() {
    await loadFaceAPI();
    await initMedia();
    setInterval(detectFace, 1000);
}

main();


// Handle remote tracks
peerConnection.ontrack = event => {
  console.log("Got remote track.");
  remoteStream.addTrack(event.track);
};

// ICE candidates
peerConnection.onicecandidate = event => {
  console.log("Got ICE candidate.");
  if (event.candidate && remoteSocketId) {
    console.log("Sending ICE candidate to remote peer.");
    socket.emit("ice-candidate", { candidate: event.candidate, socketId: remoteSocketId });
  }
};

// Socket.IO events
socket.on("connect", () => {
  console.log("Connected with ID:", socket.id);
});

socket.on("start-call", data => {
  console.log("Received start-call:", data);
  remoteSocketId = data.remoteId;
  isCaller = data.isCaller;
  if (isCaller) {
    console.log("I am the caller.");
    startCall();
  } else {
    console.log("I am the callee.");
  }
});

socket.on("wait", () => console.log("Waiting for another peer..."));

socket.on("offer", async data => {
  console.log("Received offer.");
  remoteSocketId = data.socketId;
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
  console.log("Set remote description from offer.");
  const answer = await peerConnection.createAnswer();
  console.log("Created answer.");
  await peerConnection.setLocalDescription(answer);
  console.log("Set local description from answer.");
  socket.emit("answer", { answer, socketId: remoteSocketId });
  console.log("Sent answer.");
});

socket.on("answer", async data => {
  console.log("Received answer.");
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  console.log("Set remote description from answer.");
});

socket.on("ice-candidate", async data => {
  console.log("Received ICE candidate.");
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    console.log("Added ICE candidate.");
  } catch (err) {
    console.error("Error adding ICE candidate:", err);
  }
});

// Start call as caller
async function startCall() {
  console.log("Starting call...");
  const offer = await peerConnection.createOffer();
  console.log("Created offer.");
  await peerConnection.setLocalDescription(offer);
  console.log("Set local description from offer.");
  socket.emit("offer", { offer, socketId: remoteSocketId });
  console.log("Sent offer.");
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