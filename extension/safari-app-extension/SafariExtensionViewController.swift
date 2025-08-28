import SafariServices
import WebKit

class SafariExtensionViewController: SFSafariExtensionViewController {
    
    static let shared: SafariExtensionViewController = {
        let shared = SafariExtensionViewController()
        shared.preferredContentSize = NSSize(width: 400, height: 600)
        return shared
    }()
    
    @IBOutlet weak var webView: WKWebView!
    @IBOutlet weak var loadingIndicator: NSProgressIndicator!
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupWebView()
        loadPopupInterface()
    }
    
    private func setupWebView() {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = WKUserContentController()
        
        // Add message handlers for communication with the popup
        configuration.userContentController.add(self, name: "analyzeCurrentPage")
        configuration.userContentController.add(self, name: "getSettings")
        configuration.userContentController.add(self, name: "updateSettings")
        configuration.userContentController.add(self, name: "exportData")
        
        webView = WKWebView(frame: view.bounds, configuration: configuration)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        view.addSubview(webView)
        
        // Setup loading indicator
        loadingIndicator = NSProgressIndicator()
        loadingIndicator.style = .spinning
        loadingIndicator.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(loadingIndicator)
        
        NSLayoutConstraint.activate([
            loadingIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            loadingIndicator.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }
    
    private func loadPopupInterface() {
        guard let popupURL = Bundle.main.url(forResource: "popup", withExtension: "html") else {
            NSLog("Could not find popup.html")
            return
        }
        
        loadingIndicator.startAnimation(nil)
        webView.loadFileURL(popupURL, allowingReadAccessTo: popupURL.deletingLastPathComponent())
    }
    
    func updateForURL(_ url: URL) {
        // Update the popup interface based on the current URL
        let javascript = """
            if (window.updateCurrentURL) {
                window.updateCurrentURL('\(url.absoluteString)');
            }
        """
        webView.evaluateJavaScript(javascript) { result, error in
            if let error = error {
                NSLog("Error updating URL: \(error)")
            }
        }
    }
    
    private func getCurrentPageInfo(completion: @escaping ([String: Any]) -> Void) {
        SFSafariApplication.getActiveWindow { window in
            window?.getActiveTab { tab in
                tab?.getActivePage { page in
                    page?.getPropertiesWithCompletionHandler { properties in
                        var pageInfo: [String: Any] = [:]
                        
                        if let url = properties?.url {
                            pageInfo["url"] = url.absoluteString
                            pageInfo["title"] = properties?.title ?? url.lastPathComponent
                        }
                        
                        // Get page content
                        page?.dispatchMessageToScript(withName: "getPageContent", userInfo: nil)
                        
                        completion(pageInfo)
                    }
                }
            }
        }
    }
    
    private func analyzeCurrentPage() {
        getCurrentPageInfo { pageInfo in
            guard let url = pageInfo["url"] as? String else {
                self.showError("Could not get current page URL")
                return
            }
            
            // Request page content from content script
            SFSafariApplication.getActiveWindow { window in
                window?.getActiveTab { tab in
                    tab?.getActivePage { page in
                        page?.dispatchMessageToScript(withName: "getPageContent", userInfo: ["requestId": "analyze"])
                    }
                }
            }
        }
    }
    
    private func showError(_ message: String) {
        let javascript = """
            if (window.showError) {
                window.showError('\(message)');
            }
        """
        webView.evaluateJavaScript(javascript, completionHandler: nil)
    }
    
    private func showAnalysisResult(_ result: [String: Any]) {
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: result, options: [])
            let jsonString = String(data: jsonData, encoding: .utf8) ?? "{}"
            
            let javascript = """
                if (window.showAnalysisResult) {
                    window.showAnalysisResult(\(jsonString));
                }
            """
            webView.evaluateJavaScript(javascript, completionHandler: nil)
        } catch {
            showError("Failed to display analysis result")
        }
    }
    
    private func getSettings() -> [String: Any] {
        let defaults = UserDefaults.standard
        
        return [
            "enabled": defaults.bool(forKey: "extensionEnabled"),
            "autoAnalyze": defaults.bool(forKey: "autoAnalyze"),
            "highlightFindings": defaults.bool(forKey: "highlightFindings"),
            "showNotifications": defaults.bool(forKey: "showNotifications"),
            "analysisThreshold": defaults.string(forKey: "analysisThreshold") ?? "medium",
            "theme": defaults.string(forKey: "theme") ?? "auto"
        ]
    }
    
    private func updateSettings(_ settings: [String: Any]) {
        let defaults = UserDefaults.standard
        
        for (key, value) in settings {
            defaults.set(value, forKey: key)
        }
        
        // Notify content scripts of settings change
        SFSafariApplication.getAllWindows { windows in
            for window in windows {
                window.getAllTabs { tabs in
                    for tab in tabs {
                        tab.getActivePage { page in
                            page?.dispatchMessageToScript(withName: "settingsUpdated", userInfo: settings)
                        }
                    }
                }
            }
        }
    }
    
    private func exportData() {
        // Collect all stored data for export
        let defaults = UserDefaults.standard
        let dictionaryRepresentation = defaults.dictionaryRepresentation()
        
        // Filter only Fine Print AI related data
        let filteredData = dictionaryRepresentation.filter { key, value in
            key.hasPrefix("fineprintai_") || key.hasPrefix("extensionEnabled") || key.hasPrefix("autoAnalyze")
        }
        
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: filteredData, options: .prettyPrinted)
            
            let savePanel = NSSavePanel()
            savePanel.nameFieldStringValue = "fineprint-ai-export.json"
            savePanel.allowedFileTypes = ["json"]
            
            savePanel.begin { response in
                if response == .OK, let url = savePanel.url {
                    do {
                        try jsonData.write(to: url)
                        self.showSuccessMessage("Data exported successfully")
                    } catch {
                        self.showError("Failed to export data: \(error.localizedDescription)")
                    }
                }
            }
        } catch {
            showError("Failed to prepare export data")
        }
    }
    
    private func showSuccessMessage(_ message: String) {
        let javascript = """
            if (window.showSuccess) {
                window.showSuccess('\(message)');
            }
        """
        webView.evaluateJavaScript(javascript, completionHandler: nil)
    }
}

// MARK: - WKScriptMessageHandler

extension SafariExtensionViewController: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.name {
        case "analyzeCurrentPage":
            analyzeCurrentPage()
            
        case "getSettings":
            let settings = getSettings()
            let javascript = """
                if (window.receiveSettings) {
                    window.receiveSettings(\(settings));
                }
            """
            webView.evaluateJavaScript(javascript, completionHandler: nil)
            
        case "updateSettings":
            if let settings = message.body as? [String: Any] {
                updateSettings(settings)
            }
            
        case "exportData":
            exportData()
            
        default:
            NSLog("Unknown message: \(message.name)")
        }
    }
}

// MARK: - WKNavigationDelegate

extension SafariExtensionViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loadingIndicator.stopAnimation(nil)
        loadingIndicator.isHidden = true
    }
    
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        loadingIndicator.stopAnimation(nil)
        loadingIndicator.isHidden = true
        showError("Failed to load popup interface")
    }
}