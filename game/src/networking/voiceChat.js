// Simple voice chat for 1v1 multiplayer.
// Piggybacks on the existing PeerJS peer with a MediaConnection alongside the
// game's DataConnection. Host answers incoming calls; guest dials the host
// after the data channel is open. Mic permission is requested explicitly from
// the lobby — no implicit prompt on game start.

import { getPeer, getRemotePeerId } from './peerConnection.js';

const VOICE_ENABLED_KEY = 'grog.voiceEnabled';
const VOICE_MUTED_KEY = 'grog.voiceMuted';

let localStream = null;
let mediaCall = null;
let remoteAudioEl = null;
let muted = false;
let enabled = false;
let remoteSpeaking = false;

// ============================================================
// Persistence
// ============================================================

export function readVoicePreference() {
    try {
        return localStorage.getItem(VOICE_ENABLED_KEY) === '1';
    } catch (e) {
        return false;
    }
}

export function writeVoicePreference(value) {
    try {
        localStorage.setItem(VOICE_ENABLED_KEY, value ? '1' : '0');
    } catch (e) { /* ignore */ }
}

function readMutedPreference() {
    try {
        return localStorage.getItem(VOICE_MUTED_KEY) === '1';
    } catch (e) {
        return false;
    }
}

function writeMutedPreference(value) {
    try {
        localStorage.setItem(VOICE_MUTED_KEY, value ? '1' : '0');
    } catch (e) { /* ignore */ }
}

// ============================================================
// Mic permission + stream
// ============================================================

/**
 * Prompt the browser for mic access and store the resulting stream.
 * Throws if the user denies or no device is available — caller should catch
 * and surface a friendly error message.
 */
export async function requestMic() {
    if (localStream) return localStream;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Mic API unavailable (requires https)');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
        },
        video: false,
    });
    localStream = stream;
    enabled = true;
    // Restore muted preference, applied to the stream
    muted = readMutedPreference();
    applyMuteToStream();
    return stream;
}

function applyMuteToStream() {
    if (!localStream) return;
    for (const track of localStream.getAudioTracks()) {
        track.enabled = !muted;
    }
}

// ============================================================
// Call wiring (host listens, guest dials)
// ============================================================

/**
 * Host-side: register a handler for incoming media calls. Safe to call
 * repeatedly — only the first registration sticks per peer.
 */
export function attachHostCallHandler() {
    const peer = getPeer();
    if (!peer || !localStream) return;
    if (peer._grogVoiceHandlerAttached) return;
    peer._grogVoiceHandlerAttached = true;
    peer.on('call', (call) => {
        call.answer(localStream);
        bindCall(call);
    });
}

/**
 * Guest-side: initiate a media call to the host. Assumes the data channel
 * is already open and the remote peer id is known.
 */
export function startGuestCall() {
    const peer = getPeer();
    const hostId = getRemotePeerId();
    if (!peer || !hostId || !localStream) return;
    if (mediaCall) return; // already calling
    const call = peer.call(hostId, localStream);
    if (!call) {
        console.warn('[Grog Voice] peer.call returned null — host may not be ready');
        return;
    }
    bindCall(call);
}

function bindCall(call) {
    mediaCall = call;
    call.on('stream', (remoteStream) => {
        if (!remoteAudioEl) {
            remoteAudioEl = document.createElement('audio');
            remoteAudioEl.autoplay = true;
            remoteAudioEl.playsInline = true;
            // Hidden — we only want the audio
            remoteAudioEl.style.display = 'none';
            document.body.appendChild(remoteAudioEl);
        }
        remoteAudioEl.srcObject = remoteStream;
        // Best effort — some browsers gate autoplay until a user gesture
        const playPromise = remoteAudioEl.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => { /* user gesture will unblock later */ });
        }
        attachSpeakingDetector(remoteStream);
    });
    call.on('close', () => {
        teardownCall();
    });
    call.on('error', (err) => {
        console.warn('[Grog Voice] Media call error:', err);
        teardownCall();
    });
}

// ============================================================
// Optional: cheap speaking indicator for the remote stream
// ============================================================

let audioCtx = null;
let analyserNode = null;
let analyserSource = null;
let analyserBuffer = null;
let analyserRaf = null;

function attachSpeakingDetector(stream) {
    try {
        cleanupAnalyser();
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
        analyserSource = audioCtx.createMediaStreamSource(stream);
        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 256;
        analyserBuffer = new Uint8Array(analyserNode.frequencyBinCount);
        analyserSource.connect(analyserNode);

        const tick = () => {
            if (!analyserNode) return;
            analyserNode.getByteFrequencyData(analyserBuffer);
            let sum = 0;
            for (let i = 0; i < analyserBuffer.length; i++) sum += analyserBuffer[i];
            const avg = sum / analyserBuffer.length;
            remoteSpeaking = avg > 12;
            analyserRaf = requestAnimationFrame(tick);
        };
        tick();
    } catch (e) {
        // Speaking indicator is non-essential; ignore failures
    }
}

function cleanupAnalyser() {
    if (analyserRaf) {
        cancelAnimationFrame(analyserRaf);
        analyserRaf = null;
    }
    if (analyserSource) {
        try { analyserSource.disconnect(); } catch (e) {}
        analyserSource = null;
    }
    analyserNode = null;
    analyserBuffer = null;
    if (audioCtx) {
        try { audioCtx.close(); } catch (e) {}
        audioCtx = null;
    }
    remoteSpeaking = false;
}

// ============================================================
// Mute toggle + status
// ============================================================

export function toggleMute() {
    muted = !muted;
    applyMuteToStream();
    writeMutedPreference(muted);
    return muted;
}

export function isVoiceEnabled() { return enabled; }
export function isMuted() { return muted; }
export function isRemoteSpeaking() { return remoteSpeaking && !!mediaCall; }
export function hasActiveCall() { return !!mediaCall; }

// ============================================================
// Teardown
// ============================================================

function teardownCall() {
    if (mediaCall) {
        try { mediaCall.close(); } catch (e) {}
        mediaCall = null;
    }
    if (remoteAudioEl) {
        try { remoteAudioEl.srcObject = null; } catch (e) {}
        if (remoteAudioEl.parentNode) remoteAudioEl.parentNode.removeChild(remoteAudioEl);
        remoteAudioEl = null;
    }
    cleanupAnalyser();
}

/**
 * Fully tear down: closes the call, stops the mic, removes audio element.
 * Called from peerConnection.disconnect() and on scene leave.
 */
export function teardown() {
    teardownCall();
    if (localStream) {
        for (const track of localStream.getTracks()) {
            try { track.stop(); } catch (e) {}
        }
        localStream = null;
    }
    enabled = false;
    muted = false;
}
