"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";
export type VoiceToolResult = { name: string; result: Record<string, unknown> };

function append(existing: string, addition: string) {
  const clean = addition.trim();
  if (!clean || existing.trim().endsWith(clean)) return existing;
  return [existing.trim(), clean].filter(Boolean).join("\n");
}

function pcm16(input: Float32Array, sourceRate: number) {
  const ratio = sourceRate / 16_000;
  const output = new Int16Array(Math.floor(input.length / ratio));
  for (let index = 0; index < output.length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let total = 0;
    for (let cursor = start; cursor < end; cursor += 1) total += input[cursor]!;
    const sample = Math.max(-1, Math.min(1, total / Math.max(1, end - start)));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output.buffer;
}

export function useVoiceCapture(options: { mode?: string; meetingId?: string } = {}) {
  const mode = options.mode ?? "network";
  const meetingId = options.meetingId ?? "";
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [agentText, setAgentText] = useState("");
  const [toolResults, setToolResults] = useState<VoiceToolResult[]>([]);
  const [error, setError] = useState("");
  const [reconnectable, setReconnectable] = useState(true);
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const playbackAtRef = useRef(0);
  const stoppedRef = useRef(false);
  const speakingRef = useRef(false);

  const stopPlayback = useCallback(() => {
    for (const source of sourcesRef.current) {
      try {
        source.stop();
      } catch {
        // It already ended.
      }
    }
    sourcesRef.current = [];
    playbackAtRef.current = 0;
    speakingRef.current = false;
  }, []);

  const cleanResources = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    socketRef.current?.close(1000, "User stopped");
    socketRef.current = null;
    stopPlayback();
    void contextRef.current?.close();
    contextRef.current = null;
  }, [stopPlayback]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    cleanResources();
    setState("idle");
  }, [cleanResources]);

  const playPcm = useCallback((data: ArrayBuffer) => {
    const context = contextRef.current;
    if (!context || !data.byteLength) return;
    const samples = new Int16Array(data);
    const buffer = context.createBuffer(1, samples.length, 24_000);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) channel[index] = samples[index]! / 0x8000;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const starts = Math.max(context.currentTime + 0.02, playbackAtRef.current);
    playbackAtRef.current = starts + buffer.duration;
    sourcesRef.current.push(source);
    source.onended = () => {
      sourcesRef.current = sourcesRef.current.filter((item) => item !== source);
      if (!sourcesRef.current.length && socketRef.current?.readyState === WebSocket.OPEN) {
        speakingRef.current = false;
        setState("listening");
      }
    };
    source.start(starts);
    speakingRef.current = true;
    setState("speaking");
  }, []);

  const start = useCallback(async () => {
    stop();
    stoppedRef.current = false;
    setError("");
    setReconnectable(true);
    setState("connecting");
    try {
      const tokenResponse = await fetch("/api/voice-token", { method: "POST" });
      const session = (await tokenResponse.json()) as {
        token?: string; goalId?: string; webSocketUrl?: string; error?: string; reconnectable?: boolean;
      };
      if (!tokenResponse.ok || !session.token || !session.webSocketUrl) {
        setReconnectable(session.reconnectable ?? tokenResponse.status !== 503);
        throw new Error(session.error || "Could not start a voice session.");
      }
      if (!window.isSecureContext) throw new Error("Microphone access requires HTTPS or localhost.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      const context = new AudioContext();
      await context.resume();
      streamRef.current = stream;
      contextRef.current = context;

      const query = new URLSearchParams({ mode, token: session.token });
      if (session.goalId) query.set("goal_id", session.goalId);
      if (meetingId) query.set("meeting_id", meetingId);
      const socket = new WebSocket(`${session.webSocketUrl}/voice/session?${query}`);
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;
      socket.onmessage = (message) => {
        if (message.data instanceof ArrayBuffer) {
          playPcm(message.data);
          return;
        }
        const event = JSON.parse(String(message.data)) as {
          type: string;
          role?: string;
          content?: string;
          description?: string;
          reconnectable?: boolean;
          name?: string;
          result?: Record<string, unknown>;
        };
        if (event.type === "SettingsApplied") setState("listening");
        if (event.type === "UserStartedSpeaking") {
          stopPlayback();
          setState("listening");
        }
        if (event.type === "AgentThinking") setState("thinking");
        if (event.type === "ConversationText" && event.content) {
          if (event.role === "user") setTranscript((current) => append(current, `You: ${event.content}`));
          if (event.role === "assistant") {
            setAgentText(event.content);
            setTranscript((current) => append(current, `Arachne: ${event.content}`));
          }
        }
        if (event.type === "ToolResult" && event.name && event.result) {
          setToolResults((current) => [...current, { name: event.name!, result: event.result! }]);
        }
        if (event.type === "Error") {
          setError(event.description || "Voice session failed.");
          setReconnectable(event.reconnectable ?? false);
          stoppedRef.current = true;
          cleanResources();
          setState("error");
        }
      };
      socket.onerror = () => {
        if (stoppedRef.current) return;
        setError("Could not connect to voice. Check that the backend is running.");
        setReconnectable(true);
        setState("error");
      };
      socket.onclose = (event) => {
        if (!stoppedRef.current && event.code !== 1000) {
          cleanResources();
          setState("error");
        }
      };

      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silent = context.createGain();
      silent.gain.value = 0;
      processor.onaudioprocess = (event) => {
        if (socket.readyState === WebSocket.OPEN && !speakingRef.current) {
          socket.send(pcm16(event.inputBuffer.getChannelData(0), context.sampleRate));
        }
      };
      source.connect(processor);
      processor.connect(silent);
      silent.connect(context.destination);
      processorRef.current = processor;
    } catch (reason) {
      const denied = reason instanceof DOMException && reason.name === "NotAllowedError";
      setError(
        denied
          ? "Microphone access is blocked. Allow it in browser and macOS settings, then reconnect."
          : reason instanceof Error ? reason.message : "The microphone could not start.",
      );
      setState("error");
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, [cleanResources, meetingId, mode, playPcm, stop, stopPlayback]);

  const sendText = useCallback((content: string) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ type: "InjectUserMessage", content }));
  }, []);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { state, transcript, agentText, toolResults, error, reconnectable, start, stop, sendText };
}
