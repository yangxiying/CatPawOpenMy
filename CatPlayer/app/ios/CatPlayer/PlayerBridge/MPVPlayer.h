#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface MPVPlayer : RCTEventEmitter <RCTBridgeModule>
  RCT_EXPORT_METHOD(play:(NSString *)url headers:(NSDictionary *)headers);
  RCT_EXPORT_METHOD(pause);
  RCT_EXPORT_METHOD(resume);
  RCT_EXPORT_METHOD(seek:(double)position);
  RCT_EXPORT_METHOD(setRate:(float)rate);
  RCT_EXPORT_METHOD(setQuality:(int)index);
  RCT_EXPORT_METHOD(presentFullscreen);
  RCT_EXPORT_METHOD(dismissFullscreen);
@end
