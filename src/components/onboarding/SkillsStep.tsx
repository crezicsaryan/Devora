"use client";

/**
 * Step 2 — Skills.
 *
 * Searchable multi-select over the skill catalogue plus a custom entry field.
 * Chips show the selection with individual remove buttons. Duplicates are
 * prevented both here and in the database write.
 */

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import styles from "@/app/onboarding/onboarding.module.css";

const FALLBACK_CATALOGUE: { slug: string; name: string; category: string }[] = [
  // Languages
  ...[
    "Java",
    "JavaScript",
    "TypeScript",
    "Python",
    "C",
    "C++",
    "C#",
    "Go",
    "Rust",
    "Kotlin",
    "PHP",
    "Ruby",
    "Swift",
    "SQL",
  ].map((name) => ({ slug: name.toLowerCase(), name, category: "language" })),
  // Technologies
  ...[
    "React",
    "Next.js",
    "Node.js",
    "Express",
    "NestJS",
    "Spring Boot",
    "Django",
    "Flask",
    "MongoDB",
    "MySQL",
    "PostgreSQL",
    "Redis",
    "Docker",
    "Git",
    "AWS",
    "Firebase",
    "Tailwind CSS",
    "GraphQL",
    "Linux",
    "Prisma",
  ].map((name) => ({ slug: name.toLowerCase(), name, category: "technology" })),
];

const MAX_SKILLS = 60;

export function SkillsStep({
  selected,
  onChange,
  onError,
}: {
  selected: string[];
  onChange: (skills: string[]) => void;
  onError: (message: string | null) => void;
}) {
  const [catalogue, setCatalogue] = useState(FALLBACK_CATALOGUE);
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const [tab, setTab] = useState<"language" | "technology">("language");

  useEffect(() => {
    let alive = true;
    api.skillCatalogue().then((res) => {
      if (!alive) return;
      if (res.ok && res.data.catalogue.length > 0) setCatalogue(res.data.catalogue);
    });
    return () => {
      alive = false;
    };
  }, []);

  const selectedSet = useMemo(
    () => new Set(selected.map((s) => s.toLowerCase())),
    [selected]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return catalogue.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 48);
    }
    return catalogue.filter((s) => s.category === tab).slice(0, 48);
  }, [catalogue, query, tab]);

  function toggle(name: string) {
    onError(null);
    const exists = selected.some((s) => s.toLowerCase() === name.toLowerCase());
    if (exists) {
      onChange(selected.filter((s) => s.toLowerCase() !== name.toLowerCase()));
      return;
    }
    if (selected.length >= MAX_SKILLS) {
      onError(`You can select up to ${MAX_SKILLS} skills.`);
      return;
    }
    onChange([...selected, name]); // duplicates are impossible by construction
  }

  function addCustom() {
    const value = custom.trim();
    if (!value) return;
    if (value.length > 40) {
      onError("Keep custom skills under 40 characters.");
      return;
    }
    toggle(value);
    setCustom("");
  }

  const languages = catalogue.filter((s) => s.category === "language").length;
  const technologies = catalogue.filter((s) => s.category !== "language").length;

  return (
    <div className={styles.stepWrap}>
      <header className={styles.stepHead}>
        <h2 className={styles.stepTitle}>What do you build with?</h2>
        <p className={styles.stepSub}>
          Pick the languages and tools you actually use. You can change this any time.
        </p>
      </header>

      {/* Selected chips */}
      <div className={styles.skillBar}>
        <div className={styles.skillBarHead}>
          <span className={styles.skillBarTitle}>
            Selected <span className={styles.skillCount}>{selected.length}</span>
          </span>
          {selected.length > 0 && (
            <button type="button" className={styles.textBtn} onClick={() => onChange([])}>
              Clear all
            </button>
          )}
        </div>
        <div className={styles.chipRow}>
          {selected.length === 0 && (
            <span className={styles.chipEmpty}>
              Nothing selected yet — pick from the list below.
            </span>
          )}
          {selected.map((skill) => (
            <span key={skill} className={styles.chipOn}>
              {skill}
              <button
                type="button"
                onClick={() => toggle(skill)}
                aria-label={`Remove ${skill}`}
                className={styles.chipRemove}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Search + custom */}
      <div className={styles.skillControls}>
        <div className={styles.searchWrap}>
          <SearchGlyph />
          <input
            className={styles.searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills…"
            aria-label="Search skills"
          />
          {query && (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className={styles.customWrap}>
          <input
            className={styles.searchInput}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Add a custom skill…"
            aria-label="Add a custom skill"
            maxLength={40}
          />
          <button
            type="button"
            className={styles.primarySmall}
            onClick={addCustom}
            disabled={!custom.trim()}
          >
            Add
          </button>
        </div>
      </div>

      {!query && (
        <div className={styles.tabsRow} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "language"}
            className={`${styles.tabBtn} ${tab === "language" ? styles.tabBtnOn : ""}`}
            onClick={() => setTab("language")}
          >
            Languages <span className={styles.tabCount}>{languages}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "technology"}
            className={`${styles.tabBtn} ${tab === "technology" ? styles.tabBtnOn : ""}`}
            onClick={() => setTab("technology")}
          >
            Frameworks &amp; tools <span className={styles.tabCount}>{technologies}</span>
          </button>
        </div>
      )}

      <div className={styles.skillGrid}>
        {visible.length === 0 && (
          <p className={styles.emptyNote}>
            Nothing matched “{query}”. Use the custom field above to add it.
          </p>
        )}
        {visible.map((skill) => {
          const isOn = selectedSet.has(skill.name.toLowerCase());
          return (
            <button
              key={skill.slug}
              type="button"
              className={`${styles.skillChip} ${isOn ? styles.skillChipOn : ""}`}
              onClick={() => toggle(skill.name)}
              aria-pressed={isOn}
            >
              {isOn && <CheckGlyph />}
              {skill.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" className={styles.searchIcon}>
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 12.5l4.5 4.5L19 7"
      />
    </svg>
  );
}
