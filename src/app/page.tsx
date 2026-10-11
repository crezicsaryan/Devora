"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import styles from "./landing.module.css";

const platforms = [
  { name: "LeetCode", src: "/platform-logos/leetcode.png" },
  { name: "GeeksforGeeks", src: "/platform-logos/gfg.png" },
  { name: "CodeChef", src: "/platform-logos/codechef.png" },
  { name: "Codeforces", src: "/platform-logos/codeforces.png" },
  { name: "HackerRank", src: "/platform-logos/hackerrank.png" },
  { name: "GitHub", src: "/platform-logos/github-white.png" },
];

export default function Landing() {
  const [cardTab, setCardTab] = useState<"basic" | "premium">("premium");
  const [cursorOn, setCursorOn] = useState(false);
  /* Signed-in state, read once from the server. Drives the nav greeting and
     hides "Log in" once the visitor has a session. */
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const glowRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  /* Who is signed in? `/api/session` resolves the Supabase session server-side
     and returns the display name, so this needs no database round trip. */
  useEffect(() => {
    let alive = true;
    fetch("/api/session", { cache: "no-store" })
      .then((res) =>
        res.ok
          ? (res.json() as Promise<{ authenticated?: boolean; name?: string }>)
          : null
      )
      .then((data) => {
        if (!alive || !data) return;
        setSignedIn(Boolean(data.authenticated));
        if (typeof data.name === "string" && data.name.trim()) {
          setSessionName(data.name.trim());
        }
      })
      // A signed-out visitor and an unreachable server look the same here:
      // show the logged-out nav rather than an error.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  /** "Aryan Singh" -> "Aryan" */
  const firstName = sessionName?.split(/\s+/)[0] ?? null;

  /* premium mouse-pointer effect: dot + trailing ring + ambient glow */
  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (!fine) return;
    let raf = 0;
    let tx = -100, ty = -100, rx = -100, ry = -100, gx = -100, gy = -100;
    const place = () => {
      if (ringRef.current) ringRef.current.style.transform = `translate(${rx - 19}px, ${ry - 19}px)`;
      if (glowRef.current) glowRef.current.style.transform = `translate(${gx - 190}px, ${gy - 190}px)`;
      if (dotRef.current) dotRef.current.style.transform = `translate(${tx - 3}px, ${ty - 3}px)`;
    };
    const onMove = (e: MouseEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (tx < 0 || ty < 0) return;
      setCursorOn(true);
      /* instant position so the effect works even when rAF is throttled */
      rx = tx; ry = ty; gx = tx; gy = ty;
      place();
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const tick = () => {
      raf = 0;
      rx += (tx - rx) * 0.18;
      ry += (ty - ry) * 0.18;
      gx += (tx - gx) * 0.08;
      gy += (ty - gy) * 0.08;
      place();
      if (Math.abs(tx - rx) + Math.abs(ty - ry) + Math.abs(tx - gx) + Math.abs(ty - gy) > 0.6) {
        raf = requestAnimationFrame(tick);
      }
    };
    const onOver = (e: MouseEvent) => {
      const hot = (e.target as Element | null)?.closest?.("a, button, input");
      ringRef.current?.setAttribute("data-hot", hot ? "true" : "false");
    };
    const onLeave = () => setCursorOn(false);
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseover", onOver, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseover", onOver);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className={styles.page}>
      {/* premium cursor layers */}
      <div ref={glowRef} className={`${styles.cursorGlow} ${cursorOn ? styles.cursorLive : ""}`} aria-hidden="true" />
      <div ref={ringRef} data-hot="false" className={`${styles.cursorRing} ${cursorOn ? styles.cursorLive : ""}`} aria-hidden="true" />
      <div ref={dotRef} className={`${styles.cursorDot} ${cursorOn ? styles.cursorLive : ""}`} aria-hidden="true" />

      {/* ============ NAV ============ */}
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.brand} aria-label="Devora — Code Track Build Grow">
            <Image
              src="/logo/devora-lockup-white.png"
              alt="Devora logo"
              width={152}
              height={44}
              priority
              className={styles.brandImg}
            />
          </Link>
          <nav className={styles.navLinks}>
            <a href="#features">Features</a>
            <a href="#how">How It works</a>
            <a href="#developers">Developers</a>
            <a href="#pricing">Pricing</a>
            <a href="#blog">Blog</a>
          </nav>
          <div className={styles.navActions}>
            {signedIn ? (
              <>
                <span className={styles.greeting}>Hello, {firstName ?? "developer"}</span>
                <Link href="/dashboard" className={styles.btnPrimary}>
                  Go to Dashboard <ArrowIcon />
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className={styles.btnGhost}>Log in</Link>
                <Link href="/signup" className={styles.btnPrimary}>
                  Get Started <ArrowIcon />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ============ HERO ============ */}
      <section className={styles.hero}>
        <div className={`${styles.heroGlow} ${styles.glowLeft}`} />
        <div className={`${styles.heroGlow} ${styles.glowRight}`} />
        <div className={styles.heroInner}>
          <div className={styles.heroLeft}>
            <p className={styles.kicker}>FOR DEVELOPERS, BY DEVELOPERS.</p>
            <h1 className={styles.heroTitle}>
              YOUR CODE.<br />
              YOUR JOURNEY.<br />
              <span className={styles.accent}>YOUR IDENTITY.</span>
            </h1>
            <p className={styles.heroSub}>
              One profile to track, showcase and grow<br />
              your entire developer journey.
            </p>
            <div className={styles.pillRow}>
              <span className={styles.pill}><PillImg src="/icons/profile.png" alt="" /> Profile</span>
              <span className={styles.pill}><PillImg src="/icons/track-growth.png" alt="" /> Track &amp; Growth</span>
              <span className={styles.pill}><PillImg src="/icons/identity.png" alt="" /> Identity</span>
              <span className={styles.pill}><PillImg src="/icons/connect.png" alt="" /> Connect</span>
            </div>
            <div className={styles.ctaRow}>
              <Link href="/signup" className={styles.ctaPrimary}>
                Create Your Devora <ArrowIcon />
              </Link>
              <a href="#developers" className={styles.ctaGhost}>Explore Profiles</a>
            </div>
            <div className={styles.communityRow}>
              <div className={styles.avatars}>
                <span className={styles.avatarA}>A</span>
                <span className={styles.avatarB}>R</span>
                <span className={styles.avatarC}>K</span>
                <span className={styles.avatarD}>S</span>
              </div>
              <span className={styles.communityText}>Join a growing community of developers</span>
            </div>
          </div>

          {/* Hero ID card mockup */}
          <div className={styles.heroRight}>
            <div className={styles.heroCard}>
              <div className={styles.heroCardTop}>
                <Image src="/logo/devora-mark.png" alt="" aria-hidden="true" width={22} height={30} className={styles.cardBrandImg} />
                <span className={styles.cardBrand}>Devora</span>
                <span className={styles.cardMore}>MORE THAN CODE</span>
              </div>
              <div className={styles.cardAvatar}>
                <span className={styles.cardAvatarInitials}>AS</span>
                <span className={styles.cardVerified}>
                  <CheckIcon />
                </span>
              </div>
              <div className={styles.cardName}>Aryan Singh <span className={styles.cardCheck}><CheckIcon /></span></div>
              <div className={styles.cardHandle}>@aryansingh</div>
              <div className={styles.cardRole}>Full Stack Developer</div>
              <div className={styles.cardStats}>
                <div>
                  <strong>1,284</strong>
                  <span>Problems Solved</span>
                </div>
                <div>
                  <strong>318</strong>
                  <span>Github Commits</span>
                </div>
                <div>
                  <strong><FlameIcon />12</strong>
                  <span>Streak</span>
                </div>
              </div>
              <div className={styles.cardQrRow}>
                <span className={styles.cardQr}><QrIcon /></span>
                <span className={styles.cardScan}>
                  Scan to view my profile<br />
                  <em>devora.dev/@aryansingh</em>
                </span>
              </div>
            </div>
            <div className={styles.heroScript}>Build Track Grow Repeat</div>
          </div>
        </div>
      </section>

      {/* ============ PLATFORM STRIP ============ */}
      <section className={styles.strip}>
        <div className={styles.stripInner}>
          <div className={styles.stripLabel}>
            SYNC YOUR PROGRESS FROM
            <span className={styles.stripLabelRight}>ALL YOUR PLATFORMS, ONE IDENTITY.</span>
          </div>
          <div className={styles.stripRow}>
            {platforms.map((p) => (
              <div key={p.name} className={styles.stripItem}>
                <span className={styles.stripChip}>
                  <Image src={p.src} alt={`${p.name} logo`} width={26} height={26} className={styles.stripImg} />
                </span>
                <span>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FEATURES ============ */}
      <section className={styles.features} id="features">
        <h2 className={styles.h2Center}>Everything in One Profile</h2>
        <p className={styles.subCenter}>
          Track. Showcase. Grow. Devora brings your entire developer journey together.
        </p>
        <div className={styles.featureGrid}>
          <div className={styles.featureCard}>
            <span className={styles.featureIconBox}>
              <FeatureImg src="/icons/track-growth.png" alt="" />
            </span>
            <div>
              <h3>Coding Progress</h3>
              <p>Track your DSA progress<br />across multiple platforms.</p>
            </div>
            <span className={styles.featureArrow}><ArrowIcon /></span>
          </div>
          <div className={styles.featureCard}>
            <span className={styles.featureIconBox}>
              <FeatureImg src="/icons/connect.png" alt="" />
            </span>
            <div>
              <h3>GitHub Integration</h3>
              <p>Showcase your repositories,<br />contributions and projects.</p>
            </div>
            <span className={styles.featureArrow}><ArrowIcon /></span>
          </div>
          <div className={styles.featureCard}>
            <span className={styles.featureIconBox}>
              <FeatureImg src="/icons/identity.png" alt="" />
            </span>
            <div>
              <h3>Developer Identity</h3>
              <p>Get a beautiful, shareable<br />Devora card.</p>
            </div>
            <span className={styles.featureArrow}><ArrowIcon /></span>
          </div>
        </div>
      </section>

      {/* ============ GROWTH ============ */}
      <section className={styles.growth}>
        <div className={styles.growthLeft}>
          <p className={styles.kickerRow}><span className={styles.tagBox}>TRACK · ANALYZE · IMPROVE</span></p>
          <h2 className={styles.h2Left}>See Your<br />Growth Over Time</h2>
          <p className={styles.pLeft}>
            Visualize your progress, find your strengths<br />and stay consistent.
          </p>
          <div className={styles.miniStats}>
            <div className={styles.miniCard}>
              <MiniImg src="/icons/track-growth.png" alt="" />
              <strong>1,284</strong>
              <span>Problems Solved</span>
            </div>
            <div className={styles.miniCard}>
              <ChartIcon />
              <strong>67%</strong>
              <span>Overall Progress</span>
            </div>
            <div className={styles.miniCard}>
              <FlameIcon />
              <strong>27 Days</strong>
              <span>Current Streak</span>
            </div>
          </div>
          <a href="#analytics" className={styles.ctaOutline}>View Detailed Analytics <ArrowIcon /></a>
        </div>

        <div className={styles.growthRight}>
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <span>Problems Solved</span>
              <span className={styles.panelSelect}>Last 6 Months <ChevronIcon /></span>
            </div>
            <div className={styles.chartBox}>
              <div className={styles.chartBadge}>
                <strong>1,284</strong>
                <span>Total Solved</span>
              </div>
              <ChartSvg />
              <div className={styles.chartMonths}>
                {["Jan", "Feb", "Mar", "Apr", "May", "Jun"].map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </div>
            </div>
            <div className={styles.diffHead}>Difficulty Breakdown</div>
            <div className={styles.diffRow}>
              <div className={styles.diffBars}>
                <div className={styles.diffLine}>
                  <span className={styles.diffEasy}>Easy</span>
                  <span className={styles.barTrack}><span className={styles.barEasy} style={{ width: "82%" }} /></span>
                  <em>542</em>
                </div>
                <div className={styles.diffLine}>
                  <span className={styles.diffMed}>Medium</span>
                  <span className={styles.barTrack}><span className={styles.barMed} style={{ width: "58%" }} /></span>
                  <em>613</em>
                </div>
                <div className={styles.diffLine}>
                  <span className={styles.diffHard}>Hard</span>
                  <span className={styles.barTrack}><span className={styles.barHard} style={{ width: "21%" }} /></span>
                  <em>129</em>
                </div>
              </div>
              <div className={styles.ring}>
                <RingSvg />
                <div className={styles.ringLabel}>
                  <strong>67%</strong>
                  <span>Overall</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ GITHUB ============ */}
      <section className={styles.github} id="developers">
        <div className={styles.githubCard}>
          <div className={styles.githubHead}>
            <span className={styles.githubLogo}>
              <Image src="/platform-logos/github-white.png" alt="GitHub logo" width={18} height={18} />
            </span>
            <strong>GitHub</strong>
            <button className={styles.followBtn} type="button">Follow</button>
          </div>
          <div className={styles.githubProfile}>
            <span className={styles.githubAvatar}>AS</span>
            <div>
              <div className={styles.githubHandle}>@aryansingh</div>
              <div className={styles.githubName}>Full Stack Developer</div>
            </div>
          </div>
          <div className={styles.githubStats}>
            <div><strong>42</strong><span>Repositories</span></div>
            <div><strong>318</strong><span>Contributions</span></div>
            <div><strong>1,8k</strong><span>Followers</span></div>
          </div>
          <div className={styles.ghHeatmap}>
            <div className={styles.ghDays}>
              <span>Mon</span><span>Wed</span><span>Fri</span>
            </div>
            <div className={styles.ghGrid}>
              {Array.from({ length: 7 * 22 }).map((_, i) => {
                const seed = (i * 7919 + 104729) % 100;
                const level = seed > 82 ? 4 : seed > 62 ? 3 : seed > 42 ? 2 : seed > 25 ? 1 : 0;
                return <span key={i} className={`${styles.ghCell} ${styles[`gh${level}`]}`} />;
              })}
            </div>
          </div>
          <div className={styles.ghMonths}>
            {["Jan", "Feb", "Mar", "Apr", "May", "Jun"].map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
          <div className={styles.repoHead}>
            <strong>Top Repositories</strong>
            <a href="#" className={styles.viewAll}>View All →</a>
          </div>
          <div className={styles.repoGrid}>
            <div className={styles.repoCard}>
              <span className={styles.repoIcon}><RepoIcon /></span>
              <strong>devora</strong>
              <span className={styles.repoLang}>Next.js</span>
              <span className={styles.repoStars}>★ 124</span>
            </div>
            <div className={styles.repoCard}>
              <span className={styles.repoIcon}><RepoIcon /></span>
              <strong>jamseva</strong>
              <span className={styles.repoLang}>Python</span>
              <span className={styles.repoStars}>★ 87</span>
            </div>
            <div className={styles.repoCard}>
              <span className={styles.repoIcon}><RepoIcon /></span>
              <strong>strangertalk</strong>
              <span className={styles.repoLang}>React</span>
              <span className={styles.repoStars}>★ 53</span>
            </div>
          </div>
        </div>

        <div className={styles.githubRight}>
          <p className={styles.kickerRow}><span className={styles.tagBox}>YOUR WORK MATTERS</span></p>
          <h2 className={styles.h2Left}>Turn Your GitHub<br />into a Story</h2>
          <p className={styles.pLeft}>
            Your contributions, repositories and open source<br />work — beautifully visualized.
          </p>
          <ul className={styles.checkList}>
            <li><span className={styles.checkSq}><CheckIcon /></span> Contribution calendar</li>
            <li><span className={styles.checkSq}><CheckIcon /></span> Top repositories</li>
            <li><span className={styles.checkSq}><CheckIcon /></span> Language breakdown</li>
            <li><span className={styles.checkSq}><CheckIcon /></span> Real-time sync</li>
            <li><span className={styles.checkSq}><CheckIcon /></span> Showcase open source work</li>
          </ul>
          <a href="#" className={styles.ctaOutline}>Connect GitHub <ArrowIcon /></a>
        </div>
      </section>

      {/* ============ IDENTITY CARDS — exact provided designs ============ */}
      <section className={styles.identity} id="pricing">
        <h2 className={styles.h2Center}>More Than a Profile. It&apos;s Your Developer Identity.</h2>
        <p className={styles.subCenter}>
          Get your personalized Devora card and share it anywhere — portfolios, resumes, LinkedIn and more.
        </p>
        <div className={styles.tabRow}>
          <button
            type="button"
            className={`${styles.tab} ${cardTab === "basic" ? styles.tabOn : ""}`}
            onClick={() => setCardTab("basic")}
          >
            Basic Card
          </button>
          <button
            type="button"
            className={`${styles.tab} ${cardTab === "premium" ? styles.tabOn : ""}`}
            onClick={() => setCardTab("premium")}
          >
            Premium Card
          </button>
        </div>

        <div className={styles.identityStage}>
          <div className={styles.stageLabelLeft}>
            YOUR<br />DEVELOPER<br />IDENTITY<br />ANYWHERE
            <span className={styles.stageArrow}>↳</span>
          </div>

          {/* Basic card — exact provided design (white front / black back) */}
          <div className={`${styles.idShowcase} ${cardTab === "basic" ? styles.cardActive : styles.cardDim}`}>
            <Image
              src="/cards/devora-basic-cards.png"
              alt="Devora Basic identity card — front and back design"
              width={1536}
              height={1024}
              /* The card never renders wider than 560px (.idShowcase), but
                 without `sizes` Next assumes the full 1536px intrinsic width
                 and the browser downloads the 1920px variant (~508 KB) instead
                 of the 640px one (~97 KB). */
              sizes="(max-width: 1020px) 92vw, 560px"
              className={styles.idShowcaseImg}
              priority={false}
            />
          </div>

          {/* Premium card — exact provided design (metallic dark + certified back) */}
          <div className={`${styles.idShowcase} ${cardTab === "premium" ? styles.cardActive : styles.cardDim}`}>
            <Image
              src="/cards/devora-pro-cards.png"
              alt="Devora Pro identity card — front and back design"
              width={1536}
              height={1024}
              sizes="(max-width: 1020px) 92vw, 560px"
              className={styles.idShowcaseImg}
              priority={false}
            />
          </div>

          <div className={styles.stageLabelRight}>
            SHARE<br />SHOWCASE<br />GET RECOGNIZED
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section className={styles.how} id="how">
        <h2 className={styles.h2Left2}>How Devora Works</h2>
        <p className={styles.pLeft}>
          Get started in minutes and bring your developer journey to life.
        </p>
        <div className={styles.steps}>
          <div className={styles.step}>
            <span className={styles.stepIcon}><StepImg src="/icons/profile.png" alt="" /></span>
            <div>
              <em>01</em>
              <strong>Create Your Profile</strong>
              <span>Sign up and set up your Devora profile.</span>
            </div>
          </div>
          <span className={styles.stepArrow}>→</span>
          <div className={styles.step}>
            <span className={styles.stepIcon}><StepImg src="/icons/connect.png" alt="" /></span>
            <div>
              <em>02</em>
              <strong>Connect Platforms</strong>
              <span>Link your GitHub and coding accounts.</span>
            </div>
          </div>
          <span className={styles.stepArrow}>→</span>
          <div className={styles.step}>
            <span className={styles.stepIcon}><StepImg src="/icons/track-growth.png" alt="" /></span>
            <div>
              <em>03</em>
              <strong>Track &amp; Grow</strong>
              <span>We fetch your data and visualize your journey.</span>
            </div>
          </div>
          <span className={styles.stepArrow}>→</span>
          <div className={styles.step}>
            <span className={styles.stepIcon}><StepImg src="/icons/identity.png" alt="" /></span>
            <div>
              <em>04</em>
              <strong>Share Your Identity</strong>
              <span>Get your Devora card and showcase it everywhere.</span>
            </div>
          </div>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className={styles.ctaBanner}>
        <div className={styles.ctaBannerText}>
          <h2>Ready to Build Your Devora?</h2>
          <p>Your code is already telling a story. Make it visible.</p>
        </div>
        <Link href="/signup" className={styles.ctaPrimaryLg}>
          Get Started for Free <ArrowIcon />
        </Link>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className={styles.footer} id="blog">
        <div className={styles.footerGrid}>
          <div className={styles.footerBrandCol}>
            <div className={styles.brand}>
              <Image
                src="/logo/devora-lockup-white.png"
                alt="Devora logo"
                width={152}
                height={44}
                className={styles.brandImg}
              />
            </div>
            <p>Your coding journey. One identity.</p>
          </div>
          <div className={styles.footerCol}>
            <strong>Product</strong>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#developers">Developer Profiles</a>
            <a href="#pricing">Identity Card</a>
          </div>
          <div className={styles.footerCol}>
            <strong>Resources</strong>
            <a href="#">Documentation</a>
            <a href="#">Help Center</a>
            <a href="#blog">Blog</a>
            <a href="#">API</a>
          </div>
          <div className={styles.footerCol}>
            <strong>Company</strong>
            <a href="#">About</a>
            <a href="#">Contact</a>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
          </div>
          <div className={styles.footerStay}>
            <strong>Stay Updated</strong>
            <p>Get the latest updates and features.</p>
            <div className={styles.emailRow}>
              <input type="email" placeholder="Enter your email" aria-label="Email address" />
              <button type="button" aria-label="Subscribe"><ArrowIcon /></button>
            </div>
            <div className={styles.socialRow}>
              <a href="#" aria-label="GitHub"><GithubIcon /></a>
              <a href="#" aria-label="LinkedIn"><LinkedInIcon /></a>
              <a href="#" aria-label="X"><XIcon /></a>
              <a href="#" aria-label="Instagram"><InstagramIcon /></a>
              <a href="#" aria-label="YouTube"><YouTubeIcon /></a>
            </div>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span>© 2026 Devora. All rights reserved.</span>
          <span>Made for developers, with <em>♥</em></span>
        </div>
      </footer>
    </div>
  );
}

/* ---------- image helpers ---------- */
function PillImg({ src, alt }: { src: string; alt: string }) {
  return <Image src={src} alt={alt} width={15} height={15} className={styles.pillImg} />;
}
function FeatureImg({ src, alt }: { src: string; alt: string }) {
  return <Image src={src} alt={alt} width={26} height={26} className={styles.featureImg} />;
}
function MiniImg({ src, alt }: { src: string; alt: string }) {
  return <Image src={src} alt={alt} width={18} height={18} className={styles.miniImg} />;
}
function StepImg({ src, alt }: { src: string; alt: string }) {
  return <Image src={src} alt={alt} width={20} height={20} className={styles.stepImg} />;
}

/* ---------- inline icons ---------- */
function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function GithubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M12 2s1 3.5-1.5 6.5C8.6 10.7 7 12.4 7 15a5 5 0 0 0 10 0c0-1.6-.6-3-1.5-4.2-.5 1-1.3 1.7-2.5 2 .6-2.4 0-5.6-1-8.3z" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3.2" aria-hidden="true">
      <path d="M4 12.5l5.5 5.5L20 6.5" />
    </svg>
  );
}
function QrIcon() {
  return (
    <svg viewBox="0 0 24 24" width="44" height="44" fill="currentColor" aria-hidden="true">
      <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm8-2h2v2h-2v-2zm4 0h4v2h-2v2h-2v-2h.01V13zM13 17h2v4h-2v-4zm4 0h4v4h-2v-2h-2v-2z" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
function RepoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </svg>
  );
}
function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.24 8.31h4.52V23H.24V8.31zM8.34 8.31h4.33v2h.06c.6-1.14 2.07-2.34 4.27-2.34 4.57 0 5.41 3.01 5.41 6.92V23h-4.5v-7.1c0-1.7-.03-3.88-2.37-3.88-2.37 0-2.73 1.85-2.73 3.76V23h-4.47V8.31z" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M18.9 2H22l-6.8 7.8L23.3 22h-6.3l-4.9-6.4L6.4 22H3.2l7.3-8.3L1 2h6.5l4.4 5.9L18.9 2zm-1.1 18h1.7L7.1 3.9H5.3L17.8 20z" />
    </svg>
  );
}
function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" /><circle cx="12" cy="12" r="4.5" /><circle cx="17.8" cy="6.2" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
function YouTubeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8zM9.6 15.6V8.4L15.8 12l-6.2 3.6z" />
    </svg>
  );
}

/* ---------- analytics chart ---------- */
function ChartSvg() {
  const pts = [8, 18, 26, 40, 52, 66, 84];
  const max = 100;
  const w = 380;
  const h = 150;
  const stepX = w / (pts.length - 1);
  const path = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${(h - (p / max) * h).toFixed(1)}`)
    .join(" ");
  const area = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h + 6}`} className={styles.chartSvg} aria-hidden="true">
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(232,122,38,0.35)" />
          <stop offset="1" stopColor="rgba(232,122,38,0)" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((g) => (
        <line key={g} x1="0" x2={w} y1={(g * h) / 3} y2={(g * h) / 3} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      ))}
      <path d={area} fill="url(#chartFill)" />
      <path d={path} fill="none" stroke="#E87A26" strokeWidth="2.5" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={i * stepX} cy={h - (p / max) * h} r="3" fill="#E87A26" stroke="#0B0B0C" strokeWidth="1.5" />
      ))}
    </svg>
  );
}

/* ---------- 67% ring ---------- */
function RingSvg() {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 88 88" width="96" height="96" aria-hidden="true">
      <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
      <circle
        cx="44"
        cy="44"
        r={r}
        fill="none"
        stroke="#E87A26"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${(c * 0.67).toFixed(1)} ${c.toFixed(1)}`}
        transform="rotate(-90 44 44)"
      />
    </svg>
  );
}
