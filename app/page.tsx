"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { v4 as uuid } from "uuid";
import { AgentRun, AgentSchedule, BlogTopic, BusinessProfile, PublishingChannel } from "@/lib/types";
import { computeNextRun } from "@/lib/scheduler";

dayjs.extend(relativeTime);

const emptyProfile: BusinessProfile = {
  name: "",
  description: "",
  idealCustomer: "",
  tone: "Authoritative but friendly",
  keywords: "",
  websiteUrl: ""
};

const defaultSchedule: AgentSchedule = {
  cadence: "weekly",
  publishHour: 9,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
};

const storageKeys = {
  profile: "agentic.profile",
  topics: "agentic.topics",
  schedule: "agentic.schedule",
  channel: "agentic.channel",
  runs: "agentic.runs"
};

const initialChannel: PublishingChannel = {
  id: "webhook-channel",
  type: "webhook",
  name: "Webhook Publisher",
  endpointUrl: "",
  headers: {}
};

type StatusBadgeProps = {
  status: AgentRun["status"];
};

const StatusBadge = ({ status }: StatusBadgeProps) => {
  const colors: Record<AgentRun["status"], string> = {
    pending: "#6366f1",
    generating: "#f59e0b",
    posted: "#10b981",
    failed: "#ef4444"
  };

  return (
    <span
      style={{
        background: `${colors[status]}1f`,
        color: colors[status],
        padding: "0.25rem 0.6rem",
        borderRadius: "999px",
        fontSize: "0.75rem",
        fontWeight: 600,
        textTransform: "capitalize"
      }}
    >
      {status}
    </span>
  );
};

const Page = () => {
  const [profile, setProfile] = useState<BusinessProfile>(emptyProfile);
  const [topics, setTopics] = useState<BlogTopic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<AgentSchedule>(defaultSchedule);
  const [channel, setChannel] = useState<PublishingChannel>(initialChannel);
  const [runs, setRuns] = useState<AgentRun[]>([]);

  const [isGeneratingTopics, setIsGeneratingTopics] = useState(false);
  const [isRunningAgent, setIsRunningAgent] = useState(false);
  const [activeTab, setActiveTab] = useState<"strategy" | "automation" | "history">("strategy");

  useEffect(() => {
    const loadStored = () => {
      try {
        const storedProfile = localStorage.getItem(storageKeys.profile);
        const storedTopics = localStorage.getItem(storageKeys.topics);
        const storedSchedule = localStorage.getItem(storageKeys.schedule);
        const storedChannel = localStorage.getItem(storageKeys.channel);
        const storedRuns = localStorage.getItem(storageKeys.runs);
        if (storedProfile) setProfile(JSON.parse(storedProfile));
        if (storedTopics) {
          const parsedTopics = JSON.parse(storedTopics);
          setTopics(parsedTopics);
          if (parsedTopics.length > 0) {
            setSelectedTopicId(parsedTopics[0].id);
          }
        }
        if (storedSchedule) setSchedule(JSON.parse(storedSchedule));
        if (storedChannel) setChannel(JSON.parse(storedChannel));
        if (storedRuns) setRuns(JSON.parse(storedRuns));
      } catch (error) {
        console.error("Failed to restore state", error);
      }
    };
    loadStored();
  }, []);

  useEffect(() => {
    localStorage.setItem(storageKeys.profile, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem(storageKeys.topics, JSON.stringify(topics));
  }, [topics]);

  useEffect(() => {
    localStorage.setItem(storageKeys.schedule, JSON.stringify(schedule));
  }, [schedule]);

  useEffect(() => {
    localStorage.setItem(storageKeys.channel, JSON.stringify(channel));
  }, [channel]);

  useEffect(() => {
    localStorage.setItem(storageKeys.runs, JSON.stringify(runs.slice(0, 30)));
  }, [runs]);

  useEffect(() => {
    if (!schedule.nextRunIso) return;
    const interval = setInterval(() => {
      const due = dayjs(schedule.nextRunIso);
      if (due.isBefore(dayjs())) {
        const topicToUse = selectedTopicId ? topics.find((t) => t.id === selectedTopicId) : topics[0];
        if (topicToUse) {
          triggerAgent(topicToUse, true);
        }
      }
    }, 45000);

    return () => clearInterval(interval);
  }, [schedule.nextRunIso, topics, selectedTopicId]);

  const selectedTopic = useMemo(
    () => topics.find((topic) => topic.id === selectedTopicId ?? "") ?? null,
    [topics, selectedTopicId]
  );

  const handleGenerateTopics = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isGeneratingTopics) return;
    setIsGeneratingTopics(true);
    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile })
      });
      if (!res.ok) throw new Error("Topic generation failed");
      const data = await res.json();
      setTopics(data.topics);
      setSelectedTopicId(data.topics[0]?.id ?? null);
      setSchedule((current) => {
        const base = current ?? defaultSchedule;
        return { ...base, nextRunIso: computeNextRun(base) };
      });
    } catch (error) {
      console.error("Failed to generate topics", error);
      window.alert("Unable to generate topics. Confirm your OpenAI key is configured in Vercel.");
    } finally {
      setIsGeneratingTopics(false);
    }
  };

  const triggerAgent = async (topic: BlogTopic, isAutomated = false) => {
    if (isRunningAgent) return;
    setIsRunningAgent(true);

    const runId = uuid();
    const startedAt = new Date().toISOString();
    setRuns((prev) => [
      {
        id: runId,
        topicId: topic.id,
        topicTitle: topic.title,
        status: "generating",
        startedAt
      },
      ...prev
    ]);

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          topic,
          channel: channel.endpointUrl ? channel : undefined
        })
      });

      if (!res.ok) {
        throw new Error("Agent run failed");
      }

      const data = await res.json();

      setRuns((prev) =>
        prev.map((run) =>
          run.id === runId
            ? {
                ...run,
                status: channel.endpointUrl ? "posted" : "pending",
                finishedAt: new Date().toISOString(),
                summary: data.blog.summary,
                destination: channel.endpointUrl ? channel.name : "Preview Only"
              }
            : run
        )
      );

      if (!channel.endpointUrl) {
        localStorage.setItem(`agentic.preview.${runId}`, data.blog.bodyMarkdown);
        window.open(`/preview/${runId}`, "_blank");
      }

      const nextRunIso = computeNextRun(schedule);
      setSchedule({ ...schedule, nextRunIso });
    } catch (error) {
      console.error("Agent run failed", error);
      setRuns((prev) =>
        prev.map((run) =>
          run.id === runId
            ? {
                ...run,
                status: "failed",
                finishedAt: new Date().toISOString(),
                error: error instanceof Error ? error.message : "Unknown error"
              }
            : run
        )
      );
      if (!isAutomated) {
        window.alert("Agent run failed. Check your configuration and OpenAI key.");
      }
    } finally {
      setIsRunningAgent(false);
    }
  };

  const handleScheduleUpdate = (updates: Partial<AgentSchedule>) => {
    const next = { ...schedule, ...updates };
    if (updates.cadence || updates.publishHour || !schedule.nextRunIso) {
      next.nextRunIso = computeNextRun(next);
    }
    setSchedule(next);
  };

  const handleChannelChange = (updates: Partial<PublishingChannel>) => {
    const merged: PublishingChannel = { ...channel, ...updates };
    if (!merged.id) {
      merged.id = `channel-${Date.now()}`;
    }
    setChannel(merged);
  };

  const testChannel = async () => {
    try {
      const res = await fetch("/api/connectors/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel })
      });
      if (!res.ok) throw new Error("Connector failed");
      window.alert("Connection verified!");
    } catch (error) {
      console.error("Connector test failed", error);
      window.alert("Connection failed. Verify credentials.");
    }
  };

  return (
    <div style={{ padding: "4rem 0" }}>
      <div
        className="glass-panel neon-border"
        style={{
          margin: "0 auto",
          maxWidth: "1200px",
          padding: "3rem",
          display: "flex",
          flexDirection: "column",
          gap: "2.5rem"
        }}
      >
        <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <span style={{ fontWeight: 600, letterSpacing: "0.15em", color: "#60a5fa" }}>AUTONOMOUS GROWTH ENGINE</span>
          <h1 style={{ fontSize: "2.5rem", margin: 0 }}>
            AI Agent for Revenue-Generating Blog Publishing
          </h1>
          <p style={{ maxWidth: "720px", lineHeight: 1.7, color: "#94a3b8" }}>
            Feed the agent your positioning, approve strategic topics, plug in where content should publish, and let
            it deploy high-converting articles on autopilot. Built for founders and marketing teams who want consistent,
            on-brand thought leadership without headcount.
          </p>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <button
              className="btn-primary"
              onClick={() => setActiveTab("automation")}
              disabled={activeTab === "automation"}
            >
              Configure Automation
            </button>
            <button
              className="btn-secondary"
              onClick={() => setActiveTab("history")}
              disabled={activeTab === "history"}
            >
              View Activity Log
            </button>
          </div>
        </section>

        <nav
          style={{
            display: "flex",
            gap: "1rem"
          }}
        >
          {[
            { key: "strategy", label: "Content Strategy" },
            { key: "automation", label: "Automation & Delivery" },
            { key: "history", label: "Agent Activity" }
          ].map((tab) => (
            <button
              key={tab.key}
              className={activeTab === tab.key ? "btn-primary" : "btn-secondary"}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === "strategy" && (
          <section style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "2rem" }}>
            <form
              onSubmit={handleGenerateTopics}
              className="glass-panel"
              style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <h2 style={{ margin: 0 }}>1. Train the Agent on Your Business</h2>
              <p style={{ color: "#94a3b8", fontSize: "0.95rem" }}>
                The more detail you give, the smarter the agent becomes. Include positioning, differentiators, sales
                objections, and value props.
              </p>
              <input
                required
                placeholder="Brand / Product Name"
                value={profile.name}
                onChange={(event) => setProfile({ ...profile, name: event.target.value })}
              />
              <textarea
                required
                placeholder="Business description, product details, proof points..."
                rows={5}
                value={profile.description}
                onChange={(event) => setProfile({ ...profile, description: event.target.value })}
              />
              <textarea
                required
                placeholder="Ideal customer profile, segments, roles..."
                rows={4}
                value={profile.idealCustomer}
                onChange={(event) => setProfile({ ...profile, idealCustomer: event.target.value })}
              />
              <input
                placeholder="Preferred voice and tone"
                value={profile.tone}
                onChange={(event) => setProfile({ ...profile, tone: event.target.value })}
              />
              <input
                placeholder="Priority keywords (comma separated)"
                value={profile.keywords}
                onChange={(event) => setProfile({ ...profile, keywords: event.target.value })}
              />
              <input
                placeholder="Primary website URL"
                value={profile.websiteUrl}
                onChange={(event) => setProfile({ ...profile, websiteUrl: event.target.value })}
              />
              <button className="btn-primary" type="submit" disabled={isGeneratingTopics}>
                {isGeneratingTopics ? "Generating..." : "Generate Revenue-Focused Topics"}
              </button>
            </form>

            <div className="glass-panel" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <h2 style={{ margin: 0 }}>2. Approve Strategic Topics</h2>
              <p style={{ color: "#94a3b8", fontSize: "0.95rem" }}>
                Topics are scored by conversion potential. Select the one you want the agent to ship next.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxHeight: "540px", overflowY: "auto" }}>
                {topics.length === 0 && (
                  <div
                    style={{
                      padding: "2rem",
                      border: "1px dashed rgba(148, 163, 184, 0.35)",
                      borderRadius: "1rem",
                      textAlign: "center",
                      color: "#64748b"
                    }}
                  >
                    Generate topics to start building your editorial roadmap.
                  </div>
                )}
                {topics.map((topic) => (
                  <button
                    key={topic.id}
                    className={selectedTopicId === topic.id ? "btn-primary" : "btn-secondary"}
                    onClick={() => setSelectedTopicId(topic.id)}
                    style={{ textAlign: "left", alignItems: "flex-start", flexDirection: "column", gap: "0.35rem" }}
                  >
                    <span style={{ fontWeight: 600 }}>{topic.title}</span>
                    <span style={{ fontSize: "0.85rem", color: "rgba(226, 232, 240, 0.8)" }}>{topic.angle}</span>
                    <span style={{ fontSize: "0.8rem", color: "rgba(226, 232, 240, 0.6)" }}>
                      Audience: {topic.audience} · Relevance Score: {topic.score}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "rgba(226, 232, 240, 0.5)" }}>
                      Keywords: {topic.keywords.join(", ")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === "automation" && (
          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
            <div className="glass-panel" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <h2 style={{ margin: 0 }}>3. Configure Publishing Destination</h2>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  className={channel.type === "webhook" ? "btn-primary" : "btn-secondary"}
                  onClick={() => handleChannelChange({ type: "webhook" })}
                >
                  Generic Webhook
                </button>
                <button
                  className={channel.type === "wordpress" ? "btn-primary" : "btn-secondary"}
                  onClick={() => handleChannelChange({ type: "wordpress" })}
                >
                  WordPress
                </button>
              </div>

              <input
                placeholder="Channel name"
                value={channel.name}
                onChange={(event) => handleChannelChange({ name: event.target.value })}
              />
              <input
                placeholder={channel.type === "wordpress" ? "https://yourblog.com" : "https://yourwebhook.endpoint"}
                value={channel.endpointUrl}
                onChange={(event) => handleChannelChange({ endpointUrl: event.target.value })}
              />

              {channel.type === "wordpress" && (
                <>
                  <input
                    placeholder="WordPress username"
                    value={channel.username ?? ""}
                    onChange={(event) => handleChannelChange({ username: event.target.value })}
                  />
                  <input
                    placeholder="WordPress application password"
                    value={channel.appPassword ?? ""}
                    onChange={(event) => handleChannelChange({ appPassword: event.target.value })}
                  />
                </>
              )}

              {channel.type === "webhook" && (
                <textarea
                  placeholder='Optional custom headers JSON (e.g. {"Authorization":"Bearer ..."})'
                  rows={3}
                  value={JSON.stringify(channel.headers ?? {}, null, 2)}
                  onChange={(event) => {
                    try {
                      const parsed = JSON.parse(event.target.value || "{}");
                      handleChannelChange({ headers: parsed });
                    } catch (error) {
                      console.error("Invalid JSON headers", error);
                    }
                  }}
                />
              )}

              <button className="btn-secondary" onClick={testChannel} disabled={!channel.endpointUrl}>
                Verify Connection
              </button>
            </div>

            <div className="glass-panel" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <h2 style={{ margin: 0 }}>4. Set Automation Cadence</h2>
              <p style={{ color: "#94a3b8", fontSize: "0.95rem" }}>
                The agent will auto-publish at the cadence and hour you specify. It always uses the currently selected
                topic.
              </p>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                {(["daily", "weekly", "monthly"] as const).map((cadence) => (
                  <button
                    key={cadence}
                    className={schedule.cadence === cadence ? "btn-primary" : "btn-secondary"}
                    onClick={() => handleScheduleUpdate({ cadence })}
                  >
                    {cadence.charAt(0).toUpperCase() + cadence.slice(1)}
                  </button>
                ))}
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                <span>Publish Hour (0-23)</span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={schedule.publishHour}
                  onChange={(event) => handleScheduleUpdate({ publishHour: Number(event.target.value) })}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                <span>Timezone</span>
                <input
                  value={schedule.timezone}
                  onChange={(event) => handleScheduleUpdate({ timezone: event.target.value })}
                />
              </label>
              <div
                style={{
                  border: "1px solid rgba(148, 163, 184, 0.25)",
                  borderRadius: "1rem",
                  padding: "1.5rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem"
                }}
              >
                <span style={{ fontWeight: 600 }}>Next Automated Publish</span>
                <span style={{ color: "#94a3b8" }}>
                  {schedule.nextRunIso ? dayjs(schedule.nextRunIso).fromNow() : "Not scheduled yet"}
                </span>
                <span style={{ color: "#64748b", fontSize: "0.85rem" }}>
                  {schedule.nextRunIso ? dayjs(schedule.nextRunIso).format("MMM D, YYYY h:mm A z") : ""}
                </span>
              </div>
              <button
                className="btn-primary"
                onClick={() => selectedTopic && triggerAgent(selectedTopic, false)}
                disabled={!selectedTopic || isRunningAgent}
              >
                {isRunningAgent ? "Running Agent..." : "Ship Article Now"}
              </button>
            </div>
          </section>
        )}

        {activeTab === "history" && (
          <section className="glass-panel" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <h2 style={{ margin: 0 }}>Agent Run History</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }}>
              {runs.length === 0 && (
                <div
                  style={{
                    padding: "2rem",
                    border: "1px dashed rgba(148, 163, 184, 0.35)",
                    borderRadius: "1rem",
                    textAlign: "center",
                    color: "#64748b"
                  }}
                >
                  No runs yet. Trigger the agent to see activity here.
                </div>
              )}
              {runs.map((run) => (
                <div
                  key={run.id}
                  style={{
                    border: "1px solid rgba(148, 163, 184, 0.25)",
                    borderRadius: "1rem",
                    padding: "1.25rem",
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: "1rem",
                    alignItems: "center"
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    <span style={{ fontWeight: 600 }}>{run.topicTitle}</span>
                    <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
                      {dayjs(run.startedAt).format("MMM D, YYYY h:mm A")}
                    </span>
                    {run.destination && (
                      <span style={{ fontSize: "0.85rem", color: "#22d3ee" }}>
                        Destination: {run.destination}
                      </span>
                    )}
                    {run.summary && (
                      <span style={{ fontSize: "0.85rem", color: "#cbd5f5" }}>{run.summary}</span>
                    )}
                    {run.error && (
                      <span style={{ fontSize: "0.85rem", color: "#f87171" }}>{run.error}</span>
                    )}
                  </div>
                  <StatusBadge status={run.status} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default Page;
