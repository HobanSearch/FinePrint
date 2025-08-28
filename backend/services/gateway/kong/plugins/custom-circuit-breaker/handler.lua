-- Custom Circuit Breaker Plugin for Fine Print AI
-- Implements circuit breaker pattern with Redis-backed state management

local redis = require "resty.redis"
local cjson = require "cjson"

local CustomCircuitBreakerHandler = {}

CustomCircuitBreakerHandler.PRIORITY = 950
CustomCircuitBreakerHandler.VERSION = "1.0.0"

-- Circuit breaker states
local CLOSED = "closed"
local OPEN = "open"
local HALF_OPEN = "half_open"

-- Initialize Redis connection
local function init_redis(conf)
  local red = redis:new()
  red:set_timeout(conf.redis_timeout)
  
  local ok, err = red:connect(conf.redis_host, conf.redis_port)
  if not ok then
    kong.log.err("Failed to connect to Redis: ", err)
    return nil, err
  end
  
  if conf.redis_password then
    local res, err = red:auth(conf.redis_password)
    if not res then
      kong.log.err("Failed to authenticate with Redis: ", err)
      return nil, err
    end
  end
  
  red:select(conf.redis_database)
  return red
end

-- Get circuit breaker state from Redis
local function get_circuit_state(red, service_name)
  local state_key = "circuit_breaker:state:" .. service_name
  local stats_key = "circuit_breaker:stats:" .. service_name
  
  local state_data = red:get(state_key)
  local stats_data = red:get(stats_key)
  
  local state = {
    status = CLOSED,
    failure_count = 0,
    success_count = 0,
    last_failure_time = 0,
    last_success_time = 0,
    total_requests = 0
  }
  
  if state_data and state_data ~= ngx.null then
    local decoded_state = cjson.decode(state_data)
    for k, v in pairs(decoded_state) do
      state[k] = v
    end
  end
  
  if stats_data and stats_data ~= ngx.null then
    local decoded_stats = cjson.decode(stats_data)
    for k, v in pairs(decoded_stats) do
      state[k] = v
    end
  end
  
  return state
end

-- Update circuit breaker state in Redis
local function update_circuit_state(red, service_name, state, conf)
  local state_key = "circuit_breaker:state:" .. service_name
  local stats_key = "circuit_breaker:stats:" .. service_name
  
  local state_data = {
    status = state.status,
    last_failure_time = state.last_failure_time,
    last_success_time = state.last_success_time
  }
  
  local stats_data = {
    failure_count = state.failure_count,
    success_count = state.success_count,
    total_requests = state.total_requests
  }
  
  -- Set state with TTL
  red:setex(state_key, conf.state_ttl, cjson.encode(state_data))
  red:setex(stats_key, conf.stats_ttl, cjson.encode(stats_data))
end

-- Check if circuit should transition to open
local function should_open_circuit(state, conf)
  local failure_rate = state.total_requests > 0 and (state.failure_count / state.total_requests) or 0
  
  return state.failure_count >= conf.failure_threshold or
         (failure_rate >= conf.failure_rate_threshold and state.total_requests >= conf.min_request_threshold)
end

-- Check if circuit should transition from open to half-open
local function should_half_open_circuit(state, conf)
  local now = ngx.time()
  return (now - state.last_failure_time) >= conf.recovery_timeout
end

-- Check if circuit should transition from half-open to closed
local function should_close_circuit(state, conf)
  return state.success_count >= conf.success_threshold
end

-- Record request success
local function record_success(red, service_name, state, conf)
  state.success_count = state.success_count + 1
  state.total_requests = state.total_requests + 1
  state.last_success_time = ngx.time()
  
  -- Reset failure count on success in half-open state
  if state.status == HALF_OPEN then
    state.failure_count = 0
  end
  
  -- Transition from half-open to closed if enough successes
  if state.status == HALF_OPEN and should_close_circuit(state, conf) then
    state.status = CLOSED
    state.failure_count = 0
    kong.log.info("Circuit breaker closed for service: " .. service_name)
  end
  
  update_circuit_state(red, service_name, state, conf)
end

-- Record request failure
local function record_failure(red, service_name, state, conf)
  state.failure_count = state.failure_count + 1
  state.total_requests = state.total_requests + 1
  state.last_failure_time = ngx.time()
  
  -- Transition to open if failure threshold reached
  if (state.status == CLOSED or state.status == HALF_OPEN) and should_open_circuit(state, conf) then
    state.status = OPEN
    kong.log.warn("Circuit breaker opened for service: " .. service_name .. 
                  " (failures: " .. state.failure_count .. ", rate: " .. 
                  string.format("%.2f", state.failure_count / state.total_requests) .. ")")
  end
  
  update_circuit_state(red, service_name, state, conf)
end

-- Generate fallback response
local function get_fallback_response(conf, service_name)
  local fallback = {
    error = "service_unavailable",
    message = "Service temporarily unavailable due to high error rate",
    service = service_name,
    timestamp = ngx.time(),
    retry_after = conf.recovery_timeout
  }
  
  if conf.custom_fallback_response then
    for k, v in pairs(conf.custom_fallback_response) do
      fallback[k] = v
    end
  end
  
  return fallback
end

function CustomCircuitBreakerHandler:access(conf)
  local service_name = kong.router.get_service().name
  
  -- Initialize Redis
  local red, err = init_redis(conf)
  if not red then
    kong.log.err("Circuit breaker disabled due to Redis error: ", err)
    return -- Continue without circuit breaker
  end
  
  -- Get current circuit state
  local state = get_circuit_state(red, service_name)
  
  -- Check if circuit should transition from open to half-open
  if state.status == OPEN and should_half_open_circuit(state, conf) then
    state.status = HALF_OPEN
    state.success_count = 0
    kong.log.info("Circuit breaker half-opened for service: " .. service_name)
    update_circuit_state(red, service_name, state, conf)
  end
  
  -- Block requests if circuit is open
  if state.status == OPEN then
    red:close()
    
    -- Add circuit breaker headers
    kong.response.set_header("X-Circuit-Breaker-State", "open")
    kong.response.set_header("X-Service-Name", service_name)
    kong.response.set_header("X-Retry-After", tostring(conf.recovery_timeout))
    
    kong.response.exit(503, get_fallback_response(conf, service_name))
  end
  
  -- For half-open state, allow limited requests
  if state.status == HALF_OPEN then
    -- Simple rate limiting for half-open state
    local test_key = "circuit_breaker:test:" .. service_name
    local test_count = red:incr(test_key)
    red:expire(test_key, 10) -- 10 second window
    
    if test_count > conf.half_open_max_requests then
      red:close()
      
      kong.response.set_header("X-Circuit-Breaker-State", "half-open-limited")
      kong.response.set_header("X-Service-Name", service_name)
      
      kong.response.exit(503, get_fallback_response(conf, service_name))
    end
  end
  
  -- Store state and Redis connection for later use
  kong.ctx.shared.circuit_breaker = {
    state = state,
    service_name = service_name,
    redis = red,
    config = conf
  }
  
  -- Add circuit breaker headers
  kong.service.request.set_header("X-Circuit-Breaker-State", state.status)
  kong.service.request.set_header("X-Service-Name", service_name)
end

function CustomCircuitBreakerHandler:header_filter(conf)
  local circuit_data = kong.ctx.shared.circuit_breaker
  if not circuit_data then
    return
  end
  
  -- Add response headers
  kong.response.set_header("X-Circuit-Breaker-State", circuit_data.state.status)
  kong.response.set_header("X-Service-Name", circuit_data.service_name)
  
  -- Record success or failure based on status code
  local status = kong.response.get_status()
  local red = circuit_data.redis
  local state = circuit_data.state
  local config = circuit_data.config
  
  if status >= 200 and status < 400 then
    -- Success
    record_success(red, circuit_data.service_name, state, config)
    kong.response.set_header("X-Request-Result", "success")
  elseif status >= 500 then
    -- Server error - count as failure
    record_failure(red, circuit_data.service_name, state, config)
    kong.response.set_header("X-Request-Result", "failure")
  else
    -- Client error - not counted as failure
    state.total_requests = state.total_requests + 1
    update_circuit_state(red, circuit_data.service_name, state, config)
    kong.response.set_header("X-Request-Result", "client-error")
  end
end

function CustomCircuitBreakerHandler:log(conf)
  local circuit_data = kong.ctx.shared.circuit_breaker
  if not circuit_data then
    return
  end
  
  -- Close Redis connection
  local red = circuit_data.redis
  if red then
    red:close()
  end
  
  -- Log circuit breaker metrics
  local state = circuit_data.state
  kong.log.info("Circuit breaker metrics", {
    service = circuit_data.service_name,
    state = state.status,
    failure_count = state.failure_count,
    success_count = state.success_count,
    total_requests = state.total_requests,
    failure_rate = state.total_requests > 0 and (state.failure_count / state.total_requests) or 0,
    status_code = kong.response.get_status()
  })
end

return CustomCircuitBreakerHandler