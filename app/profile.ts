type ProfileUser = {
  username: string;
  display_name: string | null;
  avatar: string | null;
  links: string | null;
};

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

function renderLinks(raw: string | null): string {
  if (!raw) return "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "";
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return "";
  }

  const entries = Object.entries(parsed).filter(
    ([, url]) => typeof url === "string"
  );
  if (entries.length === 0) return "";

  return entries
    .map(([key, url]) => {
      const label = escapeHtml(key.charAt(0).toUpperCase() + key.slice(1));
      const href = escapeHtml(url as string);
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
  const initial = escapeHtml((user.display_name ?? user.username)[0]?.toUpperCase() ?? "?");

  const avatarBlock = user.avatar
    ? `<img src="${safeAvatar}" alt="avatar" class="w-24 h-24 rounded-full object-cover mx-auto" />`
    : `<div class="w-24 h-24 bg-blue-500 rounded-full flex items-center justify-center text-white text-4xl font-bold mx-auto">${initial}</div>`;

  const linksBlock = renderLinks(user.links);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeDisplayName} (@${safeUsername})</title>
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
