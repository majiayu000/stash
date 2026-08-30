import Foundation

public protocol WorkspaceRepository: Sendable {
    func load() async throws -> LedgerWorkspace?
    func save(_ workspace: LedgerWorkspace) async throws
}

public enum WorkspaceError: Error, LocalizedError {
    case unsupportedSchema(Int)

    public var errorDescription: String? {
        switch self {
        case let .unsupportedSchema(version):
            "This workspace uses unsupported schema version \(version)."
        }
    }
}

public enum WorkspaceCodec {
    public static func encode(_ workspace: LedgerWorkspace) throws -> Data {
        try encoder.encode(workspace)
    }

    public static func decode(_ data: Data) throws -> LedgerWorkspace {
        try decoder.decode(LedgerWorkspace.self, from: data)
    }

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .secondsSince1970
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }()

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970
        return decoder
    }()
}

public actor JSONWorkspaceRepository: WorkspaceRepository {
    public let fileURL: URL

    public init(fileURL: URL = JSONWorkspaceRepository.defaultFileURL()) {
        self.fileURL = fileURL
    }

    public func load() async throws -> LedgerWorkspace? {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }
        let data = try Data(contentsOf: fileURL, options: [.mappedIfSafe])
        return try WorkspaceCodec.decode(data)
    }

    public func save(_ workspace: LedgerWorkspace) async throws {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        if FileManager.default.fileExists(atPath: fileURL.path) {
            let previousData = try Data(contentsOf: fileURL, options: [.mappedIfSafe])
            try previousData.write(to: backupFileURL, options: [.atomic])
        }
        let data = try WorkspaceCodec.encode(workspace)
        try data.write(to: fileURL, options: [.atomic])
    }

    public static func defaultFileURL() -> URL {
        if let override = ProcessInfo.processInfo.environment["STASH_WORKSPACE_PATH"]?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !override.isEmpty {
            return URL(fileURLWithPath: override).standardizedFileURL
        }

        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support")
        return base
            .appendingPathComponent("Stash Time Ledger", isDirectory: true)
            .appendingPathComponent("workspace-v1.json", isDirectory: false)
    }

    public var backupFileURL: URL {
        fileURL.deletingPathExtension().appendingPathExtension("backup.json")
    }
}
