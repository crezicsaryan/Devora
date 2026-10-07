"use client";

/**
 * Projects manager — create, list and delete real project rows.
 *
 * GitHub-sourced projects are read-only here (they are refreshed by the sync);
 * manual projects can be edited and removed.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { validateUrl } from "@/lib/validation";
import type { ProjectRow } from "@/lib/types";
import styles from "@/app/dashboard/dashboard.module.css";

export function ProjectsManager() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [techStack, setTechStack] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const load = useCallback(async () => {
    const res = await api.projects();
    if (res.ok) setProjects(res.data.projects);
    else setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;

    void (async () => {
      // Deep link from the dashboard "+ Add Project" card.
      const wantsNew = new URLSearchParams(window.location.search).get("new") === "1";

      const res = await api.projects();
      if (!alive) return;
      if (res.ok) setProjects(res.data.projects);
      else setError(res.error);
      setLoading(false);
      if (wantsNew) setOpen(true);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    if (!name.trim()) {
      setError("A project needs a name.");
      return;
    }
    if (githubUrl.trim() && validateUrl(githubUrl, { requiredHost: "github.com", label: "GitHub URL" }).error) {
      setError("The GitHub link must be a github.com URL.");
      return;
    }
    if (liveUrl.trim() && validateUrl(liveUrl, { label: "Live demo URL" }).error) {
      setError("The live demo link does not look like a valid URL.");
      return;
    }

    setBusy(true);
    const res = await api.createProject({
      name: name.trim(),
      description: description.trim(),
      techStack: techStack
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      githubUrl: githubUrl.trim(),
      liveUrl: liveUrl.trim(),
      imageUrl: imageUrl.trim(),
    });
    setBusy(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    setName("");
    setDescription("");
    setTechStack("");
    setGithubUrl("");
    setLiveUrl("");
    setImageUrl("");
    setOpen(false);
    await load();
  }, [name, description, techStack, githubUrl, liveUrl, imageUrl, load]);

  const remove = useCallback(
    async (id: string) => {
      const res = await api.deleteProject(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setProjects(res.data.projects);
    },
    []
  );

  if (loading) {
    return (
      <>
        <h1 className={styles.pageTitle}>Projects</h1>
        <div className={styles.skeleton} style={{ height: 360, marginTop: 18 }} />
      </>
    );
  }

  return (
    <>
      <div className={styles.sectionHead} style={{ marginBottom: 20 }}>
        <div>
          <h1 className={styles.pageTitle} style={{ marginBottom: 4 }}>
            Projects
          </h1>
          <p className={styles.pageSub}>
            Showcase what you have built. GitHub repositories you push to appear here automatically.
          </p>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={() => setOpen(true)}>
          + Add Project
        </button>
      </div>

      {error && (
        <div className={styles.banner} data-tone="error">
          <span>{error}</span>
        </div>
      )}

      {projects.length === 0 ? (
        <div className={styles.empty}>
          <strong>No projects yet.</strong>
          <span>Add one manually, or connect GitHub and your repositories will show up here.</span>
          <button
            type="button"
            className={styles.btnPrimary}
            style={{ marginTop: 4 }}
            onClick={() => setOpen(true)}
          >
            Add your first project
          </button>
        </div>
      ) : (
        <div className={styles.projectGrid}>
          {projects.map((p) => (
            <article key={p.id} className={styles.projectCard}>
              <div className={styles.projectThumb}>
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" />
                ) : (
                  <span className={styles.projectThumbFallback}>
                    {p.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className={styles.projectBody}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h3 className={styles.projectName} style={{ margin: 0, flex: 1 }}>
                    {p.name}
                  </h3>
                  <span className={styles.pill} data-tone={p.source === "github" ? "accent" : undefined}>
                    {p.source === "github" ? "GitHub" : "Manual"}
                  </span>
                </div>
                {p.description && <p className={styles.projectDesc}>{p.description}</p>}
                {p.techStack.length > 0 && (
                  <div className={styles.chipRow}>
                    {p.techStack.slice(0, 6).map((t) => (
                      <span key={t} className={styles.chip}>
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div className={styles.projectLinks}>
                  {p.githubUrl && (
                    <a href={p.githubUrl} target="_blank" rel="noreferrer" className={styles.projectLink}>
                      GitHub ↗
                    </a>
                  )}
                  {p.liveUrl && (
                    <a href={p.liveUrl} target="_blank" rel="noreferrer" className={styles.projectLink}>
                      Live demo ↗
                    </a>
                  )}
                  {p.source === "manual" && (
                    <button
                      type="button"
                      className={styles.projectLink}
                      style={{ marginLeft: "auto", background: "none", border: 0, cursor: "pointer" }}
                      onClick={() => remove(p.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {open && (
        <div className={styles.modalBackdrop} onClick={() => setOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h2 className={styles.modalTitle}>Add a project</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className={styles.fieldGrid}>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label} htmlFor="prj-name">
                  Project name
                </label>
                <input
                  id="prj-name"
                  className={styles.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  placeholder="Devora"
                />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label} htmlFor="prj-desc">
                  Description
                </label>
                <textarea
                  id="prj-desc"
                  className={styles.textarea}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={280}
                  placeholder="What it does and why you built it."
                />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label} htmlFor="prj-tech">
                  Tech stack
                </label>
                <input
                  id="prj-tech"
                  className={styles.input}
                  value={techStack}
                  onChange={(e) => setTechStack(e.target.value)}
                  placeholder="Next.js, TypeScript, Postgres"
                />
                <span className={styles.hint}>Separate with commas.</span>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="prj-gh">
                  GitHub URL
                </label>
                <input
                  id="prj-gh"
                  className={styles.input}
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/you/repo"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="prj-live">
                  Live demo URL
                </label>
                <input
                  id="prj-live"
                  className={styles.input}
                  value={liveUrl}
                  onChange={(e) => setLiveUrl(e.target.value)}
                  placeholder="https://devora.app"
                />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label} htmlFor="prj-img">
                  Cover image URL <span style={{ color: "#6b7280" }}>(optional)</span>
                </label>
                <input
                  id="prj-img"
                  className={styles.input}
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </div>

            <div className={styles.formActions}>
              <button type="button" className={styles.btnPrimary} onClick={submit} disabled={busy}>
                {busy ? "Saving…" : "Add project"}
              </button>
              <button type="button" className={styles.btnSubtle} onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
