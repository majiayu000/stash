import Foundation

public protocol WorkspaceRepository: Sendable {
    func load() async throws -> LedgerWorkspace?
    func save(_ workspace: LedgerWorkspace) async throws
}

public actor JSONWorkspaceRepository: WorkspaceRepository {
    public let fileURL: URL

    public init(fileURL: URL = JSONWorkspaceRepository.defaultFileURL()) {
        self.fileURL = fileURL
    }

    public func load() async throws -> LedgerWorkspace? {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }
        let data = try Data(contentsOf: fileURL, options: [.mappedIfSafe])
        return try Self.decoder.decode(LedgerWorkspace.self, from: data)
    }

    public func save(_ workspace: LedgerWorkspace) async throws {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        let data = try Self.encoder.encode(workspace)
        try data.write(to: fileURL, options: [.atomic])
    }

    public static func defaultFileURL() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support")
        return base
            .appendingPathComponent("Stash Time Ledger", isDirectory: true)
            .appendingPathComponent("workspace-v1.json", isDirectory: false)
    }

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .secondsSince1970
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970
        return decoder
    }()
}
