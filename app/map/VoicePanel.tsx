"use client";

import { useVoiceCapture } from "./useVoiceCapture";

export default function VoicePanel({ meetingId = "" }: { meetingId?: string }) {
  const voice = useVoiceCapture({ mode: meetingId ? "meeting" : "network", meetingId });
  const active = !["idle", "error"].includes(voice.state);

  return (
    <div className="panel-block">
      <div className={`voice-state voice-${voice.state}`}>
        <span aria-hidden />
        {voice.state}
      </div>
      <p className="side-note">
        Arachne can only see the people on your map.
      </p>
      <div className="panel-actions">
        {active ? (
          <button type="button" className="btn btn-raised" onClick={voice.stop}>Stop</button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={voice.state === "error" && !voice.reconnectable}
            onClick={() => void voice.start()}
          >
            {voice.state === "error" ? "Reconnect" : "Start talking"}
          </button>
        )}
      </div>
      {voice.error && <p className="field-error" role="alert">{voice.error}</p>}
      {voice.agentText && (
        <div className="voice-latest">
          <small>Latest reply</small>
          <p>{voice.agentText}</p>
        </div>
      )}
      {voice.transcript && (
        <details open>
          <summary>Transcript</summary>
          <pre className="voice-transcript">{voice.transcript}</pre>
        </details>
      )}
      {voice.toolResults.length > 0 && (
        <>
          <p className="side-label">Actions and results</p>
          <ul className="card-list">
            {voice.toolResults.map((tool, index) => {
              const pending = tool.result.needs_confirmation === true;
              return (
                <li key={`${tool.name}-${index}`} className="followup">
                  <small>{tool.name.replaceAll("_", " ")}</small>
                  <p>{String(tool.result.message ?? tool.result.action ?? tool.result.person ?? "Completed")}</p>
                  {pending && (
                    <button
                      type="button"
                      className="btn btn-primary voice-confirm"
                      onClick={() => voice.sendText("Yes, I explicitly confirm that reminder.")}
                    >
                      Confirm in voice
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
