#import "DLNACasting.h"
#import <UIKit/UIKit.h>
#import <React/RCTLog.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>

#pragma mark - DLNADevice

@interface DLNADevice : NSObject
@property (nonatomic, strong) NSString *deviceId;     // UDN
@property (nonatomic, strong) NSString *name;          // friendlyName
@property (nonatomic, strong) NSString *iconURL;
@property (nonatomic, strong) NSURL *locationURL;      // description.xml URL
@property (nonatomic, strong) NSURL *avTransportControlURL;
@property (nonatomic, strong) NSURL *renderingControlURL;
@property (nonatomic, strong) NSURL *connectionManagerURL;
@end

@implementation DLNADevice
@end

#pragma mark - DLNACasting

@interface DLNACasting ()
@property (nonatomic) int udpSocket;
@property (nonatomic, strong) NSMutableDictionary<NSString *, DLNADevice *> *devices;
@property (nonatomic) BOOL discovering;
@property (nonatomic, strong) dispatch_source_t udpSource;
@end

@implementation DLNACasting

RCT_EXPORT_MODULE();

- (instancetype)init {
  self = [super init];
  if (self) {
    _devices = [NSMutableDictionary dictionary];
    _udpSocket = -1;
  }
  return self;
}

- (void)dealloc {
  [self closeSocket];
}

- (NSArray<NSString *> *)supportedEvents {
  return @[@"onDeviceFound", @"onDeviceLost", @"onCastStatus"];
}

// ── SSDP 发现 ──

RCT_EXPORT_METHOD(startDiscovery) {
  if (self.discovering) return;
  self.discovering = YES;

  [self closeSocket];

  // 创建 UDP socket
  int fd = socket(AF_INET, SOCK_DGRAM, 0);
  if (fd < 0) {
    RCTLogError(@"[DLNA] socket() failed: %d", errno);
    self.discovering = NO;
    return;
  }

  // SO_REUSEADDR
  int on = 1;
  setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &on, sizeof(on));

  // 绑定随机端口
  struct sockaddr_in bindAddr;
  memset(&bindAddr, 0, sizeof(bindAddr));
  bindAddr.sin_family = AF_INET;
  bindAddr.sin_port = htons(0);
  bindAddr.sin_addr.s_addr = INADDR_ANY;
  if (bind(fd, (struct sockaddr *)&bindAddr, sizeof(bindAddr)) < 0) {
    RCTLogError(@"[DLNA] bind() failed: %d", errno);
    close(fd);
    self.discovering = NO;
    return;
  }

  // 加入 SSDP 多播组
  struct ip_mreq mreq;
  memset(&mreq, 0, sizeof(mreq));
  mreq.imr_multiaddr.s_addr = inet_addr("239.255.255.250");
  mreq.imr_interface.s_addr = htonl(INADDR_ANY);
  if (setsockopt(fd, IPPROTO_IP, IP_ADD_MEMBERSHIP, &mreq, sizeof(mreq)) < 0) {
    RCTLogError(@"[DLNA] IP_ADD_MEMBERSHIP failed: %d", errno);
    close(fd);
    self.discovering = NO;
    return;
  }

  _udpSocket = fd;

  // 设置接收超时（dispatch source 循环）
  [self startReceiving];

  // 发送 M-SEARCH
  NSString *search = @"M-SEARCH * HTTP/1.1\r\n"
    "HOST: 239.255.255.250:1900\r\n"
    "ST: urn:schemas-upnp-org:device:MediaRenderer:1\r\n"
    "MX: 3\r\n"
    "MAN: \"ssdp:discover\"\r\n"
    "USER-AGENT: iOS UPnP/1.1 CatPawOpenMy\r\n\r\n";
  NSData *data = [search dataUsingEncoding:NSUTF8StringEncoding];

  struct sockaddr_in destAddr;
  memset(&destAddr, 0, sizeof(destAddr));
  destAddr.sin_family = AF_INET;
  destAddr.sin_port = htons(1900);
  inet_aton("239.255.255.250", &destAddr.sin_addr);

  sendto(fd, data.bytes, data.length, 0,
         (struct sockaddr *)&destAddr, sizeof(destAddr));

  // 5 秒后停止发现阶段（不停止 socket，持续接收设备通知）
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    self.discovering = NO;
  });
}

RCT_EXPORT_METHOD(stopDiscovery) {
  self.discovering = NO;
  [self closeSocket];
}

- (void)closeSocket {
  if (_udpSocket >= 0) {
    // 离开多播组
    struct ip_mreq mreq;
    memset(&mreq, 0, sizeof(mreq));
    mreq.imr_multiaddr.s_addr = inet_addr("239.255.255.250");
    mreq.imr_interface.s_addr = htonl(INADDR_ANY);
    setsockopt(_udpSocket, IPPROTO_IP, IP_DROP_MEMBERSHIP, &mreq, sizeof(mreq));

    if (_udpSource) {
      dispatch_source_cancel(_udpSource);
      _udpSource = nil;
    }
    close(_udpSocket);
    _udpSocket = -1;
  }
}

- (void)startReceiving {
  if (_udpSocket < 0) return;

  _udpSource = dispatch_source_create(DISPATCH_SOURCE_TYPE_READ, _udpSocket, 0,
                                       dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0));

  __weak typeof(self) weakSelf = self;
  dispatch_source_set_event_handler(_udpSource, ^{
    typeof(self) strongSelf = weakSelf;
    if (!strongSelf) return;

    char buffer[4096];
    struct sockaddr_in fromAddr;
    socklen_t fromLen = sizeof(fromAddr);
    ssize_t n = recvfrom(strongSelf.udpSocket, buffer, sizeof(buffer) - 1, 0,
                         (struct sockaddr *)&fromAddr, &fromLen);
    if (n <= 0) return;
    buffer[n] = '\0';

    NSString *response = [NSString stringWithUTF8String:buffer];
    if (!response) return;

    [strongSelf handleSSDPResponse:response];
  });

  dispatch_source_set_cancel_handler(_udpSource, ^{
    // clean close done in closeSocket
  });

  dispatch_resume(_udpSource);
}

// ── SSDP 响应解析 ──

- (void)handleSSDPResponse:(NSString *)response {
  // 解析 Location header
  NSError *error = nil;
  NSRegularExpression *locRegex = [NSRegularExpression regularExpressionWithPattern:@"Location:[ ]*(.*)" options:NSRegularExpressionCaseInsensitive error:&error];
  NSTextCheckingResult *match = [locRegex firstMatchInString:response options:0 range:NSMakeRange(0, response.length)];
  if (!match) return;

  NSString *locStr = [response substringWithRange:[match rangeAtIndex:1]];
  locStr = [locStr stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  NSURL *locURL = [NSURL URLWithString:locStr];
  if (!locURL) return;

  // 下载 device description XML
  NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithURL:locURL completionHandler:^(NSData *data, NSURLResponse *res, NSError *err) {
    if (!data || err) return;
    NSString *xml = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    [self parseDeviceXML:xml locationURL:locURL];
  }];
  [task resume];
}

- (void)parseDeviceXML:(NSString *)xml locationURL:(NSURL *)locationURL {
  NSString *udn = [self extractXMLTag:xml tag:@"UDN"];
  NSString *friendlyName = [self extractXMLTag:xml tag:@"friendlyName"];

  if (!udn) return;
  if (self.devices[udn]) return; // 已发现

  DLNADevice *device = [[DLNADevice alloc] init];
  device.deviceId = udn;
  device.name = friendlyName ?: @"Unknown DLNA Device";
  device.locationURL = locationURL;

  // 查找 AVTransport service 的 controlURL
  NSString *avControlURL = [self extractServiceControlURL:xml serviceType:@"urn:schemas-upnp-org:service:AVTransport:1"];
  if (avControlURL) {
    device.avTransportControlURL = [NSURL URLWithString:avControlURL relativeToURL:locationURL];
  }

  self.devices[udn] = device;
  dispatch_async(dispatch_get_main_queue(), ^{
    [self sendEventWithName:@"onDeviceFound" body:@{
      @"id": device.deviceId,
      @"name": device.name,
      @"icon": device.iconURL ?: @"",
    }];
  });
}

- (NSString *)extractXMLTag:(NSString *)xml tag:(NSString *)tag {
  NSString *openTag = [NSString stringWithFormat:@"<%@>", tag];
  NSString *closeTag = [NSString stringWithFormat:@"</%@>", tag];
  NSRange openRange = [xml rangeOfString:openTag];
  if (openRange.location == NSNotFound) return nil;
  NSRange closeRange = [xml rangeOfString:closeTag options:0 range:NSMakeRange(openRange.location + openRange.length, xml.length - openRange.location - openRange.length)];
  if (closeRange.location == NSNotFound) return nil;
  return [xml substringWithRange:NSMakeRange(openRange.location + openRange.length, closeRange.location - openRange.location - openRange.length)];
}

- (NSString *)extractServiceControlURL:(NSString *)xml serviceType:(NSString *)serviceType {
  // 在 <service> 块内匹配 serviceType + controlURL
  NSString *pattern = [NSString stringWithFormat:@"<serviceType>%@</serviceType>.*?<controlURL>(.*?)</controlURL>", serviceType];
  NSError *error = nil;
  NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:pattern options:NSRegularExpressionDotMatchesLineSeparators error:&error];
  NSTextCheckingResult *match = [regex firstMatchInString:xml options:0 range:NSMakeRange(0, xml.length)];
  if (!match) return nil;
  NSString *controlURL = [xml substringWithRange:[match rangeAtIndex:1]];
  return controlURL;
}

// ── SOAP 控制 ──

RCT_EXPORT_METHOD(cast:(NSString *)url deviceId:(NSString *)deviceId) {
  DLNADevice *device = self.devices[deviceId];
  if (!device || !device.avTransportControlURL) {
    [self sendEventWithName:@"onCastStatus" body:@{@"deviceId": deviceId, @"status": @"error"}];
    return;
  }

  [self sendEventWithName:@"onCastStatus" body:@{@"deviceId": deviceId, @"status": @"connecting"}];

  // SetAVTransportURI SOAP request
  NSString *soapBody = [NSString stringWithFormat:
    @"<?xml version=\"1.0\" encoding=\"utf-8\"?>"
    @"<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\""
    @" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">"
    @"  <s:Body>"
    @"    <u:SetAVTransportURI xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">"
    @"      <InstanceID>0</InstanceID>"
    @"      <CurrentURI>%@</CurrentURI>"
    @"      <CurrentURIMetaData></CurrentURIMetaData>"
    @"    </u:SetAVTransportURI>"
    @"  </s:Body>"
    @"</s:Envelope>", url];

  NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:device.avTransportControlURL];
  req.HTTPMethod = @"POST";
  req.HTTPBody = [soapBody dataUsingEncoding:NSUTF8StringEncoding];
  [req setValue:@"text/xml; charset=\"utf-8\"" forHTTPHeaderField:@"Content-Type"];
  [req setValue:@"\"urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI\"" forHTTPHeaderField:@"SOAPAction"];

  [[[NSURLSession sharedSession] dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *res, NSError *error) {
    if (error) {
      dispatch_async(dispatch_get_main_queue(), ^{
        [self sendEventWithName:@"onCastStatus" body:@{@"deviceId": deviceId, @"status": @"error", @"error": error.localizedDescription}];
      });
      return;
    }
    // SetURI 成功后自动发送 Play
    [self sendPlayToDevice:device deviceId:deviceId];
  }] resume];
}

- (void)sendPlayToDevice:(DLNADevice *)device deviceId:(NSString *)deviceId {
  NSString *playBody =
    @"<?xml version=\"1.0\" encoding=\"utf-8\"?>"
    @"<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\""
    @" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">"
    @"  <s:Body>"
    @"    <u:Play xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">"
    @"      <InstanceID>0</InstanceID>"
    @"      <Speed>1</Speed>"
    @"    </u:Play>"
    @"  </s:Body>"
    @"</s:Envelope>";

  NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:device.avTransportControlURL];
  req.HTTPMethod = @"POST";
  req.HTTPBody = [playBody dataUsingEncoding:NSUTF8StringEncoding];
  [req setValue:@"text/xml; charset=\"utf-8\"" forHTTPHeaderField:@"Content-Type"];
  [req setValue:@"\"urn:schemas-upnp-org:service:AVTransport:1#Play\"" forHTTPHeaderField:@"SOAPAction"];

  [[[NSURLSession sharedSession] dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *res, NSError *error) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (!error) {
        [self sendEventWithName:@"onCastStatus" body:@{@"deviceId": deviceId, @"status": @"playing"}];
      } else {
        [self sendEventWithName:@"onCastStatus" body:@{@"deviceId": deviceId, @"status": @"error", @"error": error.localizedDescription}];
      }
    });
  }] resume];
}

RCT_EXPORT_METHOD(stop:(NSString *)deviceId) {
  DLNADevice *device = self.devices[deviceId];
  if (!device || !device.avTransportControlURL) return;

  NSString *stopBody =
    @"<?xml version=\"1.0\" encoding=\"utf-8\"?>"
    @"<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\""
    @" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">"
    @"  <s:Body>"
    @"    <u:Stop xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">"
    @"      <InstanceID>0</InstanceID>"
    @"    </u:Stop>"
    @"  </s:Body>"
    @"</s:Envelope>";

  NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:device.avTransportControlURL];
  req.HTTPMethod = @"POST";
  req.HTTPBody = [stopBody dataUsingEncoding:NSUTF8StringEncoding];
  [req setValue:@"text/xml; charset=\"utf-8\"" forHTTPHeaderField:@"Content-Type"];
  [req setValue:@"\"urn:schemas-upnp-org:service:AVTransport:1#Stop\"" forHTTPHeaderField:@"SOAPAction"];

  [[[NSURLSession sharedSession] dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *res, NSError *error) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [self sendEventWithName:@"onCastStatus" body:@{@"deviceId": deviceId, @"status": @"stopped"}];
    });
  }] resume];
}

@end
