import Darwin
import Foundation

public func stopOwnedProcess(
    _ process: Process,
    lifetimeHandle: FileHandle?,
    gracefulTimeout: TimeInterval = 1,
    terminationTimeout: TimeInterval = 2
) {
    lifetimeHandle?.closeFile()
    guard process.isRunning else { return }

    waitForExit(process, timeout: gracefulTimeout)
    if process.isRunning {
        process.terminate()
        waitForExit(process, timeout: terminationTimeout)
    }
    if process.isRunning {
        kill(process.processIdentifier, SIGKILL)
    }
    process.waitUntilExit()
}

private func waitForExit(_ process: Process, timeout: TimeInterval) {
    let deadline = Date().addingTimeInterval(timeout)
    while process.isRunning && Date() < deadline {
        Thread.sleep(forTimeInterval: 0.05)
    }
}
