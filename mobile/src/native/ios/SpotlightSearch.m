#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SpotlightSearch, NSObject)

RCT_EXTERN_METHOD(indexItem:(NSDictionary *)itemData 
                  resolver:(RCTPromiseResolveBlock)resolve 
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(removeItem:(NSString *)identifier 
                  resolver:(RCTPromiseResolveBlock)resolve 
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(removeItems:(NSArray<NSString *> *)identifiers 
                  resolver:(RCTPromiseResolveBlock)resolve 
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(clearIndex:(RCTPromiseResolveBlock)resolve 
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(clearDomain:(NSString *)domainIdentifier 
                  resolver:(RCTPromiseResolveBlock)resolve 
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getIndexedItems:(RCTPromiseResolveBlock)resolve 
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isIndexingAvailable:(RCTPromiseResolveBlock)resolve 
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(handleUserActivity:(NSDictionary *)userActivity 
                  resolver:(RCTPromiseResolveBlock)resolve 
                  rejecter:(RCTPromiseRejectBlock)reject)

@end