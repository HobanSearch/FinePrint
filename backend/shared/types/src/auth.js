"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Permission = exports.Role = void 0;
var Role;
(function (Role) {
    Role["USER"] = "user";
    Role["ADMIN"] = "admin";
    Role["MODERATOR"] = "moderator";
})(Role || (exports.Role = Role = {}));
var Permission;
(function (Permission) {
    Permission["USER_READ"] = "user:read";
    Permission["USER_WRITE"] = "user:write";
    Permission["USER_DELETE"] = "user:delete";
    Permission["DOCUMENT_READ"] = "document:read";
    Permission["DOCUMENT_WRITE"] = "document:write";
    Permission["DOCUMENT_DELETE"] = "document:delete";
    Permission["ANALYSIS_READ"] = "analysis:read";
    Permission["ANALYSIS_WRITE"] = "analysis:write";
    Permission["ANALYSIS_DELETE"] = "analysis:delete";
    Permission["ADMIN_READ"] = "admin:read";
    Permission["ADMIN_WRITE"] = "admin:write";
    Permission["SYSTEM_CONFIG"] = "system:config";
    Permission["TEAM_READ"] = "team:read";
    Permission["TEAM_WRITE"] = "team:write";
    Permission["TEAM_MANAGE"] = "team:manage";
})(Permission || (exports.Permission = Permission = {}));
//# sourceMappingURL=auth.js.map