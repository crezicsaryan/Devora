"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { PLATFORM_META, TECH_OPTIONS, type DevoraProfile } from "@/lib/profile";
import styles from "./EditProfileModal.module.css";

type Props = {
  profile: DevoraProfile;
  onClose: () => void;
  onSaved: (p: DevoraProfile) => void;
};

/** Flat editing shape: each platform row is username / stat value / rank. */
type Draft = Omit<DevoraProfile, "platforms"> & {
  platforms: Record<string, { username: string; value: string; percentile: string }>;
};

function toDraft(p: DevoraProfile): Draft {
  const platforms: Draft["platforms"] = {};
  for (const pm of PLATFORM_META) {
    const pl = p.platforms[pm.key];
    platforms[pm.key] = {
      username: pl.username,
      value: String(pl.solved ?? pl.rating ?? pl.badges ?? ""),
      percentile: pl.percentile,
    };
  }
  return { ...p, platforms };
}

function fromDraft(d: Draft): DevoraProfile {
  const out = { ...d } as unknown as DevoraProfile;
  const next = { ...out.platforms };
  for (const pm of PLATFORM_META) {
    const row = d.platforms[pm.key];
    const prev = out.platforms[pm.key];
    next[pm.key] = {
      username: row.username,
      solved: pm.field.key === "solved" ? Number(row.value) || 0 : prev.solved,
      rating: pm.field.key === "rating" ? row.value : prev.rating,
      badges: pm.field.key === "badges" ? row.value : prev.badges,
      percentile: row.percentile,
      color: prev.color,
    };
  }
  return { ...out, platforms: next };
}

export function EditProfileModal({ profile, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(profile));
  const [tab, setTab] = useState<"identity" | "platforms" | "stack">("identity");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setSocial = (k: keyof DevoraProfile["socials"], v: string) =>
    setDraft((d) => ({ ...d, socials: { ...d.socials, [k]: v } }));
  const setPlatform = (k: string, field: "username" | "value" | "percentile", v: string) =>
    setDraft((d) => ({ ...d, platforms: { ...d.platforms, [k]: { ...d.platforms[k], [field]: v } } }));

  const techSelected = useMemo(() => new Set(draft.techStack), [draft.techStack]);

  function toggleTech(t: string) {
    setDraft((d) => ({
      ...d,
      techStack: d.techStack.includes(t) ? d.techStack.filter((x) => x !== t) : [...d.techStack, t],
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const cleaned: DevoraProfile = {
      ...fromDraft(draft),
      name: draft.name.trim() || "Developer",
    };
    // Save to Supabase via the shared helper; always accept locally so the UI updates.
    const { saveProfile } = await import("@/lib/profile");
    const res = await saveProfile(cleaned);
    if (!res.ok && res.error && res.error !== "Supabase not configured") {
      setError(res.error);
      setSaving(false);
      return;
    }
    onSaved(cleaned);
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Edit profile">
      <div className={styles.modal}>
        <header className={styles.head}>
          <h2 className={styles.title}>Edit Profile</h2>
          <button className={styles.close} type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <nav className={styles.tabs} role="tablist">
          {(
            [
              ["identity", "Identity"],
              ["platforms", "Coding Platforms"],
              ["stack", "Stack & Project"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={`${styles.tab} ${tab === k ? styles.tabOn : ""}`}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className={styles.body}>
          {tab === "identity" && (
            <>
              <div className={styles.grid2}>
                <Field label="Full Name" value={draft.name} onChange={(v) => set("name", v)} placeholder="Aryan Singh" />
                <Field label="Handle" value={draft.handle} onChange={(v) => set("handle", v)} placeholder="@aryansingh" />
              </div>
              <Field
                label="Tagline"
                value={draft.tagline}
                onChange={(v) => set("tagline", v)}
                placeholder="Building a better version of myself, one line of code at a time."
                long
              />
              <div className={styles.grid3}>
                <Field label="Location" value={draft.location} onChange={(v) => set("location", v)} placeholder="Bhopal, India" />
                <Field label="Education" value={draft.education} onChange={(v) => set("education", v)} placeholder="B.Tech CSE (AI)" />
                <Field label="Role" value={draft.role} onChange={(v) => set("role", v)} placeholder="Developer | Learner | Builder" />
              </div>
              <Field label="Quote" value={draft.quote} onChange={(v) => set("quote", v)} placeholder="Consistency Compounds." />
              <Field
                label="Avatar URL (optional)"
                value={draft.avatarUrl}
                onChange={(v) => set("avatarUrl", v)}
                placeholder="https://…/photo.jpg"
              />

              <h3 className={styles.sectionTitle}>Links</h3>
              <div className={styles.grid2}>
                <Field
                  label="GitHub"
                  value={draft.socials.github}
                  onChange={(v) => setSocial("github", v)}
                  placeholder="github.com/username"
                />
                <Field
                  label="LinkedIn"
                  value={draft.socials.linkedin}
                  onChange={(v) => setSocial("linkedin", v)}
                  placeholder="linkedin.com/in/username"
                />
                <Field label="X (Twitter)" value={draft.socials.x} onChange={(v) => setSocial("x", v)} placeholder="x.com/username" />
                <Field
                  label="Website / Portfolio"
                  value={draft.socials.website}
                  onChange={(v) => setSocial("website", v)}
                  placeholder="you.dev"
                />
              </div>
            </>
          )}

          {tab === "platforms" && (
            <div className={styles.platList}>
              {PLATFORM_META.map((pm) => {
                const row = draft.platforms[pm.key];
                return (
                  <div key={pm.key} className={styles.platRow}>
                    <div className={styles.platHead}>
                      <Image src={pm.logo} alt="" width={20} height={20} className={styles.platLogo} />
                      <span className={styles.platName}>{pm.label}</span>
                    </div>
                    <div className={styles.platFields}>
                      <Field
                        label="Username"
                        value={row.username}
                        onChange={(v) => setPlatform(pm.key, "username", v)}
                        placeholder="your username"
                      />
                      <Field
                        label={pm.field.label}
                        value={row.value}
                        onChange={(v) => setPlatform(pm.key, "value", v)}
                        placeholder={pm.field.key === "solved" ? "650" : pm.field.key === "rating" ? "3★ 1542" : "5★"}
                      />
                      <Field
                        label="Rank"
                        value={row.percentile}
                        onChange={(v) => setPlatform(pm.key, "percentile", v)}
                        placeholder="Top 12%"
                      />
                    </div>
                  </div>
                );
              })}
              <div className={styles.grid2}>
                <Field
                  label="Total Submissions"
                  value={String(draft.submissions)}
                  onChange={(v) => set("submissions", Number(v.replace(/\D/g, "")) || 0)}
                />
                <Field
                  label="Current Streak (days)"
                  value={String(draft.streak)}
                  onChange={(v) => set("streak", Number(v.replace(/\D/g, "")) || 0)}
                />
              </div>
            </div>
          )}

          {tab === "stack" && (
            <>
              <h3 className={styles.sectionTitle}>Tech Stack</h3>
              <div className={styles.chipWrap}>
                {TECH_OPTIONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`${styles.chip} ${techSelected.has(t) ? styles.chipOn : ""}`}
                    onClick={() => toggleTech(t)}
                    aria-pressed={techSelected.has(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <h3 className={styles.sectionTitle}>Featured Project</h3>
              <div className={styles.grid2}>
                <Field
                  label="Project Title"
                  value={draft.featuredProject.title}
                  onChange={(v) => set("featuredProject", { ...draft.featuredProject, title: v })}
                  placeholder="Devora"
                />
                <Field
                  label="Tags (comma separated)"
                  value={draft.featuredProject.tags.join(", ")}
                  onChange={(v) =>
                    set("featuredProject", {
                      ...draft.featuredProject,
                      tags: v.split(",").map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  placeholder="Next.js, NestJS, MySQL"
                />
              </div>
              <Field
                label="Description"
                value={draft.featuredProject.desc}
                onChange={(v) => set("featuredProject", { ...draft.featuredProject, desc: v })}
                placeholder="All your coding journey in one place."
                long
              />
            </>
          )}
        </div>

        <footer className={styles.foot}>
          {error && <span className={styles.error}>{error}</span>}
          <button className={styles.cancel} type="button" onClick={onClose}>
            Cancel
          </button>
          <button className={styles.save} type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  long,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  long?: boolean;
}) {
  return (
    <label className={`${styles.field} ${long ? styles.fieldLong : ""}`}>
      <span className={styles.label}>{label}</span>
      {long ? (
        <textarea
          className={styles.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
        />
      ) : (
        <input
          className={styles.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </label>
  );
}
