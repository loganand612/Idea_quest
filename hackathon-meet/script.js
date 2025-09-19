const socket = io("https://4dadc54b47bf.ngrok-free.app");

const localVideo = document.getElementById("localVideo");
const remoteVideosContainer = document.getElementById('remote-videos');
const engagementDiv = document.getElementById("engagementScore");
const leaveBtn = document.getElementById("leaveBtn");

const peerConnections = {};
let localStream;

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
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
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
    if (detections.length > 0 && detections[0].score) {
        const engagement = (detections[0].score * 100).toFixed(2);
        engagementDiv.innerText = `Engagement: ${engagement}%`;
    } else {
        engagementDiv.innerText = "Engagement: 0%";
    }
}

function createPeerConnection(socketId, isCaller) {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    pc.onicecandidate = event => {
        if (event.candidate) {
            socket.emit("ice-candidate", { candidate: event.candidate, socketId: socketId });
        }
    };

    pc.ontrack = event => {
        let remoteVideo = document.getElementById(`video-${socketId}`);
        if (!remoteVideo) {
            remoteVideo = document.createElement('video');
            remoteVideo.id = `video-${socketId}`;
            remoteVideo.autoplay = true;
            remoteVideo.playsinline = true;
            remoteVideosContainer.appendChild(remoteVideo);
        }
        if (!remoteVideo.srcObject) {
            remoteVideo.srcObject = new MediaStream();
        }
        remoteVideo.srcObject.addTrack(event.track);
    };

    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    peerConnections[socketId] = pc;

    if (isCaller) {
        pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
                socket.emit("offer", { offer: pc.localDescription, socketId: socketId });
            });
    }

    return pc;
}

socket.on("new-peer", data => {
    console.log("New peer connected:", data.socketId);
    createPeerConnection(data.socketId, true);
});

socket.on("offer", async data => {
    console.log("Received offer from:", data.socketId);
    const pc = createPeerConnection(data.socketId, false);
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("answer", { answer: pc.localDescription, socketId: data.socketId });
});

socket.on("answer", async data => {
    console.log("Received answer from:", data.socketId);
    const pc = peerConnections[data.socketId];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
});

socket.on("ice-candidate", async data => {
    console.log("Received ICE candidate from:", data.socketId);
    const pc = peerConnections[data.socketId];
    if (pc && data.candidate) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
            console.error("Error adding ICE candidate:", err);
        }
    }
});

socket.on("peer-disconnected", data => {
    console.log("Peer disconnected:", data.socketId);
    const pc = peerConnections[data.socketId];
    if (pc) {
        pc.close();
        delete peerConnections[data.socketId];
    }
    const remoteVideo = document.getElementById(`video-${data.socketId}`);
    if (remoteVideo) {
        remoteVideo.remove();
    }
});

leaveBtn.onclick = () => {
  if (localStream) localStream.getTracks().forEach(track => track.stop());
  for (const socketId in peerConnections) {
      if(peerConnections[socketId]) {
        peerConnections[socketId].close();
      }
  }
  remoteVideosContainer.innerHTML = '';
  localVideo.srcObject = null;
  socket.disconnect();
  console.log("Call ended");
};

async function main() {
    await loadFaceAPI();
    await initMedia();
    setInterval(detectFace, 1000);
}

main();