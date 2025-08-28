#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ShortcutsManager, NSObject)

RCT_EXTERN_METHOD(donateShortcut:(NSDictionary *)shortcutData 
                  resolver:(RCTPromiseResolveBlock)resolve 
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(donateInteraction:(NSDictionary *)interactionData 
                  resolver:(RCTPromiseResolveBlock)resolve 
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(handleIntent:(NSDictionary *)intentData 
                  resolver:(RCTPromiseResolveBlock)resolve 
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getAvailableShortcuts:(RCTPromiseResolveBlock)resolve 
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(deleteAllDonatedShortcuts:(RCTPromiseResolveBlock)resolve 
                  rejecter:(RCTPromiseRejectBlock)reject)

@end