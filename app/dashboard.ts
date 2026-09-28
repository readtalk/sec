type DashboardUser = {
  id: string;
  email: string;
};

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  });
}

export function DashboardHTML(user: DashboardUser): string {
  const safeEmail = escapeHtml(user.email);
  const safeId = escapeHtml(user.id);
  const initial = escapeHtml((user.email[0] ?? "?").toUpperCase());

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
  <div class="bg-white p-8 rounded-xl shadow-lg max-w-md w-full">
    <div class="flex items-center gap-4 mb-6">
      <div class="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white text-xl font-bold">
        ${initial}
      </div>
      <div>
        <h1 class="text-2xl font-bold">Welcome!</h1>
        <p class="text-gray-600">${safeEmail}</p>
      </div>
    </div>
    <div class="border-t pt-4">
      <p class="text-sm text-gray-500">
        User ID: <span class="font-mono">${safeId}</span>
      </p>
    </div>
    <div class="mt-6">
      <a href="/logout"
         class="w-full inline-block text-center bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition">
        Logout
      </a>
    </div>
  </div>
</body>
</html>`;
}
