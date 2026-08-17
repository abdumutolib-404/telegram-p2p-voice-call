# WebRTC Cross-Device Audio & Mobile Compatibility Guide

This document establishes the definitive guidelines and invariants for handling real-time WebRTC two-way voice communication across heterogeneous devices (Desktop Laptops/PCs, iOS Safari / Telegram WebApp, Android Chrome).

---

## 1. Core Invariants for Cross-Device WebRTC Audio

### Invariant 1: Multi-Touch User Gesture Audio Unlocking
* **Problem**: Mobile browsers strictly enforce autoplay policies. Media streams received asynchronously via WebSockets/SFU cannot play automatically without a synchronous user touch or click.
* **Rule**:
  1. Capture global `touchstart`, `touchend`, and `click` events on the active call screen to execute `room.startAudio()` and call `.play()` on all attached `<audio>` elements.
  2. If `room.canPlaybackAudio` becomes `false`, display a pulsing, accessible unlock banner: `"🔊 Tap to Enable Partner Voice Audio"`.

### Invariant 2: In-DOM Audio Sink Visibility for WebKit
* **Problem**: iOS Safari / WebKit automatically suspends and mutes `<audio>` elements that are rendered off-screen (e.g. `top: -9999px`) or styled with `display: none` / `opacity: 0` as part of its media power-saving optimizations.
* **Rule**:
  1. Render a persistent `#livekit-audio-sink` container inside the active DOM hierarchy with minimal non-zero footprint (`width: 2px; height: 2px; opacity: 0.01;`).
  2. Set `playsinline="true"`, `webkit-playsinline="true"`, `volume = 1.0`, and `muted = false` on every attached `<audio>` element.

### Invariant 3: Web Audio Graph Pipeline Isolation
* **Problem**: Creating a Web Audio `AudioContext.createMediaStreamSource()` from a remote WebRTC `MediaStreamTrack` without a connected, active audio destination silences the hardware speaker output on WebKit.
* **Rule**:
  1. Never route remote audio tracks through Web Audio API analysers without isolating playback.
  2. Use simulated waveform oscillations or isolated local analysers for visualizers to preserve native speaker routing.

### Invariant 4: Explicit SFU Track & Participant Subscriptions
* **Problem**: When one participant joins before the other publishes their track, race conditions can cause incoming audio to be ignored if deferred publications are not handled.
* **Rule**:
  1. Subscribe to `RoomEvent.TrackPublished`, `RoomEvent.TrackSubscribed`, and `RoomEvent.ParticipantConnected`.
  2. Iterate through `room.remoteParticipants` and explicitly call `publication.setSubscribed(true)`.

### Invariant 5: VoIP Hardware Audio Routing on Mobile
* **Problem**: Mobile OSes switch to VoIP Call Mode when `getUserMedia` is activated, directing output to the top earpiece receiver by default if headphones are disconnected.
* **Rule**:
  1. Provide visible in-app user guidance recommending headphones or adjusting device call volume.

---

## 2. Quick Troubleshooting Checklist

| Symptom | Primary Cause | Immediate Fix |
| :--- | :--- | :--- |
| Laptop hears Phone, Phone silent | Mobile autoplay blocked | Tap phone screen or banner to trigger `room.startAudio()`. |
| Phone audio cuts out after 5 seconds | Off-screen `<audio>` tag paused by WebKit | Check that `#livekit-audio-sink` is rendered inside DOM. |
| Muted sound on iOS Safari | Web Audio `createMediaStreamSource` active | Remove Web Audio source node on remote WebRTC track. |
| Quiet sound on phone | Audio playing through top earpiece receiver | Plug in headphones or turn up phone call volume. |
