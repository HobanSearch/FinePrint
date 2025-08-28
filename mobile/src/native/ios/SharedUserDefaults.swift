import Foundation
import React

@objc(SharedUserDefaults)
class SharedUserDefaults: NSObject {
    
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    @objc
    func setItem(_ appGroup: String, key: String, value: Any, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        guard let userDefaults = UserDefaults(suiteName: appGroup) else {
            rejecter("USERDEFAULTS_ERROR", "Failed to access shared UserDefaults", nil)
            return
        }
        
        userDefaults.set(value, forKey: key)
        userDefaults.synchronize()
        resolver(true)
    }
    
    @objc
    func getItem(_ appGroup: String, key: String, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        guard let userDefaults = UserDefaults(suiteName: appGroup) else {
            rejecter("USERDEFAULTS_ERROR", "Failed to access shared UserDefaults", nil)
            return
        }
        
        let value = userDefaults.object(forKey: key)
        resolver(value)
    }
    
    @objc
    func removeItem(_ appGroup: String, key: String, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        guard let userDefaults = UserDefaults(suiteName: appGroup) else {
            rejecter("USERDEFAULTS_ERROR", "Failed to access shared UserDefaults", nil)
            return
        }
        
        userDefaults.removeObject(forKey: key)
        userDefaults.synchronize()
        resolver(true)
    }
    
    @objc
    func getAllKeys(_ appGroup: String, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        guard let userDefaults = UserDefaults(suiteName: appGroup) else {
            rejecter("USERDEFAULTS_ERROR", "Failed to access shared UserDefaults", nil)
            return
        }
        
        let keys = Array(userDefaults.dictionaryRepresentation().keys)
        resolver(keys)
    }
}

// MARK: - Widget Center Bridge
@objc(WidgetCenter)
class WidgetCenter: NSObject {
    
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    @objc
    func reloadAllTimelines(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        if #available(iOS 14.0, *) {
            WidgetKit.WidgetCenter.shared.reloadAllTimelines()
            resolver(true)
        } else {
            rejecter("WIDGET_ERROR", "WidgetKit not available on this iOS version", nil)
        }
    }
    
    @objc
    func reloadTimelines(_ kind: String, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        if #available(iOS 14.0, *) {
            WidgetKit.WidgetCenter.shared.reloadTimelines(ofKind: kind)
            resolver(true)
        } else {
            rejecter("WIDGET_ERROR", "WidgetKit not available on this iOS version", nil)
        }
    }
    
    @objc
    func getCurrentConfigurations(_ resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        if #available(iOS 14.0, *) {
            WidgetKit.WidgetCenter.shared.getCurrentConfigurations { result in
                switch result {
                case .success(let configurations):
                    let configArray = configurations.map { config in
                        return [
                            "kind": config.kind,
                            "family": config.family.rawValue
                        ]
                    }
                    resolver(configArray)
                case .failure(let error):
                    rejecter("WIDGET_ERROR", error.localizedDescription, error)
                }
            }
        } else {
            rejecter("WIDGET_ERROR", "WidgetKit not available on this iOS version", nil)
        }
    }
}