-- Schema definition for custom-circuit-breaker plugin

local typedefs = require "kong.db.schema.typedefs"

return {
  name = "custom-circuit-breaker",
  fields = {
    { consumer = typedefs.no_consumer },
    { protocols = typedefs.protocols_http },
    { config = {
        type = "record",
        fields = {
          { failure_threshold = { type = "integer", default = 5, between = {1, 100} } },
          { failure_rate_threshold = { type = "number", default = 0.5, between = {0, 1} } },
          { min_request_threshold = { type = "integer", default = 10, between = {1, 1000} } },
          { recovery_timeout = { type = "integer", default = 30, between = {1, 3600} } },
          { success_threshold = { type = "integer", default = 3, between = {1, 20} } },
          { half_open_max_requests = { type = "integer", default = 3, between = {1, 10} } },
          { redis_host = { type = "string", default = "redis" } },
          { redis_port = { type = "integer", between = {1, 65535}, default = 6379 } },
          { redis_timeout = { type = "integer", default = 2000 } },
          { redis_password = { type = "string", encrypted = true } },
          { redis_database = { type = "integer", between = {0, 15}, default = 0 } },
          { state_ttl = { type = "integer", default = 3600 } },
          { stats_ttl = { type = "integer", default = 86400 } },
          { custom_fallback_response = { type = "record", fields = {} } },
          { monitor_window = { type = "integer", default = 60, between = {10, 3600} } },
        }
      }
    }
  }
}