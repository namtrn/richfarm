import Foundation
import WidgetKit
import React

@objc(WidgetBridge)
class WidgetBridge: NSObject, RCTBridgeModule {
    
    static func moduleName() -> String! {
        return "WidgetBridge"
    }
    
    @objc
    func updateWidget(_ data: NSDictionary) {
        let defaults = UserDefaults(suiteName: "group.com.mygarden.app")
        
        if let plantCount = data["plantCount"] as? Int {
            defaults?.set(plantCount, forKey: "plantCount")
        }
        
        if let nextWatering = data["nextWatering"] as? String {
            defaults?.set(nextWatering, forKey: "nextWatering")
        }
        
        if let nextWateringPlant = data["nextWateringPlant"] as? String {
            defaults?.set(nextWateringPlant, forKey: "nextWateringPlant")
        }
        
        if let hasOverdue = data["hasOverdue"] as? Bool {
            defaults?.set(hasOverdue, forKey: "hasOverdue")
        }
        
        defaults?.synchronize()
        
        // Reload widgets
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadTimelines(ofKind: "MyGardenWidget")
        }
    }
    
    @objc
    func reloadWidgets() {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
    
    @objc
    func isWidgetAdded(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.getCurrentConfigurations { result in
                switch result {
                case .success(let widgets):
                    let hasWidget = widgets.contains { widget in
                        widget.kind == "MyGardenWidget"
                    }
                    resolve(hasWidget)
                case .failure(let error):
                    reject("WIDGET_ERROR", error.localizedDescription, error)
                }
            }
        } else {
            resolve(false)
        }
    }
}
