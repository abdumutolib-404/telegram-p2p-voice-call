// Match the backend's CommonJS package so Node's native TypeScript loader and
// Railway's CLI can evaluate this file without a separate module package.
const { defineRailway, github, project, service } = require('railway/iac') as typeof import('railway/iac');

// Run from the repo root: railway config plan --file server/railway.ts
// Set this local CLI identifier to the EXISTING Railway backend service name.
// Provider credentials stay in Railway Variables; this file does not declare them.
module.exports = defineRailway((ctx) => {
  const name = process.env.PAIRTALK_RAILWAY_SERVICE_NAME?.trim();
  if (!name) {
    throw new Error('Set PAIRTALK_RAILWAY_SERVICE_NAME to your existing Railway backend service name before planning.');
  }

  const backend = service(name, {
    source: github('abdumutolib-404/telegram-p2p-voice-call', {
      branch: 'main',
      rootDirectory: '/',
    }),
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'server/Dockerfile',
    },
    preDeploy: 'npm run db:deploy',
    healthcheck: '/healthz',
    healthcheckTimeout: 120,
    replicas: 1,
    deploy: {
      startCommand: null,
      sleepApplication: false,
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 10,
      overlapSeconds: 0,
      drainingSeconds: 60,
    },
  });

  return project(ctx.projectName, { resources: [backend] });
});
module.exports.partial = 'pairtalk-backend';
