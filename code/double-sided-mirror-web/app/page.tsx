"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ActionStep, CitizenResult, Message } from "@/lib/types";
import {
  AiProvider,
  DEFAULT_MODEL_BY_PROVIDER,
  PROVIDER_MODEL_OPTIONS,
  PROVIDER_OPTIONS
} from "@/lib/aiProviders";

type AppMode = "gateway" | "citizen" | "staff";
type ApiKeyCheckStatus = "untested" | "checking" | "verified" | "failed";

interface StaffCase {
  id: string;
  citizenSessionId: string;
  citizenDisplayName?: string;
  intentTitle: string;
  citizenSummary: string;
  transcript: Message[];
  actionPlan: ActionStep[];
  citations: Array<{
    title: string;
    url: string;
    agency: string;
    publishedOrUpdated: string;
    snippet: string;
  }>;
  status: "new" | "in_review" | "responded";
  response?: {
    humanResponse: string;
    publishedAt: string;
    staffActorId: string;
  } | null;
}

interface CitizenSyncedCase {
  id: string;
  status: "new" | "in_review" | "responded";
  responses: Array<{
    humanResponse: string;
    publishedAt: string;
    staffActorId: string;
  }>;
}

const SAFETY_NOTICE =
  "Risk Notice: AI support content may be incomplete or outdated. Verify critical details with the responsible Pennsylvania agency. This platform does not provide legal advice.";

const starterAssistant: Message = {
  role: "assistant",
  content:
    "Welcome to Double-Sided Mirror. Start with your goal and Pennsylvania city/locality (examples: \"get my pension\", \"open a restaurant\"), and I will guide you step by step.",
  timestamp: new Date().toISOString()
};

export default function HomePage(): ReactNode {
  const [mode, setMode] = useState<AppMode>("gateway");
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [draftApiKey, setDraftApiKey] = useState("");
  const [provider, setProvider] = useState<AiProvider>("openai");
  const [model, setModel] = useState(DEFAULT_MODEL_BY_PROVIDER.openai);
  const [draftProvider, setDraftProvider] = useState<AiProvider>("openai");
  const [draftModel, setDraftModel] = useState(DEFAULT_MODEL_BY_PROVIDER.openai);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyCheckStatus, setApiKeyCheckStatus] = useState<ApiKeyCheckStatus>("untested");
  const [apiKeyCheckMessage, setApiKeyCheckMessage] = useState("");

  const [citizenSessionId, setCitizenSessionId] = useState<string | null>(null);
  const [citizenMessages, setCitizenMessages] = useState<Message[]>([starterAssistant]);
  const [citizenInput, setCitizenInput] = useState("");
  const [citizenStage, setCitizenStage] = useState("intake");
  const [citizenResult, setCitizenResult] = useState<CitizenResult | null>(null);
  const [citizenLoading, setCitizenLoading] = useState(false);
  const [consentStatus, setConsentStatus] = useState<"idle" | "yes" | "no" | "saving">("idle");
  const [syncedCaseId, setSyncedCaseId] = useState<string | null>(null);
  const [citizenCases, setCitizenCases] = useState<CitizenSyncedCase[]>([]);

  const [staffActorInput, setStaffActorInput] = useState("");
  const [staffActorId, setStaffActorId] = useState<string | null>(null);
  const [staffCases, setStaffCases] = useState<StaffCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [staffLoadingCases, setStaffLoadingCases] = useState(false);
  const [staffDraftLoading, setStaffDraftLoading] = useState(false);
  const [aiDraft, setAiDraft] = useState("");
  const [humanResponse, setHumanResponse] = useState("");
  const [staffMsg, setStaffMsg] = useState("");

  const selectedCase = useMemo(
    () => staffCases.find((item) => item.id === selectedCaseId) ?? null,
    [staffCases, selectedCaseId]
  );
  const providerLabel = useMemo(
    () => PROVIDER_OPTIONS.find((item) => item.value === provider)?.label ?? provider,
    [provider]
  );

  useEffect(() => {
    if (selectedCase && selectedCase.response) {
      setHumanResponse(selectedCase.response.humanResponse);
    }
  }, [selectedCase]);

  async function ensureCitizenSession(): Promise<string> {
    if (citizenSessionId) {
      return citizenSessionId;
    }

    const resp = await fetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "citizen" })
    });
    if (!resp.ok) {
      throw new Error("Could not create a citizen session.");
    }
    const json = (await resp.json()) as { sessionId: string };
    setCitizenSessionId(json.sessionId);
    return json.sessionId;
  }

  async function sendCitizenMessage(event: FormEvent): Promise<void> {
    event.preventDefault();
    const content = citizenInput.trim();
    if (!content || citizenLoading) {
      return;
    }

    setCitizenLoading(true);
    setCitizenInput("");

    try {
      const sessionId = await ensureCitizenSession();

      setCitizenMessages((prev) => [
        ...prev,
        { role: "user", content, timestamp: new Date().toISOString() }
      ]);

      const resp = await fetch("/api/citizen/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: content,
          apiKey: apiKey || undefined,
          provider,
          model
        })
      });
      if (!resp.ok) {
        throw new Error("Conversation request failed.");
      }
      const json = (await resp.json()) as {
        assistantMessage: string;
        stage: string;
        result: CitizenResult | null;
      };

      setCitizenMessages((prev) => [
        ...prev,
        { role: "assistant", content: json.assistantMessage, timestamp: new Date().toISOString() }
      ]);
      setCitizenStage(json.stage);
      if (json.result) {
        setCitizenResult(json.result);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      setCitizenMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `System error: ${errMsg}`,
          timestamp: new Date().toISOString()
        }
      ]);
    } finally {
      setCitizenLoading(false);
    }
  }

  async function verifyApiKeyNow(
    inputApiKey?: string,
    inputProvider?: AiProvider,
    inputModel?: string
  ): Promise<void> {
    const key = (inputApiKey ?? apiKey).trim();
    const providerToUse = inputProvider ?? provider;
    const modelToUse = (inputModel ?? model).trim() || DEFAULT_MODEL_BY_PROVIDER[providerToUse];
    if (!key) {
      setApiKeyCheckStatus("untested");
      setApiKeyCheckMessage("No API key provided.");
      return;
    }

    setApiKeyCheckStatus("checking");
    setApiKeyCheckMessage("Testing API key...");

    try {
      const resp = await fetch("/api/ai/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: key,
          provider: providerToUse,
          model: modelToUse
        })
      });

      const json = (await resp.json()) as { ok?: boolean; message?: string };
      if (!resp.ok || !json.ok) {
        setApiKeyCheckStatus("failed");
        setApiKeyCheckMessage(json.message ?? "API key verification failed.");
        return;
      }

      setApiKeyCheckStatus("verified");
      setApiKeyCheckMessage(json.message ?? "API key verified.");
    } catch {
      setApiKeyCheckStatus("failed");
      setApiKeyCheckMessage("Network error during API key verification.");
    }
  }

  async function submitConsent(consent: boolean): Promise<void> {
    if (!citizenSessionId) {
      return;
    }
    setConsentStatus("saving");

    const resp = await fetch("/api/case/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: citizenSessionId,
        consent
      })
    });

    if (!resp.ok) {
      setConsentStatus("idle");
      return;
    }

    const json = (await resp.json()) as { synced: boolean; caseId?: string };

    if (json.synced) {
      setConsentStatus("yes");
      if (json.caseId) {
        setSyncedCaseId(json.caseId);
      }
      await refreshCitizenCases(citizenSessionId);
    } else {
      setConsentStatus("no");
    }
  }

  async function refreshCitizenCases(sessionId: string): Promise<void> {
    const resp = await fetch(`/api/citizen/cases?sessionId=${encodeURIComponent(sessionId)}`);
    if (!resp.ok) {
      return;
    }
    const json = (await resp.json()) as { cases: CitizenSyncedCase[] };
    setCitizenCases(json.cases);
  }

  async function loginStaff(): Promise<void> {
    const actorId = staffActorInput.trim();
    if (!actorId) {
      setStaffMsg("Enter your name or employee ID to continue.");
      return;
    }

    const resp = await fetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "staff",
        actorId
      })
    });

    if (!resp.ok) {
      setStaffMsg("Could not start staff session.");
      return;
    }

    const json = (await resp.json()) as { actorId: string };
    setStaffActorId(json.actorId);
    setStaffMsg("");
    await refreshStaffCases();
  }

  async function refreshStaffCases(): Promise<void> {
    setStaffLoadingCases(true);
    try {
      const resp = await fetch("/api/staff/cases");
      if (!resp.ok) {
        throw new Error("Failed to load cases");
      }
      const json = (await resp.json()) as { cases: StaffCase[] };
      setStaffCases(json.cases);
      if (!selectedCaseId && json.cases.length > 0) {
        setSelectedCaseId(json.cases[0].id);
      }
    } catch {
      setStaffMsg("Failed to load case inbox. Please retry.");
    } finally {
      setStaffLoadingCases(false);
    }
  }

  async function generateStaffDraft(): Promise<void> {
    if (!selectedCaseId || !staffActorId) {
      return;
    }
    setStaffDraftLoading(true);
    setStaffMsg("");

    try {
      const resp = await fetch("/api/staff/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: selectedCaseId,
          staffActorId,
          apiKey: apiKey || undefined,
          provider,
          model
        })
      });

      if (!resp.ok) {
        const err = (await resp.json()) as { error?: string };
        throw new Error(err.error ?? "Draft generation failed");
      }

      const json = (await resp.json()) as { aiDraft: string };
      setAiDraft(json.aiDraft);
      setHumanResponse("");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Draft generation failed";
      setStaffMsg(msg);
    } finally {
      setStaffDraftLoading(false);
    }
  }

  async function publishStaffResponse(): Promise<void> {
    if (!selectedCaseId || !staffActorId) {
      return;
    }

    if (!window.confirm("Publish this human-authored response to the citizen?")) {
      return;
    }

    const resp = await fetch("/api/staff/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId: selectedCaseId,
        staffActorId,
        aiDraft,
        humanResponse
      })
    });

    const json = (await resp.json()) as { error?: string; published?: boolean };

    if (!resp.ok) {
      setStaffMsg(json.error ?? "Publish failed");
      return;
    }

    setStaffMsg("Published. The citizen can now view this staff response.");
    await refreshStaffCases();
    if (citizenSessionId) {
      await refreshCitizenCases(citizenSessionId);
    }
  }

  function startMode(nextMode: AppMode): void {
    setMode(nextMode);
    setShowApiKeyModal(true);
    setDraftApiKey("");
    setDraftProvider(provider);
    setDraftModel(model);
  }

  function resetToGateway(): void {
    setMode("gateway");
  }

  return (
    <main className="app-shell">
      <div className="app-inner">
        <section className="banner">
          <div className="hero-grid">
            <div className="hero-main">
              <p className="hero-kicker">Pennsylvania Civic Service Platform</p>
              <h1 className="hero-title">
                Double-Sided <span>Mirror</span>
              </h1>
              <p className="hero-slogan">Built for Pennsylvanians. Built by Pennsylvanians.</p>
              <p className="hero-copy">
                Citizens get clear step-by-step government service plans. Staff get an AI copilot
                while retaining full control over final responses.
              </p>
              <div className="hero-tags">
                <span className="hero-tag">Citizen Guidance</span>
                <span className="hero-tag">Staff Copilot</span>
                <span className="hero-tag">Official PA Links Only</span>
              </div>
            </div>
          </div>
        </section>

        <section className="value-grid">
          <article className="value-card">
            <p className="value-chip">Citizen Mode</p>
            <h3>See the Full Service Process on One Page</h3>
            <p>
              Ask in plain language and get a clear checklist: where to start, what to prepare,
              when to act, and which official Pennsylvania state and city links to use.
            </p>
          </article>
          <article className="value-card">
            <p className="value-chip">Government Staff Mode</p>
            <h3>AI Speed With Human Accountability</h3>
            <p>
              Review citizen-synced cases, use AI as a frontline copilot for technical process
              questions, and publish final replies in staff-authored language.
            </p>
          </article>
        </section>

        <div className="notice">{SAFETY_NOTICE}</div>

        <div className="inline-actions">
          <button className="secondary" onClick={resetToGateway}>
            Return to role selection
          </button>
          <button className="secondary" onClick={() => setShowApiKeyModal(true)}>
            Set or update API key (session memory)
          </button>
          <button
            className="secondary"
            onClick={() => verifyApiKeyNow()}
            disabled={!apiKey || apiKeyCheckStatus === "checking"}
          >
            {apiKeyCheckStatus === "checking" ? "Testing key..." : "Test API key now"}
          </button>
          <span className="muted">
            AI setup: {providerLabel} / {model}
          </span>
          <span className="muted">
            API connection:{" "}
            {apiKeyCheckStatus === "verified" && "Verified"}
            {apiKeyCheckStatus === "failed" && `Failed (${apiKeyCheckMessage})`}
            {apiKeyCheckStatus === "checking" && "Checking..."}
            {apiKeyCheckStatus === "untested" && "Not tested"}
          </span>
        </div>

        {mode === "gateway" && (
          <section className="mode-grid">
            <article className="mode-card">
              <h2>I am a Citizen</h2>
              <p>
                Type short requests like &ldquo;open a restaurant&rdquo; or &ldquo;get my pension.&rdquo; You will receive a
                practical step-by-step plan with timeline, required documents, official forms, and a
                visual flowchart.
              </p>
              <button onClick={() => startMode("citizen")}>Enter Citizen Mode</button>
            </article>

            <article className="mode-card">
              <h2>I am Government Staff</h2>
              <p>
                Review citizen-consented cases, generate AI-assisted drafts for technical questions,
                and publish a human-authored final response with full accountability.
              </p>
              <button onClick={() => startMode("staff")}>Enter Staff Mode</button>
            </article>
          </section>
        )}

        {mode === "citizen" && (
          <section className="workspace-grid">
            <aside className="panel">
              <h3>Progress</h3>
              <div className={`progress-item ${citizenStage === "intake" ? "active" : ""}`}>
                1. Intent intake
              </div>
              <div
                className={`progress-item ${
                  citizenStage === "research" || citizenStage === "refine" ? "active" : ""
                }`}
              >
                2. Policy research + guided refinement
              </div>
              <div
                className={`progress-item ${
                  citizenStage === "final_check" ||
                  citizenStage === "identity_check" ||
                  citizenStage === "identity_input"
                    ? "active"
                    : ""
                }`}
              >
                3. Final supplement + optional name
              </div>
              <div className={`progress-item ${citizenStage === "result" ? "active" : ""}`}>
                4. Action package
              </div>
              <p className="muted">Only Pennsylvania official domains are shown in citations.</p>
            </aside>

            <section className="panel">
              <h3>Citizen Conversation</h3>
              <div className="chat-window">
                {citizenMessages.map((item, idx) => (
                  <div
                    key={`${item.timestamp}-${idx}`}
                    className={`bubble ${item.role === "user" ? "user" : "assistant"}`}
                  >
                    <strong>{item.role === "user" ? "You" : "AI"}:</strong> {item.content}
                  </div>
                ))}
              </div>

              <form className="chat-input-wrap" onSubmit={sendCitizenMessage}>
                <input
                  placeholder="Describe your request or add details..."
                  value={citizenInput}
                  onChange={(e) => setCitizenInput(e.target.value)}
                  disabled={citizenLoading || citizenStage === "result"}
                />
                <button type="submit" disabled={citizenLoading || citizenStage === "result"}>
                  {citizenLoading ? "Sending..." : "Send"}
                </button>
              </form>

              {citizenResult && (
                <div className="result-block">
                  <h4>AI Service Plan Package</h4>
                  <div className="panel" style={{ padding: 12 }}>
                    <p>{citizenResult.summary}</p>
                    <div className="notice">{citizenResult.riskNotice}</div>
                  </div>

                  <div className="panel" style={{ padding: 12 }}>
                    <h4>Ordered actions and required materials</h4>
                    <ol>
                      {citizenResult.actionPlan.map((step) => (
                        <li key={step.order}>
                          <strong>{step.title}</strong> ({step.timing})
                          <div className="muted">{step.details}</div>
                          <div className="muted">Agency: {step.agency}</div>
                          <div className="muted">Materials: {step.materials.join(", ")}</div>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="panel" style={{ padding: 12 }}>
                    <h4>Flowchart view</h4>
                    <div className="step-flow">
                      {citizenResult.actionPlan.map((step, index) => (
                        <div key={step.order}>
                          <div className="step-node">
                            {step.order}. {step.title}
                          </div>
                          {index < citizenResult.actionPlan.length - 1 && (
                            <div className="step-arrow">↓</div>
                          )}
                        </div>
                      ))}
                    </div>
                    <details>
                      <summary>View Mermaid source</summary>
                      <pre>{citizenResult.flowchartMermaid}</pre>
                    </details>
                  </div>

                  <div className="panel" style={{ padding: 12 }}>
                    <h4>Official Pennsylvania state and city links/forms</h4>
                    <div className="citation-list">
                      {citizenResult.citations.map((cite) => (
                        <div key={cite.url} className="citation-item">
                          <a href={cite.url} target="_blank" rel="noreferrer">
                            {cite.title}
                          </a>
                          <div className="muted">{cite.agency}</div>
                          <div className="muted">{cite.publishedOrUpdated}</div>
                          <div className="muted">{cite.snippet}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="panel" style={{ padding: 12 }}>
                    <h4>Share this case with government staff?</h4>
                    <p className="muted">
                      Staff can access this conversation only if you explicitly consent.
                    </p>
                    <div className="inline-actions">
                      <button
                        className="success"
                        onClick={() => submitConsent(true)}
                        disabled={consentStatus === "saving" || consentStatus === "yes"}
                      >
                        Share with staff
                      </button>
                      <button
                        className="secondary"
                        onClick={() => submitConsent(false)}
                        disabled={consentStatus === "saving" || consentStatus === "no"}
                      >
                        Keep private
                      </button>
                      <span className="muted">
                        {consentStatus === "yes" && `Shared (Case ID: ${syncedCaseId ?? "-"})`}
                        {consentStatus === "no" && "Not shared."}
                        {consentStatus === "saving" && "Processing..."}
                      </span>
                    </div>
                  </div>

                  {consentStatus === "yes" && citizenSessionId && (
                    <div className="panel" style={{ padding: 12 }}>
                      <h4>Staff Response Feed</h4>
                      <div className="inline-actions">
                        <button className="secondary" onClick={() => refreshCitizenCases(citizenSessionId)}>
                          Refresh responses
                        </button>
                      </div>
                      {citizenCases.length === 0 && (
                        <p className="muted">No staff response has been published yet.</p>
                      )}
                      {citizenCases.map((item) => (
                        <div key={item.id} className="citation-item">
                          <div className={`badge ${item.status}`}>{item.status}</div>
                          {item.responses.length === 0 && (
                            <p className="muted">No published response for this case yet.</p>
                          )}
                          {item.responses.map((resp, idx) => (
                            <div key={`${resp.publishedAt}-${idx}`}>
                              <p>{resp.humanResponse}</p>
                              <p className="muted">
                                Published by {resp.staffActorId} on{" "}
                                {new Date(resp.publishedAt).toLocaleString()}
                              </p>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            <aside className="panel">
              <h3>Quick Notes</h3>
              <p className="muted">
                1. Keep first input short. Examples: &quot;get my pension&quot;,
                &quot;open a restaurant&quot;, &quot;replace my ID&quot;. Then provide Pennsylvania
                city/locality.
              </p>
              <p className="muted">
                2. If you provide an API key, the system attempts live AI retrieval every turn
                using your newest message before asking the next question.
              </p>
              <p className="muted">
                3. The assistant will ask one plain-language question per turn and usually reaches
                final output in about 4-5 guidance turns.
              </p>
              <p className="muted">
                4. If live retrieval is temporarily unavailable, the chat still continues with
                official Pennsylvania fallback sources.
              </p>
              <p className="muted">
                5. Final package includes ordered steps, required materials, state + city official
                links, and flowchart.
              </p>
              <p className="muted">
                6. For legal interpretation or eligibility disputes, confirm with the responsible agency.
              </p>
            </aside>
          </section>
        )}

        {mode === "staff" && (
          <section className="workspace-grid">
            <aside className="panel">
              <h3>Staff Entry</h3>
              {!staffActorId ? (
                <>
                  <input
                    placeholder="Enter name or employee ID"
                    value={staffActorInput}
                    onChange={(e) => setStaffActorInput(e.target.value)}
                  />
                  <div style={{ height: 10 }} />
                  <button onClick={loginStaff}>Open staff workspace</button>
                  {staffMsg && <p className="muted">{staffMsg}</p>}
                </>
              ) : (
                <>
                  <p>
                    Signed in as: <strong>{staffActorId}</strong>
                  </p>
                  <div className="inline-actions">
                    <button className="secondary" onClick={refreshStaffCases} disabled={staffLoadingCases}>
                      Refresh case inbox
                    </button>
                  </div>
                </>
              )}

              <div style={{ marginTop: 14 }}>
                <h4>Consented Case Inbox</h4>
                {staffCases.map((item) => (
                  <div
                    key={item.id}
                    className={`case-item ${selectedCaseId === item.id ? "active" : ""}`}
                    onClick={() => {
                      setSelectedCaseId(item.id);
                      setAiDraft("");
                    }}
                  >
                    <div>{item.intentTitle}</div>
                    <div className="muted">
                      Citizen: {item.citizenDisplayName ? item.citizenDisplayName : "Anonymous"}
                    </div>
                    <div className={`badge ${item.status}`}>{item.status}</div>
                  </div>
                ))}
                {staffCases.length === 0 && (
                  <p className="muted">No cases available yet (only citizen-consented records appear here).</p>
                )}
              </div>
            </aside>

            <section className="panel">
              <h3>Case Context</h3>
              {!selectedCase ? (
                <p className="muted">Select a case from the left panel.</p>
              ) : (
                <>
                  <p>
                    <strong>Issue:</strong> {selectedCase.intentTitle}
                  </p>
                  <p>
                    <strong>Citizen Name/Nickname:</strong>{" "}
                    {selectedCase.citizenDisplayName ? selectedCase.citizenDisplayName : "Anonymous"}
                  </p>
                  <p>
                    <strong>AI Summary:</strong> {selectedCase.citizenSummary}
                  </p>

                  <h4>Citizen Transcript</h4>
                  <div className="chat-window" style={{ maxHeight: 280 }}>
                    {selectedCase.transcript.map((msg, idx) => (
                      <div
                        key={`${msg.timestamp}-${idx}`}
                        className={`bubble ${msg.role === "user" ? "user" : "assistant"}`}
                      >
                        <strong>{msg.role === "user" ? "Citizen" : "AI"}</strong>: {msg.content}
                      </div>
                    ))}
                  </div>

                  <h4>Official Citations</h4>
                  <div className="citation-list">
                    {selectedCase.citations.map((cite) => (
                      <div key={cite.url} className="citation-item">
                        <a href={cite.url} target="_blank" rel="noreferrer">
                          {cite.title}
                        </a>
                        <div className="muted">{cite.agency}</div>
                      </div>
                    ))}
                  </div>

                  {selectedCase.response && (
                    <div className="panel" style={{ padding: 12, marginTop: 12 }}>
                      <h4>Published Response</h4>
                      <p>{selectedCase.response.humanResponse}</p>
                      <p className="muted">
                        Published by {selectedCase.response.staffActorId} on{" "}
                        {new Date(selectedCase.response.publishedAt).toLocaleString()}
                      </p>
                    </div>
                  )}
                </>
              )}
            </section>

            <aside className="panel">
              <h3>AI Draft and Human Response</h3>
              <p className="muted">
                AI can suggest a draft, but staff must rewrite before publishing the final response.
              </p>
              <button onClick={generateStaffDraft} disabled={!selectedCaseId || !staffActorId || staffDraftLoading}>
                {staffDraftLoading ? "Generating..." : "Generate AI draft"}
              </button>

              <div style={{ height: 10 }} />
              <label>
                AI draft (read-only)
                <textarea value={aiDraft} readOnly placeholder="Click above to generate a draft" />
              </label>

              <label>
                Human-authored response (required; cannot exactly match AI draft)
                <textarea
                  value={humanResponse}
                  onChange={(e) => setHumanResponse(e.target.value)}
                  placeholder="Rewrite with your own wording and include validated next steps, expected timeline, and agency contact path."
                />
              </label>

              <button className="warning" onClick={publishStaffResponse} disabled={!selectedCaseId || !staffActorId}>
                Publish human response
              </button>

              {staffMsg && <p className="muted">{staffMsg}</p>}
            </aside>
          </section>
        )}

        {showApiKeyModal && (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal-card">
              <h3>Choose AI Provider and API Key</h3>
              <p className="muted">
                Select the provider first, then paste the matching API key. The key is stored only
                in session memory and is never written to database or logs.
              </p>
              <label>
                Provider
                <select
                  value={draftProvider}
                  onChange={(e) => {
                    const next = e.target.value as AiProvider;
                    setDraftProvider(next);
                    setDraftModel(DEFAULT_MODEL_BY_PROVIDER[next]);
                    setApiKeyCheckStatus("untested");
                    setApiKeyCheckMessage("");
                  }}
                >
                  {PROVIDER_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ height: 10 }} />
              <label>
                Model
                <select
                  value={draftModel}
                  onChange={(e) => {
                    setDraftModel(e.target.value);
                    setApiKeyCheckStatus("untested");
                    setApiKeyCheckMessage("");
                  }}
                >
                  {PROVIDER_MODEL_OPTIONS[draftProvider].map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ height: 10 }} />
              <input
                type="password"
                value={draftApiKey}
                onChange={(e) => setDraftApiKey(e.target.value)}
                placeholder="Paste API key for selected provider"
              />
              <div style={{ height: 12 }} />
              <div className="inline-actions">
                <button
                  onClick={async () => {
                    const key = draftApiKey.trim();
                    const nextProvider = draftProvider;
                    const nextModel = draftModel.trim() || DEFAULT_MODEL_BY_PROVIDER[nextProvider];
                    setProvider(nextProvider);
                    setModel(nextModel);
                    setApiKey(key);
                    setShowApiKeyModal(false);
                    if (key) {
                      await verifyApiKeyNow(key, nextProvider, nextModel);
                    } else {
                      setApiKeyCheckStatus("untested");
                      setApiKeyCheckMessage("No API key provided.");
                    }
                  }}
                >
                  Save and continue
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    const nextProvider = draftProvider;
                    const nextModel = draftModel.trim() || DEFAULT_MODEL_BY_PROVIDER[nextProvider];
                    setProvider(nextProvider);
                    setModel(nextModel);
                    setApiKey("");
                    setApiKeyCheckStatus("untested");
                    setApiKeyCheckMessage("No API key provided.");
                    setShowApiKeyModal(false);
                  }}
                >
                  Continue without API key
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
