#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface DLNACasting : RCTEventEmitter <RCTBridgeModule>
  RCT_EXPORT_METHOD(startDiscovery);
  RCT_EXPORT_METHOD(stopDiscovery);
  RCT_EXPORT_METHOD(cast:(NSString *)url deviceId:(NSString *)deviceId);
  RCT_EXPORT_METHOD(stop:(NSString *)deviceId);
  // Events: onDeviceFound, onDeviceLost, onCastStatus
@end
