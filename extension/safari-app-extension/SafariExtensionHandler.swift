import SafariServices
import Foundation

class SafariExtensionHandler: SFSafariExtensionHandler {
    
    override func messageReceived(withName messageName: String, from page: SFSafariPage, userInfo: [String : Any]?) {
        // Handle messages from the web extension
        page.getPropertiesWithCompletionHandler { properties in
            NSLog("The extension received a message (\(messageName)) from a script injected into (\(String(describing: properties?.url))) with userInfo (\(userInfo ?? [:]))")
            
            switch messageName {
            case "analyzeDocument":
                self.handleAnalyzeDocument(page: page, userInfo: userInfo)
            case "getStoredData":
                self.handleGetStoredData(page: page, userInfo: userInfo)
            case "setStoredData":
                self.handleSetStoredData(page: page, userInfo: userInfo)
            case "showNotification":
                self.handleShowNotification(userInfo: userInfo)
            default:
                NSLog("Unknown message: \(messageName)")
            }
        }
    }
    
    override func toolbarItemClicked(in window: SFSafariWindow) {
        // This is called when the user clicks the toolbar button
        window.getActiveTab { activeTab in
            activeTab?.getActivePage { activePage in
                activePage?.dispatchMessageToScript(withName: "togglePopup", userInfo: nil)
            }
        }
    }
    
    override func validateToolbarItem(in window: SFSafariWindow, validationHandler: @escaping ((Bool, String) -> Void)) {
        // This is called to validate the toolbar item
        // You can customize the toolbar item's appearance and behavior here
        window.getActiveTab { activeTab in
            activeTab?.getActivePage { activePage in
                activePage?.getPropertiesWithCompletionHandler { properties in
                    let isLegalDocument = self.isLegalDocument(url: properties?.url)
                    let title = isLegalDocument ? "Analyze Legal Document" : "Fine Print AI"
                    let isEnabled = properties?.url != nil
                    validationHandler(isEnabled, title)
                }
            }
        }
    }
    
    override func popoverViewController() -> SFSafariExtensionViewController {
        return SafariExtensionViewController.shared
    }
    
    override func popoverWillShow(in window: SFSafariWindow) {
        // Update popover content when it's about to show
        window.getActiveTab { activeTab in
            activeTab?.getActivePage { activePage in
                activePage?.getPropertiesWithCompletionHandler { properties in
                    if let url = properties?.url {
                        SafariExtensionViewController.shared.updateForURL(url)
                    }
                }
            }
        }
    }
    
    // MARK: - Message Handlers
    
    private func handleAnalyzeDocument(page: SFSafariPage, userInfo: [String: Any]?) {
        guard let content = userInfo?["content"] as? String,
              let url = userInfo?["url"] as? String else {
            page.dispatchMessageToScript(withName: "analysisError", userInfo: ["error": "Missing content or URL"])
            return
        }
        
        // Perform analysis (this would integrate with your AI backend)
        AnalysisService.shared.analyzeDocument(content: content, url: url) { result in
            switch result {
            case .success(let analysis):
                page.dispatchMessageToScript(withName: "analysisComplete", userInfo: analysis.toDictionary())
            case .failure(let error):
                page.dispatchMessageToScript(withName: "analysisError", userInfo: ["error": error.localizedDescription])
            }
        }
    }
    
    private func handleGetStoredData(page: SFSafariPage, userInfo: [String: Any]?) {
        guard let key = userInfo?["key"] as? String else {
            page.dispatchMessageToScript(withName: "storageError", userInfo: ["error": "Missing key"])
            return
        }
        
        let value = UserDefaults.standard.object(forKey: key)
        page.dispatchMessageToScript(withName: "storageRetrieved", userInfo: ["key": key, "value": value ?? NSNull()])
    }
    
    private func handleSetStoredData(page: SFSafariPage, userInfo: [String: Any]?) {
        guard let key = userInfo?["key"] as? String,
              let value = userInfo?["value"] else {
            page.dispatchMessageToScript(withName: "storageError", userInfo: ["error": "Missing key or value"])
            return
        }
        
        UserDefaults.standard.set(value, forKey: key)
        page.dispatchMessageToScript(withName: "storageSet", userInfo: ["key": key, "success": true])
    }
    
    private func handleShowNotification(userInfo: [String: Any]?) {
        guard let title = userInfo?["title"] as? String,
              let message = userInfo?["message"] as? String else {
            return
        }
        
        let notification = UNMutableNotificationContent()
        notification.title = title
        notification.body = message
        notification.sound = UNNotificationSound.default
        
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: notification, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
    
    // MARK: - Helper Methods
    
    private func isLegalDocument(url: URL?) -> Bool {
        guard let url = url else { return false }
        let urlString = url.absoluteString.lowercased()
        let path = url.path.lowercased()
        
        let legalIndicators = [
            "terms", "privacy", "policy", "eula", "license", "agreement",
            "tos", "terms-of-service", "privacy-policy", "legal"
        ]
        
        return legalIndicators.contains { indicator in
            urlString.contains(indicator) || path.contains(indicator)
        }
    }
}

// MARK: - Analysis Service

class AnalysisService {
    static let shared = AnalysisService()
    
    enum AnalysisError: Error {
        case networkError
        case invalidResponse
        case serverError(String)
    }
    
    func analyzeDocument(content: String, url: String, completion: @escaping (Result<AnalysisResult, AnalysisError>) -> Void) {
        // This would integrate with your Fine Print AI backend
        // For now, we'll simulate the analysis
        
        DispatchQueue.global().asyncAfter(deadline: .now() + 2.0) {
            let findings = self.simulateAnalysis(content: content)
            let result = AnalysisResult(
                url: url,
                riskScore: findings.isEmpty ? 20 : 75,
                findings: findings,
                analysisId: UUID().uuidString,
                timestamp: Date().timeIntervalSince1970
            )
            
            DispatchQueue.main.async {
                completion(.success(result))
            }
        }
    }
    
    private func simulateAnalysis(content: String) -> [Finding] {
        var findings: [Finding] = []
        
        if content.lowercased().contains("automatic renewal") {
            findings.append(Finding(
                id: UUID().uuidString,
                category: "Billing",
                title: "Automatic Renewal",
                description: "This service automatically renews your subscription",
                severity: "high",
                recommendation: "Check cancellation terms carefully"
            ))
        }
        
        if content.lowercased().contains("third party") || content.lowercased().contains("third-party") {
            findings.append(Finding(
                id: UUID().uuidString,
                category: "Privacy",
                title: "Third-party Data Sharing",
                description: "Your data may be shared with third parties",
                severity: "medium",
                recommendation: "Review what data is shared and with whom"
            ))
        }
        
        return findings
    }
}

// MARK: - Data Models

struct AnalysisResult {
    let url: String
    let riskScore: Int
    let findings: [Finding]
    let analysisId: String
    let timestamp: TimeInterval
    
    func toDictionary() -> [String: Any] {
        return [
            "url": url,
            "riskScore": riskScore,
            "findings": findings.map { $0.toDictionary() },
            "analysisId": analysisId,
            "timestamp": timestamp
        ]
    }
}

struct Finding {
    let id: String
    let category: String
    let title: String
    let description: String
    let severity: String
    let recommendation: String
    
    func toDictionary() -> [String: Any] {
        return [
            "id": id,
            "category": category,
            "title": title,
            "description": description,
            "severity": severity,
            "recommendation": recommendation
        ]
    }
}