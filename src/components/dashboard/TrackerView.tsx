"use client";

/**
 * Question tracker.
 *
 * Real read/write against /api/tracker. Marking a question solved updates the
 * dashboard's topic progress and difficulty breakdown, because those are
 * derived from these rows.
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { TOPIC_ORDER } from "@/lib/types";
import styles from "@/app/dashboard/dashboard.module.css";

type TrackerQuestion = {
  id: string;
  slug: string;
  title: string;
  difficulty: string;
  topic: string | null;
  url: string | null;
  status: "todo" | "solved" | "review";
  solvedAt: string | null;
};

const DIFFICULTY_TONE: Record<string, "ok" | "warn" | "bad"> = {
  Easy: "ok",
  Medium: "warn",
  Hard: "bad",
};

export function TrackerView() {
  const [questions, setQuestions] = useState<TrackerQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // add form
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState<"Easy" | "Medium" | "Hard">("Medium");
  const [topic, setTopic] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    const res = await apiFetch<{ questions: TrackerQuestion[] }>(
      `/api/tracker?${params.toString()}`
    );
    if (res.ok) {
      setQuestions(res.data.questions);
      setError(null);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, [search, status]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 280);
    return () => clearTimeout(t);
  }, [load]);

  const setQuestionState = useCallback(
    async (id: string, next: "todo" | "solved" | "review") => {
      setBusyId(id);
      const res = await apiFetch<{ ok: true }>("/api/tracker", {
        json: { questionId: id, status: next },
      });
      if (res.ok) {
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === id
              ? { ...q, status: next, solvedAt: next === "solved" ? new Date().toISOString() : null }
              : q
          )
        );
      } else {
        setError(res.error);
      }
      setBusyId(null);
    },
    []
  );

  const addQuestion = useCallback(async () => {
    if (!title.trim()) {
      setError("Give the question a title.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<{ ok: true; questionId: string }>("/api/tracker", {
      json: {
        title: title.trim(),
        difficulty,
        topic: topic.trim() || null,
        status: "todo",
      },
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setTitle("");
    setTopic("");
    setDifficulty("Medium");
    setAdding(false);
    await load();
  }, [title, difficulty, topic, load]);

  const counts = {
    solved: questions.filter((q) => q.status === "solved").length,
    review: questions.filter((q) => q.status === "review").length,
    todo: questions.filter((q) => q.status === "todo").length,
  };

  return (
    <>
      <div className={styles.sectionHead} style={{ marginBottom: 18 }}>
        <div>
          <h1 className={styles.pageTitle} style={{ marginBottom: 4 }}>
            Question Tracker
          </h1>
          <p className={styles.pageSub}>
            Track practice questions. Solved questions feed your topic progress and difficulty mix.
          </p>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "+ Add question"}
        </button>
      </div>

      {error && (
        <div className={styles.banner} data-tone="error">
          <span>{error}</span>
        </div>
      )}

      {adding && (
        <div className={styles.card} style={{ marginBottom: 16 }}>
          <div className={styles.fieldGrid}>
            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label className={styles.label} htmlFor="tq-title">
                Question title
              </label>
              <input
                id="tq-title"
                className={styles.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Two Sum"
                maxLength={180}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="tq-diff">
                Difficulty
              </label>
              <select
                id="tq-diff"
                className={styles.select}
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="tq-topic">
                Topic
              </label>
              <select
                id="tq-topic"
                className={styles.select}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              >
                <option value="">No topic</option>
                {TOPIC_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className={styles.formActions}>
            <button type="button" className={styles.btnPrimary} onClick={addQuestion} disabled={saving}>
              {saving ? "Saving…" : "Add question"}
            </button>
          </div>
        </div>
      )}

      <div className={styles.formActions} style={{ marginTop: 0, marginBottom: 14 }}>
        <input
          className={styles.input}
          style={{ maxWidth: 320 }}
          placeholder="Search questions or topics…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search questions"
        />
        <div className={styles.rangeTabs}>
          {[
            { key: "", label: "All" },
            { key: "todo", label: "To do" },
            { key: "solved", label: "Solved" },
            { key: "review", label: "Review" },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              className={`${styles.rangeTab} ${status === f.key ? styles.rangeTabOn : ""}`}
              onClick={() => setStatus(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className={styles.hint}>
          {counts.solved} solved · {counts.review} for review · {counts.todo} to do
        </span>
      </div>

      {loading ? (
        <div className={styles.skeleton} style={{ height: 320 }} />
      ) : questions.length === 0 ? (
        <div className={styles.empty}>
          <strong>No questions here yet.</strong>
          <span>
            Add a question to start tracking, or clear the filters if you are searching for something
            specific.
          </span>
        </div>
      ) : (
        <div className={styles.listCard}>
          {questions.map((q) => (
            <div key={q.id} className={styles.listRow}>
              <div className={styles.listRowMain}>
                <span className={styles.listRowTitle}>
                  {q.url ? (
                    <a href={q.url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                      {q.title} ↗
                    </a>
                  ) : (
                    q.title
                  )}
                </span>
                <span className={styles.listRowSub}>
                  {q.topic ? `${q.topic} · ` : ""}
                  {q.difficulty}
                </span>
              </div>
              <div className={styles.listRowActions}>
                <span className={styles.pill} data-tone={DIFFICULTY_TONE[q.difficulty]}>
                  {q.difficulty}
                </span>
                <select
                  className={styles.select}
                  style={{ width: 132 }}
                  value={q.status}
                  disabled={busyId === q.id}
                  onChange={(e) =>
                    setQuestionState(q.id, e.target.value as "todo" | "solved" | "review")
                  }
                  aria-label={`Status for ${q.title}`}
                >
                  <option value="todo">To do</option>
                  <option value="solved">Solved</option>
                  <option value="review">Review</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
