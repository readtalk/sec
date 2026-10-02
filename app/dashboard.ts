type DashboardUser = {
  id: string;
  email: string;
  created_at: string;
  username: string | null;
  display_name: string | null;
  avatar: string | null;
  links: string | null;
};

const PLATFORMS = [
  { key: "instagram", label: "Instagram", base: "https://instagram.com/", prefix: "" },
  { key: "facebook",  label: "Facebook",  base: "https://facebook.com/",  prefix: "" },
  { key: "tiktok",    label: "TikTok",    base: "https://tiktok.com/@",  prefix: "@" },
  { key: "twitter",   label: "Twitter/X", base: "https://x.com/",         prefix: "" },
  { key: "youtube",   label: "YouTube",   base: "https://youtube.com/@",  prefix: "@" },
  { key: "linkedin",  label: "LinkedIn",  base: "https://linkedin.com/in/", prefix: "" },
  { key: "github",    label: "GitHub",    base: "https://github.com/",    prefix: "" },
] as const;

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
}

function parseLinks(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Ambil slug dari URL, buang base-nya. Contoh: "https://x.com/foo" → "foo" */
function extractSlug(key: string, url: string): string {
  const platform = PLATFORMS.find((p) => p.key === key);
  if (!platform) return url;
  if (!url.startsWith(platform.base)) return url;
  let slug = url.slice(platform.base.length);
  if (platform.prefix && slug.startsWith(platform.prefix)) {
    slug = slug.slice(platform.prefix.length);
  }
  return slug.replace(/\/+$/, "");
}

function renderLinks(raw: string | null): string {
  const links = parseLinks(raw);
  const entries = Object.entries(links);
  if (entries.length === 0) {
    return `<p class="text-sm text-gray-400">Belum ada link.</p>`;
  }
  const items = entries
    .map(([key, url]) => {
      const label = escapeHtml(key.charAt(0).toUpperCase() + key.slice(1));
      const href = escapeHtml(url);
      return `<li><span class="text-gray-500">${label}:</span> <a href="${href}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline break-all">${href}</a></li>`;
    })
    .join("");
  return `<ul class="list-disc list-inside text-sm space-y-1">${items}</ul>`;
}

export function DashboardHTML(
  user: DashboardUser,
  flash?: { ok?: string; error?: string }
): string {
  const safeEmail = escapeHtml(user.email);
  const safeId = escapeHtml(user.id);
  const safeCreated = escapeHtml(user.created_at);
  const safeUsername = escapeHtml(user.username ?? "");
  const safeDisplayName = escapeHtml(user.display_name ?? "");
  const safeAvatar = escapeHtml(user.avatar ?? "");
  const initial = escapeHtml((user.email[0] ?? "?").toUpperCase());

  const links = parseLinks(user.links);

  const avatarBlock = user.avatar
    ? `<img src="${safeAvatar}" alt="avatar" class="w-12 h-12 rounded-full object-cover" />`
    : `<div class="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white text-xl font-bold">${initial}</div>`;

  const flashBlock = flash?.ok
    ? `<div class="mb-4 rounded-lg bg-green-100 text-green-800 text-sm px-3 py-2">${escapeHtml(flash.ok)}</div>`
    : flash?.error
      ? `<div class="mb-4 rounded-lg bg-red-100 text-red-800 text-sm px-3 py-2">${escapeHtml(flash.error)}</div>`
      : "";

  const platformInputs = PLATFORMS.map((p) => {
    const existing = links[p.key] ?? "";
    const slug = existing ? extractSlug(p.key, existing) : "";
    const safeSlug = escapeHtml(slug);
    return `
      <div class="flex items-center gap-2">
        <span class="w-24 text-sm text-gray-600 shrink-0">${p.label}</span>
        <span class="text-xs text-gray-400 font-mono hidden sm:inline">${escapeHtml(p.base)}${p.prefix ? escapeHtml(p.prefix) : ""}</span>
        <input
          type="text"
          name="link_${p.key}"
          value="${safeSlug}"
          placeholder="username"
          class="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
      </div>
    `;
  }).join("");

  const websiteExisting = links["website"] ?? "";
  const safeWebsite = escapeHtml(websiteExisting);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gray-100 flex items-start justify-center p-4">
  <div class="bg-white p-8 rounded-xl shadow-lg max-w-2xl w-full my-8">
    ${flashBlock}
    <div class="flex items-center gap-4 mb-6">
      ${avatarBlock}
      <div>
        <h1 class="text-2xl font-bold">${safeDisplayName || "Welcome!"}</h1>
        <p class="text-gray-600">${safeEmail}</p>
      </div>
    </div>
    <div class="border-t pt-4 mb-6 text-sm text-gray-500 space-y-1">
      <p>User ID: <span class="font-mono">${safeId}</span></p>
      <p>Username: <span class="font-mono">${safeUsername || "—"}</span></p>
      <p>Terdaftar: <span class="font-mono">${safeCreated}</span></p>
    </div>
    <div class="border-t pt-4 mb-6">
      <h2 class="text-sm font-semibold text-gray-700 mb-2">Links</h2>
      ${renderLinks(user.links)}
    </div>
    <div class="border-t pt-6">
      <h2 class="text-lg font-semibold mb-4">Edit Profil</h2>
      <form method="POST" action="/dashboard" class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Username</label>
          <input type="text" name="username" value="${safeUsername}" pattern="[a-zA-Z0-9_-]{3,32}" class="w-full border rounded-lg px-3 py-2" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Display Name</label>
          <input type="text" name="display_name" value="${safeDisplayName}" maxlength="64" class="w-full border rounded-lg px-3 py-2" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Avatar URL</label>
          <input type="url" name="avatar" value="${safeAvatar}" class="w-full border rounded-lg px-3 py-2" />
        </div>

        <div class="border-t pt-4">
          <h3 class="text-sm font-semibold text-gray-700 mb-3">Media Sosial</h3>
          <p class="text-xs text-gray-400 mb-3">Isi username saja—URL otomatis dibentuk. Kosongkan kalau tidak dipakai.</p>
          <div class="space-y-3">
            ${platformInputs}
          </div>
        </div>

        <div class="border-t pt-4">
          <label class="block text-sm font-medium mb-1">Website</label>
          <input type="url" name="link_website" value="${safeWebsite}" placeholder="https://..." class="w-full border rounded-lg px-3 py-2" />
        </div>

        <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg">Simpan</button>
      </form>
    </div>
    <div class="border-t mt-8 pt-4">
      <a href="/logout" class="w-full inline-block text-center bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600">Logout</a>
    </div>
  </div>
</body>
</html>`;
}
