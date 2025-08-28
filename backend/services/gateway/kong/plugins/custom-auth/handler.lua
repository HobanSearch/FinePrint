-- Custom JWT Authentication Plugin for Fine Print AI
-- Handles JWT validation, refresh tokens, and subscription tier enforcement

local jwt_decoder = require "resty.jwt"
local redis = require "resty.redis"
local cjson = require "cjson"

local CustomAuthHandler = {}

CustomAuthHandler.PRIORITY = 1000
CustomAuthHandler.VERSION = "1.0.0"

-- Configuration schema
local schema = {
  type = "record",
  fields = {
    {
      config = {
        type = "record",
        fields = {
          { jwt_secret = { type = "string", required = true } },
          { redis_host = { type = "string", default = "redis" } },
          { redis_port = { type = "number", default = 6379 } },
          { redis_timeout = { type = "number", default = 2000 } },
          { access_token_ttl = { type = "number", default = 900 } }, -- 15 minutes
          { refresh_token_ttl = { type = "number", default = 86400 } }, -- 24 hours
          { allowed_tiers = { type = "array", elements = { type = "string" }, default = {} } },
          { rate_limit_by_tier = { type = "boolean", default = true } },
        }
      }
    }
  }
}

-- Initialize Redis connection
local function init_redis(conf)
  local red = redis:new()
  red:set_timeout(conf.redis_timeout)
  
  local ok, err = red:connect(conf.redis_host, conf.redis_port)
  if not ok then
    kong.log.err("Failed to connect to Redis: ", err)
    return nil, err
  end
  
  return red
end

-- Validate JWT token
local function validate_jwt(token, secret)
  local jwt_obj = jwt_decoder:verify(secret, token)
  
  if not jwt_obj then
    return nil, "Invalid JWT token"
  end
  
  if not jwt_obj.valid then
    return nil, "JWT validation failed: " .. (jwt_obj.reason or "unknown")
  end
  
  -- Check expiration
  local now = ngx.time()
  if jwt_obj.payload.exp and jwt_obj.payload.exp < now then
    return nil, "JWT token expired"
  end
  
  return jwt_obj.payload
end

-- Check if user tier is allowed for this route
local function check_tier_access(user_tier, allowed_tiers)
  if not allowed_tiers or #allowed_tiers == 0 then
    return true -- No tier restrictions
  end
  
  for _, tier in ipairs(allowed_tiers) do
    if user_tier == tier then
      return true
    end
  end
  
  return false
end

-- Get rate limit for user tier
local function get_tier_rate_limit(tier)
  local limits = {
    free = { minute = 10, hour = 100, day = 500 },
    starter = { minute = 50, hour = 1000, day = 10000 },
    professional = { minute = 200, hour = 5000, day = 50000 },
    team = { minute = 500, hour = 10000, day = 100000 },
    enterprise = { minute = 1000, hour = 20000, day = 200000 }
  }
  
  return limits[tier] or limits.free
end

-- Check rate limit in Redis
local function check_rate_limit(red, user_id, tier, limits)
  local now = ngx.time()
  local minute_key = "rate_limit:" .. user_id .. ":minute:" .. math.floor(now / 60)
  local hour_key = "rate_limit:" .. user_id .. ":hour:" .. math.floor(now / 3600)
  local day_key = "rate_limit:" .. user_id .. ":day:" .. math.floor(now / 86400)
  
  -- Check and increment counters
  local minute_count = red:incr(minute_key)
  red:expire(minute_key, 60)
  
  local hour_count = red:incr(hour_key)
  red:expire(hour_key, 3600)
  
  local day_count = red:incr(day_key)
  red:expire(day_key, 86400)
  
  -- Check limits
  if minute_count > limits.minute then
    return false, "Minute rate limit exceeded", minute_count, limits.minute
  end
  
  if hour_count > limits.hour then
    return false, "Hour rate limit exceeded", hour_count, limits.hour
  end
  
  if day_count > limits.day then
    return false, "Day rate limit exceeded", day_count, limits.day
  end
  
  return true, nil, {
    minute = { current = minute_count, limit = limits.minute },
    hour = { current = hour_count, limit = limits.hour },
    day = { current = day_count, limit = limits.day }
  }
end

-- Store session in Redis
local function store_session(red, user_id, session_data, ttl)
  local session_key = "session:" .. user_id
  local session_json = cjson.encode(session_data)
  
  local ok, err = red:setex(session_key, ttl, session_json)
  if not ok then
    kong.log.err("Failed to store session: ", err)
    return false
  end
  
  return true
end

-- Main access handler
function CustomAuthHandler:access(conf)
  -- Get token from various sources
  local token = kong.request.get_header("Authorization")
  if token then
    token = token:match("Bearer%s+(.+)")
  end
  
  if not token then
    token = kong.request.get_query_arg("jwt") or kong.request.get_query_arg("token")
  end
  
  if not token then
    local cookies = kong.request.get_header("Cookie")
    if cookies then
      token = cookies:match("jwt=([^;]+)") or cookies:match("access_token=([^;]+)")
    end
  end
  
  if not token then
    kong.response.exit(401, {
      error = "unauthorized",
      message = "No authentication token provided"
    })
  end
  
  -- Validate JWT
  local payload, err = validate_jwt(token, conf.jwt_secret)
  if not payload then
    kong.response.exit(401, {
      error = "unauthorized", 
      message = err
    })
  end
  
  -- Extract user information
  local user_id = payload.sub
  local user_tier = payload.tier or "free"
  local user_email = payload.email
  
  -- Check tier access
  if not check_tier_access(user_tier, conf.allowed_tiers) then
    kong.response.exit(403, {
      error = "forbidden",
      message = "Insufficient subscription tier for this endpoint"
    })
  end
  
  -- Initialize Redis for rate limiting and session management
  local red, redis_err = init_redis(conf)
  if not red then
    kong.log.err("Redis connection failed, proceeding without rate limiting: ", redis_err)
  else
    -- Rate limiting by tier
    if conf.rate_limit_by_tier then
      local limits = get_tier_rate_limit(user_tier)
      local allowed, limit_err, stats = check_rate_limit(red, user_id, user_tier, limits)
      
      if not allowed then
        -- Set rate limit headers
        kong.response.set_header("X-RateLimit-Limit", tostring(limits.minute))
        kong.response.set_header("X-RateLimit-Remaining", "0")
        kong.response.set_header("X-RateLimit-Reset", tostring(ngx.time() + 60))
        
        kong.response.exit(429, {
          error = "rate_limit_exceeded",
          message = limit_err,
          tier = user_tier,
          limits = limits
        })
      end
      
      -- Set rate limit headers for successful requests
      if stats then
        kong.response.set_header("X-RateLimit-Limit", tostring(limits.minute))
        kong.response.set_header("X-RateLimit-Remaining", tostring(limits.minute - stats.minute.current))
        kong.response.set_header("X-RateLimit-Reset", tostring(ngx.time() + 60))
      end
    end
    
    -- Store/update session data
    local session_data = {
      user_id = user_id,
      tier = user_tier,
      email = user_email,
      last_access = ngx.time(),
      ip_address = kong.client.get_forwarded_ip(),
      user_agent = kong.request.get_header("User-Agent")
    }
    
    store_session(red, user_id, session_data, conf.access_token_ttl)
    
    -- Close Redis connection
    red:close()
  end
  
  -- Set context for downstream services
  kong.ctx.shared.authenticated_user = {
    id = user_id,
    tier = user_tier,
    email = user_email,
    jwt_payload = payload
  }
  
  -- Add user context headers for downstream services
  kong.service.request.set_header("X-User-ID", user_id)
  kong.service.request.set_header("X-User-Tier", user_tier)
  kong.service.request.set_header("X-User-Email", user_email)
  kong.service.request.set_header("X-Auth-Time", tostring(ngx.time()))
  
  -- Remove sensitive headers
  kong.service.request.clear_header("Authorization")
end

-- Response handler to add additional headers
function CustomAuthHandler:header_filter(conf)
  local user = kong.ctx.shared.authenticated_user
  if user then
    kong.response.set_header("X-User-Tier", user.tier)
    kong.response.set_header("X-Request-ID", kong.ctx.shared.request_id or kong.request.get_header("X-Request-ID"))
  end
end

-- Log access for audit purposes
function CustomAuthHandler:log(conf)
  local user = kong.ctx.shared.authenticated_user
  if user then
    kong.log.info("API access", {
      user_id = user.id,
      tier = user.tier,
      method = kong.request.get_method(),
      path = kong.request.get_path(),
      status = kong.response.get_status(),
      latency = kong.ctx.shared.request_time or 0,
      ip = kong.client.get_forwarded_ip()
    })
  end
end

CustomAuthHandler.schema = schema

return CustomAuthHandler