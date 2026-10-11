/**
 * Devora — MySQL catalogue seed.
 *
 * Seeds the two REFERENCE tables the application reads but never creates rows
 * for on the fly:
 *
 *   - skills        — the picker on the skills onboarding step
 *   - achievements  — the threshold catalogue evaluateAchievements() checks
 *
 * These are the exact rows the Postgres migrations inserted
 * (supabase/onboarding.sql section 15 + supabase/activity.sql section 4).
 * Nothing here is fake user data: no profiles, no statistics, no activity.
 *
 * Idempotent — re-running inserts nothing new, so it is safe to run on an
 * existing database.
 *
 * Run with:  npx prisma db seed
 */

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

type SkillSeed = { slug: string; name: string; category: string };

const SKILLS: SkillSeed[] = [
  ["java", "Java"],
  ["javascript", "JavaScript"],
  ["typescript", "TypeScript"],
  ["python", "Python"],
  ["c", "C"],
  ["cpp", "C++"],
  ["csharp", "C#"],
  ["go", "Go"],
  ["rust", "Rust"],
  ["kotlin", "Kotlin"],
  ["php", "PHP"],
  ["ruby", "Ruby"],
  ["swift", "Swift"],
  ["sql", "SQL"],
  ["bash", "Bash"],
].map(([slug, name]) => ({ slug, name, category: "language" }));

const TECHNOLOGIES: SkillSeed[] = [
  ["react", "React"],
  ["nextjs", "Next.js"],
  ["nodejs", "Node.js"],
  ["express", "Express"],
  ["nestjs", "NestJS"],
  ["spring-boot", "Spring Boot"],
  ["django", "Django"],
  ["flask", "Flask"],
  ["mongodb", "MongoDB"],
  ["mysql", "MySQL"],
  ["postgresql", "PostgreSQL"],
  ["redis", "Redis"],
  ["docker", "Docker"],
  ["kubernetes", "Kubernetes"],
  ["git", "Git"],
  ["aws", "AWS"],
  ["firebase", "Firebase"],
  ["tailwind", "Tailwind CSS"],
  ["graphql", "GraphQL"],
  ["rest-api", "REST API"],
  ["linux", "Linux"],
  ["tensorflow", "TensorFlow"],
  ["pytorch", "PyTorch"],
  ["tensorflowjs", "TensorFlow.js"],
  ["vercel", "Vercel"],
  ["jwt", "JWT"],
  ["socketio", "Socket.IO"],
  ["prisma", "Prisma"],
  ["redis-streams", "Redis Streams"],
].map(([slug, name]) => ({ slug, name, category: "technology" }));

const ACHIEVEMENTS = [
  { code: "first-problem", title: "First Problem Solved", description: "Solved your first problem on a connected platform.", metric: "problems", threshold: 1, icon: "🎯", tier: "bronze" },
  { code: "streak-7", title: "7 Day Streak", description: "Solved at least one problem every day for a week.", metric: "streak", threshold: 7, icon: "🔥", tier: "bronze" },
  { code: "streak-30", title: "30 Day Streak", description: "Solved at least one problem every day for 30 days.", metric: "streak", threshold: 30, icon: "🔥", tier: "bronze" },
  { code: "streak-50", title: "50 Day Streak", description: "Solved at least one problem every day for 50 days.", metric: "streak", threshold: 50, icon: "🔥", tier: "silver" },
  { code: "streak-100", title: "100 Day Streak", description: "Solved at least one problem every day for 100 days.", metric: "streak", threshold: 100, icon: "🔥", tier: "gold" },
  { code: "problems-50", title: "50 Problems", description: "Solved 50 problems across your connected platforms.", metric: "problems", threshold: 50, icon: "⚡", tier: "bronze" },
  { code: "problems-100", title: "100 Problems", description: "Solved 100 problems across your connected platforms.", metric: "problems", threshold: 100, icon: "⚡", tier: "bronze" },
  { code: "problems-500", title: "500 Problems", description: "Solved 500 problems across your connected platforms.", metric: "problems", threshold: 500, icon: "⚡", tier: "silver" },
  { code: "problems-1000", title: "1000 Problems", description: "Solved 1000 problems across your connected platforms.", metric: "problems", threshold: 1000, icon: "⚡", tier: "gold" },
  { code: "first-project", title: "First Project", description: "Added your first project to your Devora profile.", metric: "projects", threshold: 1, icon: "🚀", tier: "bronze" },
  { code: "projects-5", title: "Project Builder", description: "Shipped 5 projects on your Devora profile.", metric: "projects", threshold: 5, icon: "🚀", tier: "silver" },
  { code: "github-builder", title: "GitHub Builder", description: "Connected GitHub and pushed real repositories.", metric: "repos", threshold: 1, icon: "💻", tier: "bronze" },
  { code: "github-connected", title: "First GitHub Connection", description: "Connected GitHub to Devora.", metric: "github", threshold: 1, icon: "💻", tier: "bronze" },
  { code: "platforms-3", title: "Multi-Platform", description: "Connected 3 or more coding platforms.", metric: "platforms", threshold: 3, icon: "🔗", tier: "silver" },
  { code: "platforms-5", title: "Polyglot Coder", description: "Connected 5 or more coding platforms.", metric: "platforms", threshold: 5, icon: "🔗", tier: "gold" },
  { code: "active-days-100", title: "100 Active Days", description: "Coded on 100 separate days.", metric: "active_days", threshold: 100, icon: "📅", tier: "silver" },
] satisfies Prisma.AchievementCreateManyInput[];

async function main() {
  const skills = [...SKILLS, ...TECHNOLOGIES];

  const skillResult = await prisma.skill.createMany({
    data: skills,
    skipDuplicates: true,
  });

  const achievementResult = await prisma.achievement.createMany({
    data: ACHIEVEMENTS,
    skipDuplicates: true,
  });

  const [skillCount, achievementCount] = await Promise.all([
    prisma.skill.count(),
    prisma.achievement.count(),
  ]);

  console.log(
    `[devora/seed] skills: +${skillResult.count} (total ${skillCount}), ` +
      `achievements: +${achievementResult.count} (total ${achievementCount})`
  );
}

main()
  .catch((error) => {
    console.error("[devora/seed] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
