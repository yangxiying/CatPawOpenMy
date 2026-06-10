#import <React/RCTBridgeModule.h>
#import <React/RCTViewManager.h>
#import <React/RCTEventEmitter.h>

// ═══════ MPV Player ═══════

@interface RCT_EXTERN_MODULE(MPVPlayerModule, NSObject)
RCT_EXTERN_METHOD(play:(NSString *)uri headers:(NSDictionary *)headers)
RCT_EXTERN_METHOD(seek:(double)position)
RCT_EXTERN_METHOD(setRate:(float)rate)
RCT_EXTERN_METHOD(stop:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end

@interface RCT_EXTERN_MODULE(MPVPlayerViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(onLoadStart, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onLoaded, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onProgress, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onError, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onStopped, RCTBubblingEventBlock)
@end

// ═══════ MDK Player ═══════

@interface RCT_EXTERN_MODULE(MDKPlayerModule, NSObject)
RCT_EXTERN_METHOD(play:(NSString *)uri headers:(NSDictionary *)headers)
RCT_EXTERN_METHOD(seek:(double)position)
RCT_EXTERN_METHOD(setRate:(float)rate)
RCT_EXTERN_METHOD(stop:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end

@interface RCT_EXTERN_MODULE(MDKPlayerViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(onLoadStart, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onLoaded, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onProgress, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onError, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onStopped, RCTBubblingEventBlock)
@end
