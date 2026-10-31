// macOS 15+ ScreenCaptureKit recorder for externally orchestrated marketing takes.
// Compile with: xcrun swiftc -parse-as-library -O -target arm64-apple-macosx15.0
//   -module-cache-path .experiments/marketing/swift-module-cache
//   tools/marketing/record-window.swift -o .experiments/marketing/record-window
import AVFoundation
import CoreGraphics
import CoreMedia
import Darwin
import Foundation
import ScreenCaptureKit

private func emit(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]) else { return }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([10]))
}

private struct RecorderError: LocalizedError {
    let code: String
    let message: String
    var errorDescription: String? { message }
}

private struct Options {
    var help = false
    var checkPermission = false
    var listWindows = false
    var windowID: CGWindowID?
    var output: String?
    var seconds = 15.0
    var fps: Int32 = 60
    var width = 1920
    var height = 1080
    var audio = false
    var crop: CGRect?

    init(_ arguments: [String]) throws {
        var index = 0
        func value(_ flag: String) throws -> String {
            index += 1
            guard index < arguments.count else {
                throw RecorderError(code: "invalid_arguments", message: "Missing value for \(flag)")
            }
            return arguments[index]
        }
        while index < arguments.count {
            let flag = arguments[index]
            switch flag {
            case "--help", "-h": help = true
            case "--check-permission": checkPermission = true
            case "--list-windows": listWindows = true
            case "--audio": audio = true
            case "--window":
                guard let parsed = UInt32(try value(flag)), parsed > 0 else {
                    throw RecorderError(code: "invalid_arguments", message: "--window requires a positive window ID")
                }
                windowID = parsed
            case "--output": output = try value(flag)
            case "--seconds":
                guard let parsed = Double(try value(flag)), parsed.isFinite, parsed > 0, parsed <= 3600 else {
                    throw RecorderError(code: "invalid_arguments", message: "--seconds must be greater than 0 and at most 3600")
                }
                seconds = parsed
            case "--fps":
                guard let parsed = Int32(try value(flag)), (1...240).contains(parsed) else {
                    throw RecorderError(code: "invalid_arguments", message: "--fps must be an integer from 1 to 240")
                }
                fps = parsed
            case "--width", "--height":
                guard let parsed = Int(try value(flag)), (2...4096).contains(parsed), parsed % 2 == 0 else {
                    throw RecorderError(code: "invalid_arguments", message: "\(flag) must be an even integer from 2 to 4096")
                }
                if flag == "--width" { width = parsed } else { height = parsed }
            case "--crop":
                let components = try value(flag).split(separator: ",", omittingEmptySubsequences: false)
                let values = components.compactMap { Double($0) }
                guard components.count == 4, values.count == 4, values.allSatisfy({ $0.isFinite }),
                      values[0] >= 0, values[1] >= 0, values[2] > 0, values[3] > 0 else {
                    throw RecorderError(code: "invalid_arguments", message: "--crop requires nonnegative x,y and positive width,height in window-local points")
                }
                crop = CGRect(x: values[0], y: values[1], width: values[2], height: values[3])
            default:
                throw RecorderError(code: "invalid_arguments", message: "Unknown argument: \(flag)")
            }
            index += 1
        }
        if !help && !checkPermission && !listWindows {
            guard windowID != nil, let output, output.hasPrefix("/"), URL(fileURLWithPath: output).pathExtension.lowercased() == "mp4" else {
                throw RecorderError(code: "invalid_arguments", message: "Recording requires --window ID and --output /absolute/path.mp4")
            }
        }
    }
}

@available(macOS 15.0, *)
@MainActor
private final class WindowRecorder: NSObject, SCRecordingOutputDelegate, SCStreamDelegate {
    private let options: Options
    private let window: SCWindow
    private var stream: SCStream?
    private var recording: SCRecordingOutput?
    private var completion: CheckedContinuation<Void, Error>?
    private var durationTask: Task<Void, Never>?
    private var watchdog: Task<Void, Never>?
    private var signals: [DispatchSourceSignal] = []
    private var started = false
    private var stopping = false
    private var terminal = false
    private var stopReason = "duration"

    init(options: Options, window: SCWindow) {
        self.options = options
        self.window = window
    }

    func run() async throws {
        let outputURL = URL(fileURLWithPath: options.output!)
        guard !FileManager.default.fileExists(atPath: outputURL.path) else {
            throw RecorderError(code: "output_exists", message: "Refusing to overwrite \(outputURL.path)")
        }
        try FileManager.default.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        if let crop = options.crop, crop.maxX > window.frame.width + 1 || crop.maxY > window.frame.height + 1 {
            throw RecorderError(code: "invalid_crop", message: "Crop extends beyond the selected window's point dimensions")
        }

        let configuration = SCStreamConfiguration()
        configuration.width = options.width
        configuration.height = options.height
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: options.fps)
        configuration.showsCursor = false
        configuration.showMouseClicks = false
        configuration.ignoreShadowsSingleWindow = true
        configuration.includeChildWindows = false
        configuration.scalesToFit = true
        configuration.preservesAspectRatio = true
        configuration.queueDepth = 6
        configuration.captureDynamicRange = .SDR
        configuration.capturesAudio = options.audio
        configuration.captureMicrophone = false
        configuration.excludesCurrentProcessAudio = true
        configuration.sampleRate = 48000
        configuration.channelCount = 2
        if let crop = options.crop { configuration.sourceRect = crop }

        let recordingConfiguration = SCRecordingOutputConfiguration()
        recordingConfiguration.outputURL = outputURL
        recordingConfiguration.videoCodecType = .h264
        recordingConfiguration.outputFileType = .mp4
        guard recordingConfiguration.availableVideoCodecTypes.contains(.h264),
              recordingConfiguration.availableOutputFileTypes.contains(.mp4) else {
            throw RecorderError(code: "unsupported_encoder", message: "H.264 MP4 recording is unavailable on this system")
        }
        let recording = SCRecordingOutput(configuration: recordingConfiguration, delegate: self)
        let filter = SCContentFilter(desktopIndependentWindow: window)
        let stream = SCStream(filter: filter, configuration: configuration, delegate: self)
        try stream.addRecordingOutput(recording)
        self.stream = stream
        self.recording = recording

        try await withCheckedThrowingContinuation { continuation in
            completion = continuation
            installSignals()
            watchdog = Task { [weak self] in
                do { try await Task.sleep(nanoseconds: 20_000_000_000) } catch { return }
                self?.fail(RecorderError(code: "start_timeout", message: "Recording did not start within 20 seconds"))
            }
            Task { [weak self] in
                do { try await stream.startCapture() } catch { self?.fail(error) }
            }
        }
    }

    private func installSignals() {
        for number in [SIGINT, SIGTERM] {
            signal(number, SIG_IGN)
            let source = DispatchSource.makeSignalSource(signal: number, queue: .main)
            source.setEventHandler { [weak self] in
                Task { @MainActor in await self?.stop(reason: "signal:\(number)") }
            }
            source.resume()
            signals.append(source)
        }
    }

    private func didStart() {
        guard !terminal, !started else { return }
        started = true
        watchdog?.cancel()
        emit([
            "event": "started", "windowID": window.windowID, "output": options.output!,
            "seconds": options.seconds, "fpsTarget": options.fps,
            "width": options.width, "height": options.height, "audio": options.audio,
            "microphone": false,
        ])
        durationTask = Task { [weak self] in
            guard let self else { return }
            do { try await Task.sleep(nanoseconds: UInt64(options.seconds * 1_000_000_000)) } catch { return }
            await stop(reason: "duration")
        }
    }

    private func stop(reason: String) async {
        guard !terminal, !stopping else { return }
        stopping = true
        stopReason = reason
        durationTask?.cancel()
        watchdog?.cancel()
        watchdog = Task { [weak self] in
            do { try await Task.sleep(nanoseconds: 20_000_000_000) } catch { return }
            self?.fail(RecorderError(code: "finish_timeout", message: "Recording did not finalize within 20 seconds"))
        }
        do { try await stream?.stopCapture() } catch { fail(error) }
    }

    private func didFinish() {
        guard !terminal else { return }
        guard started, let recording, recording.recordedFileSize > 0 else {
            fail(RecorderError(code: "empty_recording", message: "Recording finished without usable output"))
            return
        }
        terminal = true
        cleanUp()
        let duration = CMTimeGetSeconds(recording.recordedDuration)
        emit([
            "event": "finished", "output": options.output!, "reason": stopReason,
            "seconds": duration.isFinite ? duration : 0, "bytes": recording.recordedFileSize,
        ])
        completion?.resume()
        completion = nil
    }

    private func fail(_ error: Error) {
        guard !terminal else { return }
        terminal = true
        cleanUp()
        Task { try? await stream?.stopCapture() }
        completion?.resume(throwing: error)
        completion = nil
    }

    private func cleanUp() {
        durationTask?.cancel()
        watchdog?.cancel()
        for source in signals { source.cancel() }
        signals.removeAll()
    }

    nonisolated func recordingOutputDidStartRecording(_ recordingOutput: SCRecordingOutput) {
        Task { @MainActor in self.didStart() }
    }

    nonisolated func recordingOutputDidFinishRecording(_ recordingOutput: SCRecordingOutput) {
        Task { @MainActor in self.didFinish() }
    }

    nonisolated func recordingOutput(_ recordingOutput: SCRecordingOutput, didFailWithError error: Error) {
        Task { @MainActor in self.fail(error) }
    }

    nonisolated func stream(_ stream: SCStream, didStopWithError error: Error) {
        Task { @MainActor in self.fail(error) }
    }
}

@available(macOS 15.0, *)
@main
private struct RecordWindow {
    @MainActor static func main() async {
        do {
            let options = try Options(Array(CommandLine.arguments.dropFirst()))
            if options.help {
                print("""
                Usage: record-window --check-permission
                       record-window --list-windows
                       record-window --window ID --output /absolute/take.mp4 [options]

                --seconds N       Duration after recording starts (default 15; maximum 3600)
                --fps N           Target maximum capture rate (default 60)
                --width N         Output pixels, even number (default 1920)
                --height N        Output pixels, even number (default 1080)
                --crop X,Y,W,H    Optional source rectangle in window-local points
                --audio           Include application audio; default is off, microphone is always off
                --check-permission  Report existing screen capture permission without prompting
                --list-windows    List on-screen windows as JSON; requires existing permission

                Emits newline-delimited JSON events: started, finished, error.
                SIGINT/SIGTERM stop recording and finalize the file. Existing files are never overwritten.
                No command requests screen recording permission. macOS 15 or later is required.
                """)
                return
            }
            let granted = CGPreflightScreenCaptureAccess()
            if options.checkPermission {
                emit(["event": "permission", "granted": granted])
                return
            }
            guard granted else {
                throw RecorderError(code: "screen_permission_required", message: "Screen recording permission is not already granted; this command does not request it")
            }
            let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
            let windows = content.windows.filter { $0.isOnScreen && $0.frame.width > 1 && $0.frame.height > 1 }
            if options.listWindows {
                emit(["event": "windows", "windows": windows.map { window -> [String: Any] in
                    [
                        "id": window.windowID, "title": window.title ?? "",
                        "application": window.owningApplication?.applicationName ?? "",
                        "bundleIdentifier": window.owningApplication?.bundleIdentifier ?? "",
                        "pid": window.owningApplication?.processID ?? 0,
                        "x": window.frame.origin.x, "y": window.frame.origin.y,
                        "width": window.frame.width, "height": window.frame.height,
                    ]
                }])
                return
            }
            guard let window = windows.first(where: { $0.windowID == options.windowID }) else {
                throw RecorderError(code: "window_not_found", message: "The requested window is not available on screen")
            }
            let recorder = WindowRecorder(options: options, window: window)
            try await recorder.run()
        } catch {
            let failure = error as NSError
            emit([
                "event": "error", "code": (error as? RecorderError)?.code ?? "capture_failed",
                "message": error.localizedDescription, "domain": failure.domain, "nativeCode": failure.code,
            ])
            exit(1)
        }
    }
}
