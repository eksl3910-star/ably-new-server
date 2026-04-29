declare global {
  // Cloudflare Pages/Workers bindings (wrangler.toml)
  // eslint-disable-next-line no-var
  var DB: D1Database | undefined;
}

export {};

