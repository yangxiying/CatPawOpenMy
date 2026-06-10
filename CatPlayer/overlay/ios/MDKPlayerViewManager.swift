import Foundation
import AVKit
import React

@objc(MDKPlayerViewManager)
class MDKPlayerViewManager: NSObject {

    @objc static func requiresMainQueueSetup() -> Bool { return false }

    @objc func view() -> UIView {
        return MDKPlayerView()
    }

    @objc func play(_ view: UIView, uri: String, headers: [String: String]?) {
        guard let playerView = view as? MDKPlayerView else { return }
        playerView.play(uri: uri, headers: headers)
    }

    @objc func seek(_ view: UIView, position: Double) {
        guard let playerView = view as? MDKPlayerView else { return }
        playerView.seek(to: position)
    }

    @objc func setRate(_ view: UIView, rate: Float) {
        guard let playerView = view as? MDKPlayerView else { return }
        playerView.setRate(rate)
    }

    @objc func stop(_ view: UIView) {
        guard let playerView = view as? MDKPlayerView else { return }
        playerView.stop()
    }
}

class MDKPlayerView: UIView {
    private var player: AVPlayer?
    private var playerLayer: AVPlayerLayer?
    private var timeObserver: Any?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .black
    }

    required init?(coder: NSCoder) { fatalError() }

    override func layoutSubviews() {
        super.layoutSubviews()
        playerLayer?.frame = bounds
    }

    func play(uri: String, headers: [String: String]?) {
        stop()
        guard let url = URL(string: uri) else { return }

        let asset: AVURLAsset
        if let h = headers, !h.isEmpty {
            asset = AVURLAsset(url: url, options: ["AVURLAssetHTTPHeaderFieldsKey": h])
        } else {
            asset = AVURLAsset(url: url)
        }

        let item = AVPlayerItem(asset: asset)
        player = AVPlayer(playerItem: item)

        playerLayer = AVPlayerLayer(player: player)
        playerLayer?.videoGravity = .resizeAspect
        layer.addSublayer(playerLayer!)
        playerLayer?.frame = bounds

        item.addObserver(self, forKeyPath: "status", options: .new, context: nil)

        let interval = CMTime(seconds: 0.5, preferredTimescale: 600)
        timeObserver = player?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            guard let self = self else { return }
            let pos = CMTimeGetSeconds(time)
            let dur = CMTimeGetSeconds(item.duration)
            self.emitEvent("progress", data: ["currentTime": pos, "duration": dur.isNaN ? 0 : dur])
        }

        player?.play()
    }

    func seek(to seconds: Double) {
        player?.seek(to: CMTime(seconds: seconds, preferredTimescale: 600))
    }

    func setRate(_ rate: Float) {
        player?.rate = rate
    }

    func stop() {
        if let obs = timeObserver {
            player?.removeTimeObserver(obs)
            timeObserver = nil
        }
        player?.pause()
        playerLayer?.removeFromSuperlayer()
        playerLayer = nil
        player = nil
    }

    override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey: Any]?, context: UnsafeMutableRawPointer?) {
        guard let item = object as? AVPlayerItem else { return }
        if keyPath == "status" {
            switch item.status {
            case .readyToPlay:
                let dur = CMTimeGetSeconds(item.duration)
                emitEvent("loaded", data: ["duration": dur.isNaN ? 0 : dur])
            case .failed:
                emitEvent("error", data: ["error": item.error?.localizedDescription ?? "Unknown"])
            default: break
            }
        }
    }

    private func emitEvent(_ name: String, data: [String: Any]) {
        DispatchQueue.main.async {
            NotificationCenter.default.post(
                name: Notification.Name("MDKPlayerEvent"),
                object: nil,
                userInfo: ["event": name, "data": data, "viewId": self.reactTag() ?? 0]
            )
        }
    }

    private func reactTag() -> NSNumber? {
        return self.value(forKey: "reactTag") as? NSNumber
    }
}
