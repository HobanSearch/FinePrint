-- Schema definition for custom-auth plugin

local typedefs = require "kong.db.schema.typedefs"

return {
  name = "custom-auth",
  fields = {
    { consumer = typedefs.no_consumer },
    { protocols = typedefs.protocols_http },
    { config = {
        type = "record",
        fields = {
          { jwt_secret = { type = "string", required = true, encrypted = true } },
          { redis_host = { type = "string", default = "redis" } },
          { redis_port = { type = "integer", between = {1, 65535}, default = 6379 } },
          { redis_timeout = { type = "integer", default = 2000 } },
          { redis_password = { type = "string", encrypted = true } },
          { redis_database = { type = "integer", between = {0, 15}, default = 0 } },
          { access_token_ttl = { type = "integer", default = 900 } },
          { refresh_token_ttl = { type = "integer", default = 86400 } },
          { allowed_tiers = { type = "array", elements = { type = "string" }, default = {} } },
          { rate_limit_by_tier = { type = "boolean", default = true } },
          { session_storage = { type = "boolean", default = true } },
          { audit_logging = { type = "boolean", default = true } },
          { ip_whitelist = { type = "array", elements = { type = "string" }, default = {} } },
          { ip_blacklist = { type = "array", elements = { type = "string" }, default = {} } },
          { max_sessions_per_user = { type = "integer", default = 5 } },
          { token_refresh_threshold = { type = "integer", default = 300 } }, -- 5 minutes
        }
      }
    }
  }
}