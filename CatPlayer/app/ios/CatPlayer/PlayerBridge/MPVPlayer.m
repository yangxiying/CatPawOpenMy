#import "MPVPlayer.h"
#import <mpv/client.h>
#import <React/RCTLog.h>

@interface MPVPlayer ()
@property (nonatomic, strong) dispatch_queue_t mpvQueue;
@property (nonatomic) mpv_handle *mpv;
@property (nonatomic, strong) NSTimer *progressTimer;
@end

@implementation MPVPlayer

RCT_EXPORT_MODULE();

- (NSArray<NSString *> *)supportedEvents {
  return @[@"onProgress", @"onError", @"onLoad", @"onEnd"];
}

- (instancetype)init {
  self = [super init];
  if (self) {
    _mpvQueue = dispatch_queue_create("com.catplayer.mpv", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

- (void)dealloc {
  [self.progressTimer invalidate];
  if (_mpv) {
    mpv_terminate_destroy(_mpv);
    _mpv = NULL;
  }
}

- (void)initMPV {
  if (_mpv) return;

  _mpv = mpv_create();
  if (!_mpv) {
    [self sendEventWithName:@"onError" body:@{@"message": @"mpv_create failed"}];
    return;
  }

  // 配置 mpv 选项
  mpv_set_option_string(_mpv, "vo", "libmpv");
  mpv_set_option_string(_mpv, "hwdec", "videotoolbox-copy");
  mpv_set_option_string(_mpv, "keep-open", "no");
  mpv_set_option_string(_mpv, "audio-file-auto", "no");
  mpv_set_option_string(_mpv, "sub-auto", "no");
  mpv_set_option_string(_mpv, "cache", "yes");
  mpv_set_option_string(_mpv, "cache-secs", "120");

  if (mpv_initialize(_mpv) < 0) {
    [self sendEventWithName:@"onError" body:@{@"message": @"mpv_initialize failed"}];
    mpv_terminate_destroy(_mpv);
    _mpv = NULL;
    return;
  }

  // 启动事件监听循环
  dispatch_async(_mpvQueue, ^{
    [self eventLoop];
  });
  // 进度定时器
  _progressTimer = [NSTimer scheduledTimerWithTimeInterval:0.5 repeats:YES block:^(NSTimer *t) {
    [self reportProgress];
  }];
}

- (void)eventLoop {
  while (_mpv) {
    mpv_event *event = mpv_wait_event(_mpv, 0.1);
    if (event->event_id == MPV_EVENT_FILE_LOADED) {
      double duration = 0;
      mpv_get_property(_mpv, "duration", MPV_FORMAT_DOUBLE, &duration);
      dispatch_async(dispatch_get_main_queue(), ^{
        [self sendEventWithName:@"onLoad" body:@{@"duration": @(duration)}];
      });
    } else if (event->event_id == MPV_EVENT_END_FILE) {
      dispatch_async(dispatch_get_main_queue(), ^{
        [self sendEventWithName:@"onEnd" body:@{}];
      });
    }
  }
}

- (void)reportProgress {
  if (!_mpv) return;
  double position = 0, duration = 0;
  mpv_get_property(_mpv, "time-pos", MPV_FORMAT_DOUBLE, &position);
  mpv_get_property(_mpv, "duration", MPV_FORMAT_DOUBLE, &duration);
  dispatch_async(dispatch_get_main_queue(), ^{
    [self sendEventWithName:@"onProgress" body:@{@"position": @(position), @"duration": @(duration)}];
  });
}

RCT_EXPORT_METHOD(play:(NSString *)url headers:(NSDictionary *)headers) {
  dispatch_async(_mpvQueue, ^{
    [self initMPV];
    if (!_mpv) return;

    // 构建 mpv loadfile 命令 — headers 通过 --http-header-fields 传递
    NSString *cmd = [NSString stringWithFormat:@"loadfile \"%@\" replace", url];
    if (headers.count > 0) {
      NSMutableString *headerStr = [NSMutableString string];
      [headers enumerateKeysAndObjectsUsingBlock:^(NSString *key, NSString *val, BOOL *stop) {
        [headerStr appendFormat:@"%@: %@\\r\\n", key, val];
      }];
      NSString *opt = [NSString stringWithFormat:@"--http-header-fields=%@", headerStr];
      mpv_set_option_string(_mpv, "http-header-fields", [headerStr UTF8String]);
    }

    const char *args[] = {"loadfile", [url UTF8String], "replace", NULL};
    mpv_command(_mpv, args);
  });
}

RCT_EXPORT_METHOD(pause) {
  dispatch_async(_mpvQueue, ^{
    if (!_mpv) return;
    const char *args[] = {"set", "pause", "yes", NULL};
    mpv_command(_mpv, args);
  });
}

RCT_EXPORT_METHOD(resume) {
  dispatch_async(_mpvQueue, ^{
    if (!_mpv) return;
    const char *args[] = {"set", "pause", "no", NULL};
    mpv_command(_mpv, args);
  });
}

RCT_EXPORT_METHOD(seek:(double)position) {
  dispatch_async(_mpvQueue, ^{
    if (!_mpv) return;
    NSString *pos = [NSString stringWithFormat:@"%f", position];
    const char *args[] = {"seek", [pos UTF8String], "absolute", NULL};
    mpv_command(_mpv, args);
  });
}

RCT_EXPORT_METHOD(setRate:(float)rate) {
  dispatch_async(_mpvQueue, ^{
    if (!_mpv) return;
    NSString *speed = [NSString stringWithFormat:@"%f", rate];
    const char *args[] = {"set", "speed", [speed UTF8String], NULL};
    mpv_command(_mpv, args);
  });
}

RCT_EXPORT_METHOD(setQuality:(int)index) {
  // mpv 自动处理清晰度切换（通过 playlist 或 demuxer-level 切换）
  // 由上层在调用 play 前选择 quality URL
  RCTLogInfo(@"[MPVPlayer] setQuality %d (delegated to URL selection)", index);
}

- (void)presentFullscreen { /* mpv native window fullscreen */ }
- (void)dismissFullscreen { /* exit fullscreen */ }

@end
