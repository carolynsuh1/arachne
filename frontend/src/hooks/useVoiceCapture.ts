import { useCallback, useEffect, useRef, useState } from "react"

const API_URL = import.meta.env.VITE_API_URL ?? "/api"

export type VoiceSessionState =
  | "Idle" | "Connecting" | "Listening" | "User speaking"
  | "Agent thinking" | "Agent speaking" | "Paused" | "Disconnected/Error"

type VoiceOptions = {
  mode?: "network" | "practice" | "meeting" | "brain_dump" | "follow_up" | "who_next" | "meeting_qa"
  meetingId?: string
  goalId?: string
}

function joinText(existing: string, addition: string) {
  if (!addition.trim() || existing.trim().endsWith(addition.trim())) return existing
  return [existing.trim(), addition.trim()].filter(Boolean).join(" ")
}

function websocketUrl(options: VoiceOptions) {
  const base = API_URL.startsWith("http")
    ? API_URL.replace(/^http/, "ws")
    : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${API_URL}`
  const query = new URLSearchParams({ mode: options.mode ?? "network" })
  if (options.meetingId) query.set("meeting_id", options.meetingId)
  if (options.goalId) query.set("goal_id", options.goalId)
  return `${base}/voice/session?${query}`
}

function pcm16(input: Float32Array, sourceRate: number) {
  const ratio = sourceRate / 16_000
  const length = Math.floor(input.length / ratio)
  const output = new Int16Array(length)
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio)
    const end = Math.min(input.length, Math.floor((index + 1) * ratio))
    let total = 0
    for (let cursor = start; cursor < end; cursor += 1) total += input[cursor]
    const sample = Math.max(-1, Math.min(1, total / Math.max(1, end - start)))
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }
  return output.buffer
}

export function useVoiceCapture(initialText = "", options: VoiceOptions = {}) {
  const [transcript, setTranscript] = useState(initialText)
  const [interim] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [error, setError] = useState("")
  const [state, setState] = useState<VoiceSessionState>("Idle")
  const [lastAgentText, setLastAgentText] = useState("")
  const [isMuted, setIsMuted] = useState(false)

  const socketRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const playbackAtRef = useRef(0)
  const sourcesRef = useRef<AudioBufferSourceNode[]>([])
  const mutedRef = useRef(false)
  const agentSpeakingRef = useRef(false)
  const intentionalStopRef = useRef(false)

  const stopPlayback = useCallback(() => {
    sourcesRef.current.forEach((source) => {
      try { source.stop() } catch { /* already stopped */ }
    })
    sourcesRef.current = []
    playbackAtRef.current = 0
    agentSpeakingRef.current = false
  }, [])

  const stop = useCallback(() => {
    intentionalStopRef.current = true
    processorRef.current?.disconnect()
    processorRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    socketRef.current?.close(1000, "User stopped")
    socketRef.current = null
    stopPlayback()
    void contextRef.current?.close()
    contextRef.current = null
    setIsRecording(false)
    setState("Idle")
  }, [stopPlayback])

  const playPcm = useCallback((data: ArrayBuffer) => {
    const context = contextRef.current
    if (!context || !data.byteLength) return
    const samples = new Int16Array(data)
    const buffer = context.createBuffer(1, samples.length, 24_000)
    const channel = buffer.getChannelData(0)
    for (let index = 0; index < samples.length; index += 1) {
      channel[index] = samples[index] / 0x8000
    }
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    const startAt = Math.max(context.currentTime + 0.02, playbackAtRef.current)
    playbackAtRef.current = startAt + buffer.duration
    sourcesRef.current.push(source)
    source.onended = () => {
      sourcesRef.current = sourcesRef.current.filter((item) => item !== source)
      if (!sourcesRef.current.length && socketRef.current?.readyState === WebSocket.OPEN) {
        agentSpeakingRef.current = false
        setState("Listening")
      }
    }
    source.start(startAt)
    agentSpeakingRef.current = true
    setState("Agent speaking")
  }, [])

  const start = useCallback(async (sessionOverrides: Partial<VoiceOptions> = {}) => {
    setError("")
    if (!window.isSecureContext) {
      setError("Microphone access requires HTTPS or localhost.")
      setState("Disconnected/Error")
      return
    }
    try {
      intentionalStopRef.current = false
      setState("Connecting")
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      const context = new AudioContext()
      await context.resume()
      streamRef.current = stream
      contextRef.current = context
      const socket = new WebSocket(websocketUrl({ ...options, ...sessionOverrides }))
      socket.binaryType = "arraybuffer"
      socketRef.current = socket

      socket.onmessage = (message) => {
        if (message.data instanceof ArrayBuffer) {
          playPcm(message.data)
          return
        }
        const event = JSON.parse(String(message.data)) as {
          type: string; role?: string; content?: string; description?: string; reconnectable?: boolean
        }
        if (event.type === "SettingsApplied") setState("Listening")
        if (event.type === "UserStartedSpeaking") {
          stopPlayback()
          setState("User speaking")
        }
        if (event.type === "AgentThinking") setState("Agent thinking")
        if (event.type === "ConversationText" && event.content) {
          if (event.role === "user") setTranscript((current) => joinText(current, event.content!))
          if (event.role === "assistant") setLastAgentText(event.content)
        }
        if (event.type === "Error") {
          setError(`${event.description ?? "Voice session failed."}${event.reconnectable ? " Tap reconnect to continue." : ""}`)
          setState("Disconnected/Error")
        }
      }
      socket.onerror = () => {
        if (intentionalStopRef.current) return
        setError("Could not connect to Deepgram. Check the backend and your network, then reconnect.")
        setState("Disconnected/Error")
      }
      socket.onclose = (event) => {
        if (!intentionalStopRef.current && event.code !== 1000) setState("Disconnected/Error")
      }

      const source = context.createMediaStreamSource(stream)
      const processor = context.createScriptProcessor(4096, 1, 1)
      const silent = context.createGain()
      silent.gain.value = 0
      processor.onaudioprocess = (event) => {
        if (
          !mutedRef.current
          && socket.readyState === WebSocket.OPEN
          && !agentSpeakingRef.current
        ) {
          socket.send(pcm16(event.inputBuffer.getChannelData(0), context.sampleRate))
        }
      }
      source.connect(processor)
      processor.connect(silent)
      silent.connect(context.destination)
      processorRef.current = processor
      setElapsedSeconds(0)
      setIsRecording(true)
    } catch (reason) {
      const denied = reason instanceof DOMException && reason.name === "NotAllowedError"
      stop()
      setError(denied
        ? "Microphone access is blocked. Allow it in browser and system settings, then reconnect."
        : "The microphone could not start. Check your input device and reconnect.")
      setState("Disconnected/Error")
    }
  }, [options, playPcm, stop, stopPlayback])

  const sendText = useCallback((content: string) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setError("Start or reconnect the voice session before sending text.")
      return
    }
    socketRef.current.send(JSON.stringify({ type: "InjectUserMessage", content }))
  }, [])

  const speakText = useCallback((message: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "InjectAgentMessage", message, behavior: "interrupt",
      }))
    }
  }, [])

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current
    setIsMuted(mutedRef.current)
    setState(mutedRef.current ? "Paused" : "Listening")
  }, [])

  useEffect(() => {
    if (!isRecording) return
    const timer = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [isRecording])
  useEffect(() => () => stop(), [stop])

  return {
    transcript, setTranscript, interim, isRecording, isTranscribing,
    elapsedSeconds, error, status: state, state, lastAgentText, isMuted,
    start, stop, toggle: isRecording ? stop : start, toggleMute, sendText, speakText,
  }
}
