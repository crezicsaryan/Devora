export const profile = {
  name: "Devora",
  handle: "@devora",
  initials: "DV",
  bio: "Building a better version of myself, one line of code at a time.",
  tags: ["Public profile", "5 platforms linked"],
  verified: true,
  devScore: 842,
};

export const stats = [
  { value: "1,284", label: "Questions solved" },
  { value: "63", label: "Current streak (days)", highlight: "gold" },
  { value: "118", label: "Max streak (days)" },
  { value: "37", label: "Contests attended", highlight: "teal" },
  { value: "1,912", label: "Best CF rating" },
];

export const platforms = [
  { name: "LeetCode", handle: "@devora_codes", color: "#E8A33D", init: "LC", solved: 612, extra: "Rating 2041", verified: true },
  { name: "GeeksforGeeks", handle: "@devora.gfg", color: "#5FAE7A", init: "GFG", solved: 301, extra: "Rank 8.2k", verified: true },
  { name: "CodeChef", handle: "@devora_c", color: "#D9645A", init: "CC", solved: 158, extra: "4★ · 1823", verified: true },
  { name: "Codeforces", handle: "@devora_sh", color: "#49B4AE", init: "CF", solved: 214, extra: "Rating 1912", verified: true },
  { name: "HackerRank", handle: "@devora_h", color: "#3AAE6B", init: "HR", solved: 97, extra: "5★ problem solving", verified: false },
  { name: "GitHub", handle: "@devora-dev", color: "#8B93A1", init: "GH", solved: 412, extra: "412 contributions", verified: true },
];

export const questions = [
  { title: "Two Sum", sheet: "Blind 75", difficulty: "Easy", status: "solved", hasNote: true },
  { title: "Longest Substring Without Repeating Characters", sheet: "Striver A2Z", difficulty: "Medium", status: "review", hasNote: true },
  { title: "Merge K Sorted Lists", sheet: "NeetCode 150", difficulty: "Hard", status: "todo", hasNote: false },
  { title: "Word Break", sheet: "CP-31", difficulty: "Medium", status: "solved", hasNote: true },
  { title: "Course Schedule II", sheet: "Striver A2Z", difficulty: "Medium", status: "review", hasNote: false },
  { title: "Trapping Rain Water", sheet: "Blind 75", difficulty: "Hard", status: "solved", hasNote: true },
  { title: "Number of Islands", sheet: "NeetCode 150", difficulty: "Medium", status: "solved", hasNote: false },
  { title: "Binary Tree Maximum Path Sum", sheet: "Striver A2Z", difficulty: "Hard", status: "todo", hasNote: false },
];

export const events = [
  { day: "21", month: "SEP", name: "LeetCode Weekly Contest 421", meta: "Sun · 8:00 AM IST · Rated" },
  { day: "24", month: "SEP", name: "Codeforces Round 987 (Div. 2)", meta: "Wed · 8:35 PM IST · Rated" },
  { day: "28", month: "SEP", name: "CodeChef Starters 152", meta: "Sun · 8:00 PM IST · Rated" },
  { day: "05", month: "OCT", name: "AtCoder Beginner Contest 380", meta: "Sat · 5:30 PM IST · Rated" },
];

export const difficultyColor = {
  Easy: "var(--easy)",
  Medium: "var(--med)",
  Hard: "var(--hard)",
};

export const statusConfig: Record<
  string,
  { label: string; className: string }
> = {
  solved: { label: "Solved", className: "status-solved" },
  review: { label: "Needs review", className: "status-review" },
  todo: { label: "To-do", className: "status-todo" },
  bookmarked: { label: "Bookmarked", className: "status-bookmark" },
};

export const platformStatData = [
  { platform: "LeetCode", metric: "650", unit: "Solved", barColor: "var(--orange)", rank: "Top 12%" },
  { platform: "GeeksforGeeks", metric: "420", unit: "Solved", barColor: "var(--easy)", rank: "Top 18%" },
  { platform: "CodeChef", metric: "3 ★", unit: "Rating 1542", barColor: "linear-gradient(90deg,#f2932c,#d9a441)", rank: "Top 20%" },
  { platform: "Codeforces", metric: "Expert", unit: "Max 1623", barColor: "var(--teal)", rank: "Top 15%" },
  { platform: "HackerRank", metric: "5 ★", unit: "Badges", barColor: "var(--easy)", rank: "Top 25%" },
];

export const techStack = [
  { name: "React", color: "#61dafb" },
  { name: "Next.js", color: "#000" },
  { name: "Node.js", color: "#339933" },
  { name: "Python", color: "#3776ab" },
  { name: "Java", color: "#b07219" },
  { name: "MySQL", color: "#00758f" },
];
