#import <React/RCTBridgeModule.h>

@interface SniffModule : NSObject <RCTBridgeModule>
  RCT_EXPORT_METHOD(sniff:(NSString *)url rule:(NSString *)rule timeout:(double)timeout resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject);
@end
