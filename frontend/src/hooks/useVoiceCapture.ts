import { useCallback, useEffect, useRef, useState } from "react"

type SpeechResult = { isFinal: boolean; 0: { transcript: string } }
type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((event: {
    resultIndex: number
    results: ArrayLike<SpeechResult>
  }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

const API_URL = import.meta.env.VITE_API_URL ?? "/api"

function speechConstructor() {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
}

function joinText(existing: string, addition: string) {
  return [existing.trim(), addition.trim()].filter(Boolean).join(" ")
}

function messageForPermissionError(reason: unknown) {
  if (reason instanceof DOMException && reason.name === "NotAllowedError") {
    return "Microphone access is blocked. Allow it in your browser and macOS Privacy & Security settings, then try again."
  }
  if (reason instanceof DOMException && reason.name === "NotFoundError") {
    return "No microphone was found. Connect one or type instead."
  }
  return "The microphone could not start. Check browser and system microphone settings."
}

export function useVoiceCapture(initialText = "") {
  const [transcript, setTranscript] = useState(initialText)
  const [interim, setInterim] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")

  const recorderRef = useRef<MediaRecorder | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const wantsRecordingRef = useRef(false)
  const speechWorkingRef = useRef(false)
  const speechFailedRef = useRef(false)
  const sessionBaseRef = useRef("")
  const restartTimerRef = useRef<number | undefined>(undefined)

  const transcribeRecording = useCallback(async (blob: Blob) => {
    if (speechWorkingRef.current && !speechFailedRef.current) {
      setStatus("Voice captured. Review the text before continuing.")
      return
    }
    if (!blob.size) {
      setError("No audio was captured. Try again or type instead.")
      return
    }

    setIsTranscribing(true)
    setStatus("Transcribing recorded audio…")
    try {
      const form = new FormData()
      const extension = blob.type.includes("mp4") ? "m4a" : "webm"
      form.append("audio", blob, `recording.${extension}`)
      const response = await fetch(`${API_URL}/transcription`, {
        method: "POST",
        body: form,
      })
      const body = (await response.json().catch(() => ({}))) as {
        detail?: string
        text?: string
        provider?: string
      }
      if (!response.ok) {
        throw new Error(body.detail ?? `Transcription failed (${response.status}).`)
      }
      if (!body.text?.trim()) throw new Error("No speech was detected. Try again or type instead.")
      setTranscript(joinText(sessionBaseRef.current, body.text))
      setStatus(`Transcribed with ${body.provider === "elevenlabs" ? "ElevenLabs" : "OpenAI"}. Review the text before continuing.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The recording could not be transcribed.")
      setStatus("")
    } finally {
      setIsTranscribing(false)
    }
  }, [])

  const stop = useCallback(() => {
    wantsRecordingRef.current = false
    window.clearTimeout(restartTimerRef.current)
    try {
      recognitionRef.current?.stop()
    } catch {
      // Recognition may already have ended.
    }
    if (recorderRef.current?.state === "recording") recorderRef.current.stop()
    else streamRef.current?.getTracks().forEach((track) => track.stop())
    setIsRecording(false)
    setInterim("")
  }, [])

  const start = useCallback(async () => {
    setError("")
    setStatus("")
    if (!window.isSecureContext) {
      setError("Microphone access requires HTTPS or localhost. A phone cannot record from a plain http://192.168.x.x address—use the HTTPS demo URL.")
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot capture microphone audio. Open the HTTPS demo in Chrome or Safari, or type instead.")
      return
    }
    if (!window.MediaRecorder) {
      setError("This browser cannot record audio. Update Chrome or Safari, or type instead.")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      sessionBaseRef.current = transcript
      speechWorkingRef.current = false
      speechFailedRef.current = false

      const preferredType = ["audio/webm;codecs=opus", "audio/mp4"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      )
      const recorder = new MediaRecorder(
        stream,
        preferredType ? { mimeType: preferredType } : undefined,
      )
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        setError("Audio recording stopped unexpectedly. Try again or type instead.")
        stop()
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        })
        stream.getTracks().forEach((track) => track.stop())
        void transcribeRecording(blob)
      }
      recorderRef.current = recorder
      recorder.start(1000)

      const Recognition = speechConstructor()
      if (Recognition) {
        const recognition = new Recognition()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = "en-US"
        recognition.onresult = (event) => {
          let finalText = ""
          let interimText = ""
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index]
            if (result.isFinal) finalText += result[0].transcript
            else interimText += result[0].transcript
          }
          if (finalText.trim()) {
            speechWorkingRef.current = true
            setTranscript((current) => joinText(current, finalText))
          }
          setInterim(interimText)
        }
        recognition.onerror = (event) => {
          setInterim("")
          if (event.error === "no-speech") return
          speechFailedRef.current = true
          setStatus("Live captions are unavailable here; audio is still recording and will be transcribed when you stop.")
        }
        recognition.onend = () => {
          if (wantsRecordingRef.current && !speechFailedRef.current) {
            restartTimerRef.current = window.setTimeout(() => {
              try {
                recognition.start()
              } catch {
                speechFailedRef.current = true
              }
            }, 250)
          }
        }
        recognitionRef.current = recognition
        try {
          recognition.start()
          setStatus("Listening with live captions…")
        } catch {
          speechFailedRef.current = true
          setStatus("Recording audio for transcription…")
        }
      } else {
        speechFailedRef.current = true
        setStatus("Recording audio for transcription…")
      }

      wantsRecordingRef.current = true
      setElapsedSeconds(0)
      setIsRecording(true)
    } catch (reason) {
      setError(messageForPermissionError(reason))
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [stop, transcript, transcribeRecording])

  useEffect(() => {
    if (!isRecording) return
    const interval = window.setInterval(() => {
      setElapsedSeconds((value) => value + 1)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [isRecording])

  useEffect(() => () => stop(), [stop])

  return {
    transcript,
    setTranscript,
    interim,
    isRecording,
    isTranscribing,
    elapsedSeconds,
    error,
    status,
    start,
    stop,
    toggle: isRecording ? stop : start,
  }
}
