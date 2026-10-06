# Cross-device audio checks

The implementation is [useLiveKit.ts](../client/src/hooks/useLiveKit.ts), [ActiveCallScreen.tsx](../client/src/components/ActiveCallScreen.tsx), and [AudioVisualizer.tsx](../client/src/components/AudioVisualizer.tsx). This checklist describes implementation intent and testing, not a guarantee for every browser/device.

## Implementation expectations

- Unlock playback from a user gesture and show a usable action when audio cannot play.
- Keep attached remote audio elements in the mounted call view; clean them up when tracks or sessions end.
- Subscribe to existing and later remote publications so arrival order does not lose audio.
- Keep visualization separate from playback and do not mute the remote speaker path.
- Surface microphone permission failure and preserve authoritative call completion/accounting.
- Replace obsolete room work on reconnection or credential changes; do not revive a terminal call.

Avoid attributing silence to one universal WebKit rule without inspecting the actual device and media state.

## Physical-device matrix

Test desktop browsers, Android Telegram/Chrome, and iOS Telegram/Safari with two real participants. For each pair, check:

1. Both voices are audible when either participant joins first.
2. Permission grant/deny, audio unlock, mute/unmute, and headphones work.
3. Call volume and output routing remain understandable.
4. Backgrounding, transient network loss, reconnect, and end-call clean up tracks.
5. A second call after teardown works without stale audio.
6. Recordings contain both permitted voices and remain private through stop/restart.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No partner audio | Playback permission, subscribed track, attached audio element, output volume |
| No local voice | Microphone permission, selected input, mute state, published track |
| Quiet phone output | Call volume, headphones, OS output route |
| Old voice after a new call | Obsolete room listeners/tracks and teardown |
| Silent/partial recording | Provider egress state, published tracks, finalized output; do not infer success from record_status |

Automated hook tests are useful lifecycle checks, but physical Telegram/device and provider validation remains a staging requirement. See [Verification](VERIFICATION.md).
