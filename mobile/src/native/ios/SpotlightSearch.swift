import Foundation
import CoreSpotlight
import MobileCoreServices
import React

@objc(SpotlightSearch)
class SpotlightSearch: NSObject {

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }

    @objc
    func indexItem(_ itemData: [String: Any], resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        
        guard let identifier = itemData["identifier"] as? String,
              let title = itemData["title"] as? String,
              let contentDescription = itemData["contentDescription"] as? String else {
            rejecter("SPOTLIGHT_ERROR", "Missing required fields: identifier, title, or contentDescription", nil)
            return
        }
        
        let attributeSet = CSSearchableItemAttributeSet(itemContentType: kUTTypeItem as String)
        
        // Basic attributes
        attributeSet.title = title
        attributeSet.contentDescription = contentDescription
        
        // Keywords
        if let keywords = itemData["keywords"] as? [String] {
            attributeSet.keywords = keywords
        }
        
        // URL for deep linking
        if let urlString = itemData["url"] as? String, let url = URL(string: urlString) {
            attributeSet.contentURL = url
        }
        
        // Document type
        if let documentType = itemData["documentType"] as? String {
            attributeSet.contentType = documentType
            attributeSet.kind = documentType
        }
        
        // Risk score (custom attribute)
        if let riskScore = itemData["riskScore"] as? Double {
            attributeSet.setValue(riskScore, forCustomKey: CSCustomAttributeKey(keyName: "riskScore")!)
        }
        
        // Last modified date
        if let lastModifiedString = itemData["lastModified"] as? String {
            let dateFormatter = ISO8601DateFormatter()
            if let lastModified = dateFormatter.date(from: lastModifiedString) {
                attributeSet.contentModificationDate = lastModified
            }
        }
        
        // File size
        if let fileSize = itemData["fileSize"] as? NSNumber {
            attributeSet.fileSize = fileSize
        }
        
        // Thumbnail data
        if let thumbnailDataString = itemData["thumbnailData"] as? String,
           let thumbnailData = Data(base64Encoded: thumbnailDataString) {
            attributeSet.thumbnailData = thumbnailData
        }
        
        // Additional custom attributes
        if let additionalAttributes = itemData["additionalAttributes"] as? [String: Any] {
            for (key, value) in additionalAttributes {
                if let customKey = CSCustomAttributeKey(keyName: key) {
                    attributeSet.setValue(value, forCustomKey: customKey)
                }
            }
        }
        
        // Create searchable item
        let item = CSSearchableItem(uniqueIdentifier: identifier, domainIdentifier: "com.fineprintai.documents", attributeSet: attributeSet)
        
        // Index the item
        CSSearchableIndex.default().indexSearchableItems([item]) { error in
            if let error = error {
                rejecter("SPOTLIGHT_ERROR", "Failed to index item: \(error.localizedDescription)", error)
            } else {
                resolver(true)
            }
        }
    }
    
    @objc
    func removeItem(_ identifier: String, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        CSSearchableIndex.default().deleteSearchableItems(withIdentifiers: [identifier]) { error in
            if let error = error {
                rejecter("SPOTLIGHT_ERROR", "Failed to remove item: \(error.localizedDescription)", error)
            } else {
                resolver(true)
            }
        }
    }
    
    @objc
    func removeItems(_ identifiers: [String], resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        CSSearchableIndex.default().deleteSearchableItems(withIdentifiers: identifiers) { error in
            if let error = error {
                rejecter("SPOTLIGHT_ERROR", "Failed to remove items: \(error.localizedDescription)", error)
            } else {
                resolver(true)
            }
        }
    }
    
    @objc
    func clearIndex(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        CSSearchableIndex.default().deleteAllSearchableItems { error in
            if let error = error {
                rejecter("SPOTLIGHT_ERROR", "Failed to clear index: \(error.localizedDescription)", error)
            } else {
                resolver(true)
            }
        }
    }
    
    @objc
    func clearDomain(_ domainIdentifier: String, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: [domainIdentifier]) { error in
            if let error = error {
                rejecter("SPOTLIGHT_ERROR", "Failed to clear domain: \(error.localizedDescription)", error)
            } else {
                resolver(true)
            }
        }
    }
    
    @objc
    func getIndexedItems(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        let query = CSSearchQuery(queryString: "*", attributes: [])
        var items: [[String: Any]] = []
        
        query.foundItemHandler = { item in
            var itemDict: [String: Any] = [:]
            itemDict["uniqueIdentifier"] = item.uniqueIdentifier
            itemDict["domainIdentifier"] = item.domainIdentifier
            
            if let attributeSet = item.attributeSet {
                itemDict["title"] = attributeSet.title
                itemDict["contentDescription"] = attributeSet.contentDescription
                itemDict["keywords"] = attributeSet.keywords
                itemDict["contentURL"] = attributeSet.contentURL?.absoluteString
                itemDict["contentType"] = attributeSet.contentType
                itemDict["contentModificationDate"] = attributeSet.contentModificationDate?.timeIntervalSince1970
                itemDict["fileSize"] = attributeSet.fileSize
            }
            
            items.append(itemDict)
        }
        
        query.completionHandler = { error in
            if let error = error {
                rejecter("SPOTLIGHT_ERROR", "Failed to get indexed items: \(error.localizedDescription)", error)
            } else {
                resolver(items)
            }
        }
        
        query.start()
    }
    
    @objc
    func isIndexingAvailable(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        resolver(CSSearchableIndex.isIndexingAvailable())
    }
}

// MARK: - User Activity Handling
extension SpotlightSearch {
    
    @objc
    func handleUserActivity(_ userActivity: [String: Any], resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        
        guard let activityType = userActivity["activityType"] as? String else {
            rejecter("SPOTLIGHT_ERROR", "Missing activity type", nil)
            return
        }
        
        if activityType == CSSearchableItemActionType {
            var result: [String: Any] = [:]
            
            if let uniqueIdentifier = userActivity["uniqueIdentifier"] as? String {
                result["uniqueIdentifier"] = uniqueIdentifier
            }
            
            if let webpageURL = userActivity["webpageURL"] as? String {
                result["webpageURL"] = webpageURL
            }
            
            if let userInfo = userActivity["userInfo"] as? [String: Any] {
                result["userInfo"] = userInfo
            }
            
            resolver(result)
        } else {
            rejecter("SPOTLIGHT_ERROR", "Unsupported activity type", nil)
        }
    }
}