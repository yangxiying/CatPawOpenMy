#import "SniffModule.h"
#import <WebKit/WebKit.h>
#import <React/RCTLog.h>

// ============================================================
// WKScriptMessageHandler 专用委托类（避免 self 作为 handler）
// ============================================================
@interface _SniffScriptHandler : NSObject <WKScriptMessageHandler>
@property (nonatomic, copy) void (^onFound)(WKScriptMessage *);
@end

@implementation _SniffScriptHandler
- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message {
  if (self.onFound) self.onFound(message);
}
@end

// ============================================================
// SniffModule 实现
// ============================================================
@implementation SniffModule

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(sniff:(NSString *)url
                  rule:(NSString *)rule
                  timeout:(double)timeout
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {

  dispatch_async(dispatch_get_main_queue(), ^{
    // 1. 构造嗅探 JS 脚本
    NSString *escapedRule = [rule stringByReplacingOccurrencesOfString:@"\\" withString:@"\\\\"];
    escapedRule = [escapedRule stringByReplacingOccurrencesOfString:@"'" withString:@"\\'"];
    NSString *js = [NSString stringWithFormat:
      @"(function(){"
      @"  try {"
      @"    var re = new RegExp('%@');"
      @"    var iv = setInterval(function(){"
      @"      var t = document.body ? document.body.innerText : '';"
      @"      var m = t.match(re);"
      @"      if(m && m[0]){ clearInterval(iv); window.webkit.messageHandlers.sniffFound.postMessage(m[0]); }"
      @"    },300);"
      @"    setTimeout(function(){ clearInterval(iv); }, %d);"
      @"  }catch(e){}"
      @"})();", escapedRule, (int)(timeout * 1000)];

    WKUserScript *script = [[WKUserScript alloc] initWithSource:js
                                                  injectionTime:WKUserScriptInjectionTimeAtDocumentEnd
                                               forMainFrameOnly:YES];

    // 2. 配置 WebView
    WKUserContentController *controller = [[WKUserContentController alloc] init];
    [controller addUserScript:script];

    WKWebViewConfiguration *cfg = [[WKWebViewConfiguration alloc] init];
    cfg.userContentController = controller;

    // 隐藏 WebView（1x1，加载后仍能渲染 DOM）
    WKWebView *wv = [[WKWebView alloc] initWithFrame:CGRectMake(0, 0, 1, 1) configuration:cfg];
    wv.alpha = 0.01;

    // 添加到 key window（WKWebView 需要加入视图层级才能渲染）
    UIWindow *keyWindow = nil;
    if (@available(iOS 13.0, *)) {
      keyWindow = [UIApplication sharedApplication].keyWindow;
      if (!keyWindow) {
        keyWindow = [UIApplication sharedApplication].windows.firstObject;
      }
    } else {
      keyWindow = [UIApplication sharedApplication].keyWindow;
    }
    [keyWindow addSubview:wv];

    __block BOOL resolved = NO;
    __weak WKWebView *weakWv = wv;

    // 3. 注册嗅探回调
    _SniffScriptHandler *handler = [[_SniffScriptHandler alloc] init];
    handler.onFound = ^(WKScriptMessage *msg) {
      if (resolved) return;
      resolved = YES;
      NSString *foundUrl = msg.body;

      // 提取 User-Agent（通过 JS eval）
      [weakWv evaluateJavaScript:@"navigator.userAgent" completionHandler:^(id uaResult, NSError *err) {
        NSString *userAgent = @"";
        if ([uaResult isKindOfClass:[NSString class]]) userAgent = (NSString *)uaResult;

        // 提取 Cookies
        [weakWv.configuration.websiteDataStore.httpCookieStore getAllCookies:^(NSArray<NSHTTPCookie *> *cookies) {
          NSMutableDictionary *headers = [NSMutableDictionary dictionary];
          if (userAgent.length > 0) headers[@"User-Agent"] = userAgent;

          NSMutableArray *cookieParts = [NSMutableArray array];
          for (NSHTTPCookie *c in cookies) {
            [cookieParts addObject:[NSString stringWithFormat:@"%@=%@", c.name, c.value]];
          }
          if (cookieParts.count > 0) {
            headers[@"Cookie"] = [cookieParts componentsJoinedByString:@"; "];
          }

          resolve(@{@"url": foundUrl, @"headers": [headers copy]});

          [wv removeFromSuperview];
          [controller removeScriptMessageHandlerForName:@"sniffFound"];
        }];
      }];
    };
    [controller addScriptMessageHandler:handler name:@"sniffFound"];

    // 4. 超时处理
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(timeout * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
      if (!resolved) {
        resolved = YES;
        resolve(nil);
        [wv removeFromSuperview];
        [controller removeScriptMessageHandlerForName:@"sniffFound"];
      }
    });

    // 5. 发起请求
    NSURLRequest *req = [NSURLRequest requestWithURL:[NSURL URLWithString:url]
                                         cachePolicy:NSURLRequestReloadIgnoringLocalCacheData
                                     timeoutInterval:timeout];
    [wv loadRequest:req];
  });
}

@end
