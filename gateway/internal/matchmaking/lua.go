package matchmaking

const MatchQueueMultiClaimScript = `-- MATCH_QUEUE_MULTI_CLAIM
local user_prefix = ARGV[1]
local self_id = ARGV[2]
local max_scans = 50

for i = 1, #KEYS do
  local bucket = KEYS[i]
  local scanned = 0
  local candidate = redis.call('SPOP', bucket)
  while candidate and scanned < max_scans do
    scanned = scanned + 1
    if candidate ~= self_id then
      local pointer_key = user_prefix .. candidate
      local pointer = redis.call('GET', pointer_key)
      if pointer then
        -- Atomically claim candidate and delete pointers
        redis.call('DEL', pointer_key)
        redis.call('DEL', user_prefix .. self_id)

        -- Atomically remove candidate from ALL registered sets:
        -- 1. Candidate's own bucket
        redis.call('SREM', pointer, candidate)

        -- 2. Candidate's band pool (derived from pointer)
        local band = string.match(pointer, "^match_queue:([^:]+):")
        if band then
          redis.call('SREM', 'match_queue:band:' .. band, candidate)
        end

        -- 3. All band brackets (ensures no band cross-talk / ghost entries)
        local all_bands = {'4.0', '4.5', '5.0', '5.5', '6.0', '6.5', '7.0', '7.5', '8.0', '8.5', '9.0'}
        for _, b in ipairs(all_bands) do
          redis.call('SREM', 'match_queue:band:' .. b, candidate)
        end

        -- 4. All priority pools
        redis.call('SREM', 'match_queue:priority:BOSS', candidate)
        redis.call('SREM', 'match_queue:priority:PRO', candidate)
        redis.call('SREM', 'match_queue:priority:PLUS', candidate)

        -- 5. Global pool
        redis.call('SREM', 'match_queue:global', candidate)

        -- 6. All candidate buckets scanned
        for j = 1, #KEYS do
          redis.call('SREM', KEYS[j], candidate)
        end

        return { candidate, bucket }
      else
        -- Purge ghost candidate from auxiliary pools
        redis.call('SREM', 'match_queue:priority:BOSS', candidate)
        redis.call('SREM', 'match_queue:priority:PRO', candidate)
        redis.call('SREM', 'match_queue:priority:PLUS', candidate)
        redis.call('SREM', 'match_queue:global', candidate)
      end
    end
    candidate = redis.call('SPOP', bucket)
  end
end
return false`

const LockReleaseScript = `-- LOCK_RELEASE
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`

const CancelQueueScript = `-- CANCEL_QUEUE
local bucket = redis.call('GET', KEYS[1])
if bucket then
  redis.call('SREM', bucket, ARGV[1])
  redis.call('DEL', KEYS[1])
  return 1
end
return 0`
