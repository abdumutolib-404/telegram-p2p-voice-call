import { servePublicApi } from './public-api';

export default {
  async fetch(request, env) {
    const response = await servePublicApi(request, env.PUBLIC_API_ORIGIN);
    return response ?? env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
