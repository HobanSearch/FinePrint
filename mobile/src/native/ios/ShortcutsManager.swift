import Foundation
import Intents
import React

@objc(ShortcutsManager)
class ShortcutsManager: NSObject {

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }

    @objc
    func donateShortcut(_ shortcutData: [String: Any], resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        
        guard let identifier = shortcutData["identifier"] as? String,
              let title = shortcutData["title"] as? String else {
            rejecter("SHORTCUTS_ERROR", "Missing required fields: identifier or title", nil)
            return
        }
        
        let activity = NSUserActivity(activityType: "com.fineprintai.\(identifier)")
        activity.title = title
        activity.isEligibleForSearch = true
        activity.isEligibleForPrediction = true
        activity.isEligibleForHandoff = false
        
        if let suggestedPhrase = shortcutData["suggestedInvocationPhrase"] as? String {
            activity.suggestedInvocationPhrase = suggestedPhrase
        }
        
        if let userInfo = shortcutData["userInfo"] as? [String: Any] {
            activity.userInfo = userInfo
        }
        
        // Add keywords for better Siri recognition
        let keywords = [title, "Fine Print AI", "document", "legal", "analysis", "risk"]
        activity.keywords = Set(keywords)
        
        activity.becomeCurrent()
        
        resolver(true)
    }

    @objc
    func donateInteraction(_ interactionData: [String: Any], resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        
        guard let identifier = interactionData["identifier"] as? String,
              let title = interactionData["title"] as? String else {
            rejecter("SHORTCUTS_ERROR", "Missing required fields for interaction", nil)
            return
        }
        
        let activity = NSUserActivity(activityType: "com.fineprintai.\(identifier)")
        activity.title = title
        activity.isEligibleForSearch = true
        activity.isEligibleForPrediction = true
        
        if let suggestedPhrase = interactionData["suggestedInvocationPhrase"] as? String {
            activity.suggestedInvocationPhrase = suggestedPhrase
        }
        
        if let userInfo = interactionData["userInfo"] as? [String: Any] {
            activity.userInfo = userInfo
        }
        
        // Create interaction for Siri Shortcuts
        let interaction = INInteraction(intent: createCustomIntent(from: interactionData), response: nil)
        interaction.donate { error in
            if let error = error {
                rejecter("SHORTCUTS_ERROR", "Failed to donate interaction: \(error.localizedDescription)", error)
            } else {
                resolver(true)
            }
        }
    }

    @objc
    func handleIntent(_ intentData: [String: Any], resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        
        guard let intentType = intentData["type"] as? String else {
            rejecter("SHORTCUTS_ERROR", "Missing intent type", nil)
            return
        }
        
        var result: [String: Any] = [:]
        
        switch intentType {
        case "document_analysis":
            result = handleDocumentAnalysisIntent(intentData)
        case "voice_command":
            result = handleVoiceCommandIntent(intentData)
        case "risk_summary":
            result = handleRiskSummaryIntent(intentData)
        default:
            rejecter("SHORTCUTS_ERROR", "Unknown intent type: \(intentType)", nil)
            return
        }
        
        resolver(result)
    }
    
    @objc
    func getAvailableShortcuts(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        let shortcuts = [
            [
                "identifier": "scan_document",
                "title": "Scan Document",
                "description": "Scan a new legal document for analysis",
                "category": "document_processing"
            ],
            [
                "identifier": "quick_analysis",
                "title": "Quick Risk Analysis",
                "description": "Perform a quick risk analysis on a document",
                "category": "analysis"
            ],
            [
                "identifier": "view_dashboard",
                "title": "View Dashboard",
                "description": "Open the Fine Print AI dashboard",
                "category": "navigation"
            ],
            [
                "identifier": "recent_documents",
                "title": "Recent Documents",
                "description": "View recently analyzed documents",
                "category": "navigation"
            ],
            [
                "identifier": "high_risk_alerts",
                "title": "High Risk Alerts",
                "description": "View documents with high risk scores",
                "category": "alerts"
            ]
        ]
        
        resolver(shortcuts)
    }
    
    @objc
    func deleteAllDonatedShortcuts(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        INInteraction.deleteAll { error in
            if let error = error {
                rejecter("SHORTCUTS_ERROR", "Failed to delete shortcuts: \(error.localizedDescription)", error)
            } else {
                resolver(true)
            }
        }
    }
    
    // MARK: - Private Helper Methods
    
    private func createCustomIntent(from data: [String: Any]) -> INIntent {
        // Create a custom intent based on the data
        // This is a simplified version - you'd want to create specific intent classes
        let intent = INIntent()
        return intent
    }
    
    private func handleDocumentAnalysisIntent(_ intentData: [String: Any]) -> [String: Any] {
        var result: [String: Any] = [
            "success": true,
            "action": "document_analysis"
        ]
        
        if let documentId = intentData["documentId"] as? String {
            result["documentId"] = documentId
            result["screen"] = "DocumentDetail"
        } else if let documentUrl = intentData["documentUrl"] as? String {
            result["documentUrl"] = documentUrl
            result["screen"] = "DocumentAnalysis"
        } else {
            result["screen"] = "DocumentScanner"
        }
        
        if let analysisType = intentData["analysisType"] as? String {
            result["analysisType"] = analysisType
        }
        
        return result
    }
    
    private func handleVoiceCommandIntent(_ intentData: [String: Any]) -> [String: Any] {
        guard let command = intentData["command"] as? String else {
            return [
                "success": false,
                "error": "Missing voice command"
            ]
        }
        
        let lowercaseCommand = command.lowercased()
        var result: [String: Any] = [
            "success": true,
            "command": command
        ]
        
        if lowercaseCommand.contains("scan") || lowercaseCommand.contains("analyze") {
            result["action"] = "scan"
            result["screen"] = "DocumentScanner"
        } else if lowercaseCommand.contains("dashboard") {
            result["action"] = "dashboard"
            result["screen"] = "Dashboard"
        } else if lowercaseCommand.contains("recent") {
            result["action"] = "recent"
            result["screen"] = "Documents"
            result["filter"] = "recent"
        } else if lowercaseCommand.contains("high risk") || lowercaseCommand.contains("alert") {
            result["action"] = "alerts"
            result["screen"] = "Documents"
            result["filter"] = "high-risk"
        } else {
            result["action"] = "unknown"
            result["screen"] = "Dashboard"
        }
        
        return result
    }
    
    private func handleRiskSummaryIntent(_ intentData: [String: Any]) -> [String: Any] {
        // This would typically fetch real data from your app's data store
        return [
            "success": true,
            "overallRiskScore": 0.68,
            "totalDocuments": 15,
            "highRiskDocuments": 3,
            "recentAnalyses": 5,
            "summary": "You have 15 documents with a medium risk score of 68%. 3 documents have high risk scores that need attention."
        ]
    }
}

// MARK: - Intent Handler Extension
@available(iOS 12.0, *)
extension ShortcutsManager: INExtension {
    
    func handler(for intent: INIntent) -> Any {
        // Return appropriate intent handler based on intent type
        return self
    }
}

// MARK: - Custom Intent Definitions
@available(iOS 12.0, *)
class DocumentAnalysisIntent: INIntent {
    @NSManaged public var documentId: String?
    @NSManaged public var documentUrl: String?
    @NSManaged public var analysisType: String?
}

@available(iOS 12.0, *)
class VoiceCommandIntent: INIntent {
    @NSManaged public var command: String
    @NSManaged public var parameters: [String: Any]?
}

@available(iOS 12.0, *)
class RiskSummaryIntent: INIntent {
    @NSManaged public var includeDetails: Bool
}