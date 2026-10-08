package matchmaking

const MatchQueueMultiClaimScript = `-- MATCH_QUEUE_MULTI_CLAIM
local user_prefix = ARGV[1]
local self_id = ARGV[2]
local candidate_count = tonumber(ARGV[3])
local queue_ttl = tonumber(ARGV[5])
local max_scans = 50
local self_band = tonumber(string.match(ARGV[4], '^match_queue:([^:]+):'))
local skipped = {}
local function restore_skipped()
  for _, item in ipairs(skipped) do redis.call('SADD', item[1], item[2]) end
end

for i = 1, candidate_count do
  local bucket = KEYS[i]
  local scanned = 0
  local candidate = redis.call('SPOP', bucket)
  while candidate and scanned < max_scans do
    scanned = scanned + 1
    if candidate ~= self_id then
      local pointer_key = user_prefix .. candidate
      local pointer = redis.call('GET', pointer_key)
      local band = pointer and tonumber(string.match(pointer, '^match_queue:([^:]+):'))
      if pointer and band and self_band and math.abs(band-self_band) <= 1.0 then
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
        for j = 1, candidate_count do
          redis.call('SREM', KEYS[j], candidate)
        end

        restore_skipped()
        return { candidate, bucket }
      elseif pointer then
        table.insert(skipped, {bucket, candidate})
      else
        -- Purge ghost candidate from auxiliary pools
        redis.call('SREM', 'match_queue:priority:BOSS', candidate)
        redis.call('SREM', 'match_queue:priority:PRO', candidate)
        redis.call('SREM', 'match_queue:priority:PLUS', candidate)
        redis.call('SREM', 'match_queue:global', candidate)
      end
    end
    if scanned < max_scans then candidate = redis.call('SPOP', bucket) else candidate = nil end
  end
end
restore_skipped()
-- No claim: register all pools and the live pointer before another join can
-- scan. The last key is the user pointer, not a candidate/registration pool.
for i = candidate_count + 1, #KEYS - 1 do
  redis.call('SADD', KEYS[i], self_id)
  redis.call('EXPIRE', KEYS[i], queue_ttl * 2)
end
redis.call('SET', KEYS[#KEYS], ARGV[4], 'EX', queue_ttl)
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
