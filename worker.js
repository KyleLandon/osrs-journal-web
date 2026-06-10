/**
 * Serves static files from [assets] in wrangler.toml.
 * Required when Cloudflare Workers Builds mandates a deploy command.
 */
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
