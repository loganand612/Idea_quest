const socket = io("https://4dadc54b47bf.ngrok-free.app");

const localVideo = document.getElementById("localVideo");
const remoteVideosContainer = document.getElementById('remote-videos');
const engagementDiv = document.getElementById("engagementScore");
const leaveBtn = document.getElementById("leaveBtn");
const statsDiv = document.getElementById("stats");

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

// -------------------------
// Stats (per-peer, non-intrusive)
// -------------------------
const prevSnapshots = {}; // { socketId: { timestamp, audio:{bytesReceived,packetsReceived,packetsLost}, video:{bytesReceived,packetsReceived,packetsLost,framesDecoded} } }

function toKbps(bytesDelta, msDelta) {
  if (msDelta <= 0) return 0;
  return Math.round((bytesDelta * 8) / msDelta);
}

async function collectPeerStats(socketId, pc) {
  const now = Date.now();
  const snapshot = prevSnapshots[socketId] || { timestamp: 0, audio: { bytesReceived: 0, packetsReceived: 0, packetsLost: 0 }, video: { bytesReceived: 0, packetsReceived: 0, packetsLost: 0, framesDecoded: 0 } };

  const reports = await pc.getStats();
  let inboundAudio;
  let inboundVideo;
  let remoteInboundAudio; // how peer perceives our outbound audio
  let remoteInboundVideo; // how peer perceives our outbound video
  let rttMs = null;
  let outKbps = null;
  let inKbps = null;

  reports.forEach(report => {
    if (report.type === 'inbound-rtp') {
      if (report.kind === 'audio') inboundAudio = report;
      if (report.kind === 'video') inboundVideo = report;
    }
    if (report.type === 'remote-inbound-rtp') {
      if (report.kind === 'audio') remoteInboundAudio = report;
      if (report.kind === 'video') remoteInboundVideo = report;
    }
    if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
      if (typeof report.currentRoundTripTime === 'number') rttMs = Math.round(report.currentRoundTripTime * 1000);
      if (typeof report.availableOutgoingBitrate === 'number') outKbps = Math.round(report.availableOutgoingBitrate / 1000);
      if (typeof report.availableIncomingBitrate === 'number') inKbps = Math.round(report.availableIncomingBitrate / 1000);
    }
  });

  const msDelta = snapshot.timestamp ? (now - snapshot.timestamp) : 1000;

  // Audio deltas
  const aBytes = inboundAudio?.bytesReceived || 0;
  const aPkts = inboundAudio?.packetsReceived || 0;
  const aLost = inboundAudio?.packetsLost || 0;
  const aJitterMs = typeof inboundAudio?.jitter === 'number' ? Math.round(inboundAudio.jitter * 1000) : null;
  const aBytesDelta = Math.max(0, aBytes - snapshot.audio.bytesReceived);
  const aPktsDelta = Math.max(0, aPkts - snapshot.audio.packetsReceived);
  const aLostDelta = Math.max(0, aLost - snapshot.audio.packetsLost);
  const aBitrate = toKbps(aBytesDelta, msDelta);
  const aLossPct = (aLostDelta + aPktsDelta) > 0 ? Math.round((aLostDelta / (aLostDelta + aPktsDelta)) * 1000) / 10 : 0;

  // Video deltas
  const vBytes = inboundVideo?.bytesReceived || 0;
  const vPkts = inboundVideo?.packetsReceived || 0;
  const vLost = inboundVideo?.packetsLost || 0;
  const vJitterMs = typeof inboundVideo?.jitter === 'number' ? Math.round(inboundVideo.jitter * 1000) : null;
  const framesDecoded = inboundVideo?.framesDecoded || 0;
  const vBytesDelta = Math.max(0, vBytes - snapshot.video.bytesReceived);
  const vPktsDelta = Math.max(0, vPkts - snapshot.video.packetsReceived);
  const vLostDelta = Math.max(0, vLost - snapshot.video.packetsLost);
  const vBitrate = toKbps(vBytesDelta, msDelta);
  const vLossPct = (vLostDelta + vPktsDelta) > 0 ? Math.round((vLostDelta / (vLostDelta + vPktsDelta)) * 1000) / 10 : 0;
  const fps = snapshot.video.framesDecoded ? Math.max(0, Math.round((framesDecoded - snapshot.video.framesDecoded) * (1000 / msDelta))) : null;

  // Outbound as seen by peer
  const outAudioRttMs = typeof remoteInboundAudio?.roundTripTime === 'number' ? Math.round(remoteInboundAudio.roundTripTime * 1000) : null;
  const outAudioLossPct = typeof remoteInboundAudio?.fractionLost === 'number' ? Math.round(Math.max(0, Math.min(1, remoteInboundAudio.fractionLost)) * 100) : null;
  const outVideoRttMs = typeof remoteInboundVideo?.roundTripTime === 'number' ? Math.round(remoteInboundVideo.roundTripTime * 1000) : null;
  const outVideoLossPct = typeof remoteInboundVideo?.fractionLost === 'number' ? Math.round(Math.max(0, Math.min(1, remoteInboundVideo.fractionLost)) * 100) : null;

  // Resolution from the element
  const remoteEl = document.getElementById(`video-${socketId}`);
  const remoteWidth = remoteEl?.videoWidth || 0;
  const remoteHeight = remoteEl?.videoHeight || 0;

  // Save snapshot
  prevSnapshots[socketId] = {
    timestamp: now,
    audio: { bytesReceived: aBytes, packetsReceived: aPkts, packetsLost: aLost },
    video: { bytesReceived: vBytes, packetsReceived: vPkts, packetsLost: vLost, framesDecoded }
  };

  return { socketId, rttMs, outKbps, inKbps, aBitrate, aJitterMs, aLossPct, vBitrate, vJitterMs, vLossPct, fps, remoteWidth, remoteHeight, outAudioRttMs, outAudioLossPct, outVideoRttMs, outVideoLossPct };
}

setInterval(async () => {
  if (!statsDiv) return;
  const ids = Object.keys(peerConnections);
  if (ids.length === 0) { statsDiv.innerHTML = ''; return; }
  const results = await Promise.all(ids.map(id => collectPeerStats(id, peerConnections[id])));
  const lines = [];
  results.forEach(r => {
    lines.push(`<strong>Peer ${r.socketId}</strong>`);
    if (r.rttMs !== null) lines.push(`RTT: ${r.rttMs} ms`);
    if (r.outKbps !== null) lines.push(`Avail Out: ${r.outKbps} kbps`);
    if (r.inKbps !== null) lines.push(`Avail In: ${r.inKbps} kbps`);
    lines.push(`Audio: ${r.aBitrate} kbps${r.aJitterMs!==null?`, jitter ${r.aJitterMs} ms`:''}, loss ${r.aLossPct}%`);
    lines.push(`Video: ${r.vBitrate} kbps${r.vJitterMs!==null?`, jitter ${r.vJitterMs} ms`:''}, loss ${r.vLossPct}%${r.fps!==null?`, FPS ${r.fps}`:''}, res ${r.remoteWidth}x${r.remoteHeight}`);
    if (r.outAudioLossPct!==null || r.outAudioRttMs!==null || r.outVideoLossPct!==null || r.outVideoRttMs!==null) {
      lines.push(`Outbound (peer view): audio loss ${r.outAudioLossPct??'-'}%, rtt ${r.outAudioRttMs??'-'} ms; video loss ${r.outVideoLossPct??'-'}%, rtt ${r.outVideoRttMs??'-'} ms`);
    }
    lines.push('<br>');
  });
  statsDiv.innerHTML = lines.join('<br>');
}, 1000);