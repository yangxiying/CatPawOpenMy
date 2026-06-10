import Foundation
import AVKit
import React

@objc(MDKPlayerModule)
class MDKPlayerModule: NSObject {

    private var player: AVPlayer?
    private var playerLayer: AVPlayerLayer?
    private var timeObserver: Any?

    @objc static func requiresMainQueueSetup() -> Bool { return false }

    @objc func play(_ uri: String, headers: [String: String]?) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.stop(nil)

            guard let urlObj = URL(string: uri) else {
                self.sendEvent("error", body: ["error": "Invalid URL"])
                return
            }

            var asset: AVURLAsset
            if let headers = headers, !headers.isEmpty {
                asset = AVURLAsset(url: urlObj, options: ["AVURLAssetHTTPHeaderFieldsKey": headers])
            } else {
                asset = AVURLAsset(url: urlObj)
            }

            let playerItem = AVPlayerItem(asset: asset)
            self.player = AVPlayer(playerItem: playerItem)
            playerItem.addObserver(self, forKeyPath: "status", options: [.new], context: nil)
            playerItem.addObserver(self, forKeyPath: "error", options: [.new], context: nil)

            let interval = CMTime(seconds: 0.5, preferredTimescale: 600)
            self.timeObserver = self.player?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
                let pos = CMTimeGetSeconds(time)
                let dur = CMTimeGetSeconds(playerItem.duration)
                self?.sendEvent("progress", body: ["currentTime": pos, "duration": dur.isNaN ? 0 : dur])
            }

            self.player?.play()
            self.sendEvent("loadStart", body: [:])
        }
    }

    @objc func seek(_ position: Double) {
        DispatchQueue.main.async {
            guard let player = self.player else { return }
            player.seek(to: CMTime(seconds: position, preferredTimescale: 600))
        }
    }

    @objc func setRate(_ rate: Float) {
        DispatchQueue.main.async { self.player?.rate = rate }
    }

    @objc func stop(_ resolve: RCTPromiseResolveBlock?) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if let obs = self.timeObserver {
                self.player?.removeTimeObserver(obs)
                self.timeObserver = nil
            }
            self.player?.pause()
            self.player = nil
            self.sendEvent("stopped", body: [:])
            resolve?(nil)
        }
    }

    @objc override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey: Any]?, context: UnsafeMutableRawPointer?) {
        guard let item = object as? AVPlayerItem else { return }
        if keyPath == "status" {
            switch item.status {
            case .readyToPlay:
                let dur = CMTimeGetSeconds(item.duration)
                sendEvent("loaded", body: ["duration": dur.isNaN ? 0 : dur])
            case .failed:
                sendEvent("error", body: ["error": item.error?.localizedDescription ?? "Unknown"])
            default: break
            }
        }
    }

    private func sendEvent(_ name: String, body: [String: Any]) {
        DispatchQueue.main.async {
            NotificationCenter.default.post(
                name: Notification.Name("MDKPlayerEvent"),
                object: nil,
                userInfo: ["event": name, "data": body]
            )
        }
    }
}
