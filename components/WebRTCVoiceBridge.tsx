import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { api } from '@/lib/api';

interface WebRTCVoiceBridgeProps {
  rideId: string;
  callId: string;
  isCaller: boolean;
  isMuted: boolean;
  isSpeaker: boolean;
  onConnectionChange?: (status: 'connecting' | 'connected' | 'failed' | 'disconnected') => void;
}

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

const WEBRTC_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Lo Ride WebRTC Audio Engine</title>
</head>
<body style="background:transparent; margin:0; padding:0;">
  <audio id="remoteAudio" autoplay playsinline></audio>
  <script>
    (function() {
      var pc = null;
      var localStream = null;
      var isCaller = false;
      var pendingCandidates = [];

      function sendToNative(type, payload) {
        var msg = JSON.stringify({ type: type, payload: payload });
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(msg);
        }
      }

      async function initWebRTC(caller) {
        isCaller = caller;
        try {
          localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            },
            video: false
          });
        } catch (err) {
          sendToNative('error', 'Microphone capture error: ' + (err.message || err));
          sendToNative('status', 'failed');
          return;
        }

        pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
          ]
        });

        localStream.getAudioTracks().forEach(function(track) {
          pc.addTrack(track, localStream);
        });

        pc.ontrack = function(event) {
          var remoteAudio = document.getElementById('remoteAudio');
          if (remoteAudio && event.streams && event.streams[0]) {
            remoteAudio.srcObject = event.streams[0];
            remoteAudio.play().catch(function() {});
          }
        };

        pc.onicecandidate = function(event) {
          if (event.candidate) {
            sendToNative('send_signal', {
              type: 'candidate',
              payload: JSON.stringify(event.candidate)
            });
          }
        };

        pc.onconnectionstatechange = function() {
          sendToNative('status', pc.connectionState);
        };

        if (isCaller) {
          try {
            var offer = await pc.createOffer({ offerToReceiveAudio: true });
            await pc.setLocalDescription(offer);
            sendToNative('send_signal', {
              type: 'offer',
              payload: JSON.stringify(pc.localDescription)
            });
          } catch (e) {
            sendToNative('error', 'Create offer error: ' + e.message);
          }
        }
      }

      async function handleMessage(event) {
        var data;
        try {
          data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        } catch (e) {
          return;
        }

        if (!data || !data.type) return;

        if (data.type === 'init') {
          initWebRTC(Boolean(data.isCaller));
        } else if (data.type === 'signal') {
          if (!pc) return;
          var sig = data.signal;
          if (sig.type === 'offer' && !isCaller) {
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(sig.payload)));
              // Process any queued candidates
              while (pendingCandidates.length > 0) {
                var c = pendingCandidates.shift();
                await pc.addIceCandidate(new RTCIceCandidate(c));
              }
              var answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              sendToNative('send_signal', {
                type: 'answer',
                payload: JSON.stringify(pc.localDescription)
              });
            } catch (e) {
              sendToNative('error', 'Answer creation error: ' + e.message);
            }
          } else if (sig.type === 'answer' && isCaller) {
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(sig.payload)));
              while (pendingCandidates.length > 0) {
                var c = pendingCandidates.shift();
                await pc.addIceCandidate(new RTCIceCandidate(c));
              }
            } catch (e) {
              sendToNative('error', 'Remote answer error: ' + e.message);
            }
          } else if (sig.type === 'candidate') {
            try {
              var cand = JSON.parse(sig.payload);
              if (pc.remoteDescription && pc.remoteDescription.type) {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } else {
                pendingCandidates.push(cand);
              }
            } catch (e) {}
          }
        } else if (data.type === 'mute') {
          if (localStream) {
            localStream.getAudioTracks().forEach(function(track) {
              track.enabled = !data.isMuted;
            });
          }
        }
      }

      window.addEventListener('message', handleMessage);
      document.addEventListener('message', handleMessage);
    })();
  </script>
</body>
</html>
`;

export default function WebRTCVoiceBridge({
  rideId,
  callId,
  isCaller,
  isMuted,
  isSpeaker,
  onConnectionChange,
}: WebRTCVoiceBridgeProps) {
  const webViewRef = useRef<WebView>(null);
  const lastSignalIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  // Web Browser Native WebRTC Implementation
  const webPcRef = useRef<RTCPeerConnection | null>(null);
  const webLocalStreamRef = useRef<MediaStream | null>(null);
  const webPendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // 1. Web browser direct WebRTC pipeline
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    isMountedRef.current = true;
    let pc: RTCPeerConnection | null = null;
    let localStream: MediaStream | null = null;

    async function startWebRTC() {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        webLocalStreamRef.current = localStream;
      } catch (err) {
        console.warn('Web microphone capture note:', err);
        onConnectionChange?.('failed');
        return;
      }

      const peerConn: RTCPeerConnection = new (window as any).RTCPeerConnection({ iceServers: STUN_SERVERS });
      pc = peerConn;
      webPcRef.current = peerConn;

      localStream.getAudioTracks().forEach((track) => {
        peerConn.addTrack(track, localStream!);
      });

      peerConn.ontrack = (event) => {
        let audioEl = document.getElementById('web_remote_audio') as HTMLAudioElement;
        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.id = 'web_remote_audio';
          audioEl.autoplay = true;
          document.body.appendChild(audioEl);
        }
        audioEl.srcObject = event.streams[0];
        audioEl.play().catch(() => {});
      };

      peerConn.onicecandidate = (event) => {
        if (event.candidate && isMountedRef.current) {
          api.sendCallSignal(rideId, callId, 'candidate', JSON.stringify(event.candidate));
        }
      };

      peerConn.onconnectionstatechange = () => {
        const state = peerConn.connectionState as any;
        if (state === 'connected') {
          onConnectionChange?.('connected');
        } else if (state === 'failed' || state === 'disconnected') {
          onConnectionChange?.(state);
        }
      };

      if (isCaller) {
        try {
          const offer = await peerConn.createOffer({ offerToReceiveAudio: true });
          await peerConn.setLocalDescription(offer);
          await api.sendCallSignal(rideId, callId, 'offer', JSON.stringify(peerConn.localDescription));
        } catch (e) {
          console.warn('Web createOffer note:', e);
        }
      }
    }

    startWebRTC();

    return () => {
      isMountedRef.current = false;
      if (webLocalStreamRef.current) {
        webLocalStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (webPcRef.current) {
        webPcRef.current.close();
      }
      const audioEl = document.getElementById('web_remote_audio');
      if (audioEl) {
        audioEl.remove();
      }
    };
  }, [rideId, callId, isCaller]);

  // Handle Mute toggle on Web
  useEffect(() => {
    if (Platform.OS === 'web' && webLocalStreamRef.current) {
      webLocalStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    } else if (Platform.OS !== 'web' && webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({ type: 'mute', isMuted }));
    }
  }, [isMuted]);

  // 2. Poll signals from backend and forward to WebRTC engine
  useEffect(() => {
    isMountedRef.current = true;
    let consecutiveConnected = 0;

    const interval = setInterval(async () => {
      try {
        const { data } = await api.getCallSignals(rideId, callId, lastSignalIdRef.current || undefined);
        if (!isMountedRef.current || !data || data.length === 0) return;

        for (const sig of data) {
          lastSignalIdRef.current = sig.id;

          if (Platform.OS === 'web') {
            const pc = webPcRef.current;
            if (!pc) continue;

            if (sig.type === 'offer' && !isCaller) {
              await pc.setRemoteDescription(new (window as any).RTCSessionDescription(JSON.parse(sig.payload)));
              while (webPendingCandidatesRef.current.length > 0) {
                const c = webPendingCandidatesRef.current.shift()!;
                await pc.addIceCandidate(new (window as any).RTCIceCandidate(c));
              }
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await api.sendCallSignal(rideId, callId, 'answer', JSON.stringify(pc.localDescription));
            } else if (sig.type === 'answer' && isCaller) {
              await pc.setRemoteDescription(new (window as any).RTCSessionDescription(JSON.parse(sig.payload)));
              while (webPendingCandidatesRef.current.length > 0) {
                const c = webPendingCandidatesRef.current.shift()!;
                await pc.addIceCandidate(new (window as any).RTCIceCandidate(c));
              }
            } else if (sig.type === 'candidate') {
              const cand = JSON.parse(sig.payload);
              if (pc.remoteDescription && pc.remoteDescription.type) {
                await pc.addIceCandidate(new (window as any).RTCIceCandidate(cand));
              } else {
                webPendingCandidatesRef.current.push(cand);
              }
            }
          } else {
            // Forward signal to Native WebView engine
            if (webViewRef.current) {
              webViewRef.current.postMessage(JSON.stringify({ type: 'signal', signal: sig }));
            }
          }
        }
      } catch (_) {}
    }, 450);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [rideId, callId, isCaller]);

  // Handle messages sent from the Native WebView
  function handleWebViewMessage(event: any) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (!data) return;

      if (data.type === 'send_signal' && data.payload) {
        api.sendCallSignal(rideId, callId, data.payload.type, data.payload.payload);
      } else if (data.type === 'status') {
        if (data.payload === 'connected') {
          onConnectionChange?.('connected');
        } else if (data.payload === 'failed' || data.payload === 'disconnected') {
          onConnectionChange?.(data.payload);
        }
      }
    } catch (_) {}
  }

  // On Web platform, no hidden WebView is needed
  if (Platform.OS === 'web') {
    return null;
  }

  return (
    <View style={styles.hiddenContainer} pointerEvents="none">
      <WebView
        ref={webViewRef}
        style={styles.hiddenWebView}
        originWhitelist={['*']}
        source={{ html: WEBRTC_HTML }}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        mediaCapturePermissionGrantType="grant"
        onLoadEnd={() => {
          // Initialize WebRTC engine with caller / receiver role
          webViewRef.current?.postMessage(JSON.stringify({ type: 'init', isCaller }));
        }}
        onMessage={handleWebViewMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hiddenContainer: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0.01,
    overflow: 'hidden',
  },
  hiddenWebView: {
    width: 1,
    height: 1,
  },
});
