#!/bin/sh
set -eu
# Schema changes are a separately reviewed deployment step (npm run db:deploy).
# Startup must never accept data loss or continue with missing persistent storage.
GATEWAY_PID=''
PORT=3000 node dist/index.js &
NODE_PID=$!
stop_children() {
  trap - TERM INT
  kill -TERM "$NODE_PID" ${GATEWAY_PID:+"$GATEWAY_PID"} 2>/dev/null || true
  wait "$NODE_PID" 2>/dev/null || true
  if [ -n "$GATEWAY_PID" ]; then wait "$GATEWAY_PID" 2>/dev/null || true; fi
}
trap 'stop_children; exit 0' TERM INT
attempt=0
until node -e "fetch('http://127.0.0.1:3000/health',{signal:AbortSignal.timeout(2000)}).then(async r=>{const j=await r.json();process.exit(r.ok&&j.status==='ok'?0:1)}).catch(()=>process.exit(1))"; do
  attempt=$((attempt+1))
  if [ "$attempt" -ge 30 ] || ! kill -0 "$NODE_PID" 2>/dev/null; then
    echo '[Startup] Persistent backend readiness failed.' >&2
    stop_children; exit 1
  fi
  sleep 1
done
if [ -f '/usr/local/bin/gateway' ]; then
  NODE_URL='http://127.0.0.1:3000' /usr/local/bin/gateway &
  GATEWAY_PID=$!
  while kill -0 "$NODE_PID" 2>/dev/null && kill -0 "$GATEWAY_PID" 2>/dev/null; do sleep 1; done
  echo '[Runtime] A required service exited; stopping both services.' >&2
  stop_children; exit 1
else
  wait "$NODE_PID"
fi
