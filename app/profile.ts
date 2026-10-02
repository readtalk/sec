type ProfileUser = {
  username: string;
  display_name: string | null;
  avatar: string | null;
  links: string | null;
};

const DEFAULT_OG_IMAGE =
  "https://raw.githubusercontent.com/readtalk/sec/refs/heads/main/public/favicon.ico";

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

function renderLinks(raw: string | null): string {
  const links = parseLinks(raw);
  const entries = Object.entries(links);
  if (entries.length === 0) return "";

  return entries
    .map(([key, url]) => {
      const label = escapeHtml(key.charAt(0).toUpperCase() + key.slice(1));
      const href = escapeHtml(url);
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"
        class="block w-full text-center bg-gray-900 hover:bg-gray-700 text-white font-medium px-4 py-3 rounded-xl transition">
        ${label}
      </a>`;
    })
    .join("");
}

export function ProfileHTML(user: ProfileUser): string {
  const safeUsername = escapeHtml(user.username);
  const safeDisplayName = escapeHtml(user.display_name ?? user.username);
  const safeAvatar = escapeHtml(user.avatar ?? "");
  const initial = escapeHtml(
    (user.display_name ?? user.username)[0]?.toUpperCase() ?? "?"
  );

  const avatarBlock = user.avatar
    ? `<img src="${safeAvatar}" alt="avatar" class="w-24 h-24 rounded-full object-cover mx-auto" />`
    : `<div class="w-24 h-24 bg-blue-500 rounded-full flex items-center justify-center text-white text-4xl font-bold mx-auto">${initial}</div>`;

  const linksBlock = renderLinks(user.links);
  const ogImage = safeAvatar || DEFAULT_OG_IMAGE;
  const ogTitle = `${safeDisplayName} (@${safeUsername})`;
  const ogDescription = `Lihat semua link dari ${safeDisplayName}.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeDisplayName} (@${safeUsername})</title>
  <meta name="description" content="${ogDescription}" />

  <meta property="og:title" content="${ogTitle}" />
  <meta property="og:description" content="${ogDescription}" />
  <meta property="og:url" content="https://url.readtalk.workers.dev/@${safeUsername}" />
  <meta property="og:type" content="profile" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${ogTitle}" />
  <meta name="twitter:description" content="${ogDescription}" />
  <meta name="twitter:image" content="${ogImage}" />

  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gray-100 flex items-start justify-center p-4">
  <div class="max-w-md w-full my-8 text-center">
    ${avatarBlock}
    <h1 class="text-2xl font-bold mt-4">${safeDisplayName}</h1>
    <p class="text-gray-500">@${safeUsername}</p>

    ${linksBlock ? `<div class="mt-8 space-y-3">${linksBlock}</div>` : ""}
  </div>
</body>
</html>`;
}

export function NotFoundHTML(username: string): string {
  const safe = escapeHtml(username);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Not Found</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
  <div class="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
    <h1 class="text-2xl font-bold mb-2">404</h1>
    <p class="text-gray-600">@${safe} tidak ditemukan.</p>
  </div>
</body>
</html>`;
}
