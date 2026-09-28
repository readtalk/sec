import { issuer } from "@openauthjs/openauth";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";
import { DashboardHTML } from "../app/dashboard";

const subjects = createSubjects({
  user: object({
    id: string(),
  }),
});

const SESSION_COOKIE = "userId";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 hari

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // --- Halaman awal: redirect ke /authorize dengan state ---
    if (url.pathname === "/") {
      url.searchParams.set("redirect_uri", url.origin + "/callback");
      url.searchParams.set("client_id", "your-client-id");
      url.searchParams.set("response_type", "code");
      // state diarahkan ke /dashboard setelah callback sukses
      url.searchParams.set("state", "/dashboard");
      url.pathname = "/authorize";
      return Response.redirect(url.toString());
    }

    // --- Callback: verifikasi state lalu redirect ke tujuan ---
    if (url.pathname === "/callback") {
      const state = url.searchParams.get("state");
      // hanya izinkan path internal (cegah open redirect)
      const target =
        state && state.startsWith("/") && !state.startsWith("//")
          ? state
          : "/";

      return new Response(null, {
        status: 302,
        headers: { Location: target },
      });
    }

    // --- Dashboard: baca cookie, query D1, render ---
    if (url.pathname === "/dashboard") {
      const cookies = parseCookies(request.headers.get("Cookie"));
      const userId = cookies[SESSION_COOKIE];

      if (!userId) {
        return Response.redirect("/", 302);
      }

      let user: { id: string; email: string } | null = null;
      try {
        user = await env.GLOBAL_DB.prepare(
          "SELECT id, email FROM user WHERE id = ?"
        )
          .bind(userId)
          .first<{ id: string; email: string }>();
      } catch (err) {
        console.error("D1 query failed on /dashboard:", err);
        return new Response("Internal error", { status: 500 });
      }

      if (!user) {
        // cookie tidak valid / user sudah tidak ada → bersihkan
        const headers = new Headers({
          Location: "/",
        });
        headers.append("Set-Cookie", clearSessionCookie());
        return new Response(null, { status: 302, headers });
      }

      return new Response(DashboardHTML(user), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // --- Logout ---
    if (url.pathname === "/logout") {
      const headers = new Headers({ Location: "/" });
      headers.append("Set-Cookie", clearSessionCookie());
      return new Response(null, { status: 302, headers });
    }

    // --- Sisanya diserahkan ke OpenAuth (authorize, token, dll) ---
    return issuer({
      storage: CloudflareStorage({
        namespace: env.GLOBAL_KV,
      }),
      subjects,
      providers: {
        password: PasswordProvider(
          PasswordUI({
            sendCode: async (email, code) => {
              // Ganti dengan pengiriman email nyata (Resend, dsb.)
              console.log(`Sending code ${code} to ${email}`);
            },
            copy: {
              input_code: "Code (check Worker logs)",
            },
          })
        ),
      },
      theme: {
        title: "Authentication",
        primary: "#FF0000",
        favicon:
          "https://raw.githubusercontent.com/readtalk/sec/refs/heads/main/public/favicon.ico",
        logo: {
          dark: "https://raw.githubusercontent.com/readtalk/sec/refs/heads/main/src/logo-dark.png",
          light:
            "https://raw.githubusercontent.com/readtalk/sec/refs/heads/main/src/logo-light.png",
        },
      },
      success: async (ctx, value) => {
        const userId = await getOrCreateUser(env, value.email);

        // Set cookie session + redirect ke dashboard
        const headers = new Headers({
          Location: "/dashboard",
        });
        headers.append("Set-Cookie", buildSessionCookie(userId));

        return new Response(null, { status: 302, headers });
      },
    }).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOrCreateUser(env: Env, email: string): Promise<string> {
  try {
    const result = await env.GLOBAL_DB.prepare(
      `
      INSERT INTO user (email)
      VALUES (?)
      ON CONFLICT (email) DO UPDATE SET email = email
      RETURNING id;
      `
    )
      .bind(email)
      .first<{ id: string }>();

    if (!result) {
      throw new Error(`Unable to process user: ${email}`);
    }

    console.log(`Found or created user ${result.id} with email ${email}`);
    return result.id;
  } catch (err) {
    console.error("getOrCreateUser failed:", err);
    throw err;
  }
}

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) continue;
    out[rawKey] = rest.join("=");
  }
  return out;
}

function buildSessionCookie(userId: string): string {
  // SameSite=Lax cukup untuk redirect dari OAuth; Secure aktif di HTTPS.
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(userId)}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE}`,
    "Path=/",
  ].join("; ");
}

function clearSessionCookie(): string {
  return [
    `${SESSION_COOKIE}=`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0",
    "Path=/",
  ].join("; ");
}
