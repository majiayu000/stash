import Foundation

private final class BoundedProcessErrorCapture: @unchecked Sendable {
    let pipe = Pipe()
    private let lock = NSLock()
    private let byteLimit: Int
    private var data = Data()

    init(byteLimit: Int = 8_192) {
        self.byteLimit = byteLimit
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let chunk = handle.availableData
            guard !chunk.isEmpty else { return }
            self?.append(chunk)
        }
    }

    func summary() -> String? {
        lock.lock()
        let snapshot = data
        lock.unlock()
        return String(data: snapshot, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nonEmpty
    }

    func stop() {
        pipe.fileHandleForReading.readabilityHandler = nil
    }

    private func append(_ chunk: Data) {
        lock.lock()
        data.append(chunk)
        if data.count > byteLimit {
            data.removeFirst(data.count - byteLimit)
        }
        lock.unlock()
    }
}

enum KeeplineServiceLaunchError: LocalizedError {
    case executableMissing(String)
    case executableNotRunnable(String)
    case launchFailed(String)

    var errorDescription: String? {
        switch self {
        case let .executableMissing(path):
            "Keepline executable was not found at \(path)."
        case let .executableNotRunnable(path):
            "Keepline executable is not runnable at \(path)."
        case let .launchFailed(message):
            "Keepline Service could not start: \(message)"
        }
    }
}

@MainActor
final class KeeplineServiceController {
    private let executableURL: URL?
    private let port: Int?
    private var ownedChild: Process?
    private var errorCapture: BoundedProcessErrorCapture?

    init(executableURL: URL?, port: Int?) {
        self.executableURL = executableURL
        self.port = port
    }

    var canLaunch: Bool { executableURL != nil }

    var ownsRunningChild: Bool {
        ownedChild?.isRunning == true
    }

    var failureSummary: String? {
        if let summary = errorCapture?.summary() { return summary }
        guard let child = ownedChild, !child.isRunning else { return nil }
        return "Keepline Service exited with status \(child.terminationStatus)."
    }

    @discardableResult
    func startIfConfigured() throws -> Bool {
        if ownedChild?.isRunning == true { return true }
        guard let executableURL else { return false }

        errorCapture?.stop()
        errorCapture = nil

        let path = executableURL.path
        guard FileManager.default.fileExists(atPath: path) else {
            throw KeeplineServiceLaunchError.executableMissing(path)
        }
        guard FileManager.default.isExecutableFile(atPath: path) else {
            throw KeeplineServiceLaunchError.executableNotRunnable(path)
        }

        let child = Process()
        child.executableURL = executableURL
        child.arguments = ["service"] + (port.map { ["--port", String($0)] } ?? [])
        child.standardInput = FileHandle.nullDevice
        child.standardOutput = FileHandle.nullDevice
        let capture = BoundedProcessErrorCapture()
        child.standardError = capture.pipe

        do {
            try child.run()
        } catch {
            capture.stop()
            throw KeeplineServiceLaunchError.launchFailed(error.localizedDescription)
        }
        errorCapture = capture
        ownedChild = child
        return true
    }

    func stopOwnedChild() {
        guard let child = ownedChild else { return }
        if child.isRunning {
            child.terminate()
        }
        errorCapture?.stop()
        errorCapture = nil
        ownedChild = nil
    }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
