import Foundation

public enum WorkspaceRemoteMutation: String, CaseIterable, Sendable {
    case launchWorkItemUpsert
    case launchDispatch
    case manualLinkUpsert
    case manualSessionLink
    case ambiguousResolution
    case completionReview
    case projectionSync
}

public enum WorkspacePersistenceGateError: LocalizedError, Equatable, Sendable {
    case persistenceFailed(String)
    case remoteMutationBlocked(WorkspaceRemoteMutation, String)

    public var errorDescription: String? {
        switch self {
        case let .persistenceFailed(detail):
            "Stash could not save locally, so the remote operation stopped at a persistence gate. \(detail)"
        case let .remoteMutationBlocked(mutation, detail):
            "Stash could not save locally before \(mutation.rawValue). No remote mutation was sent. \(detail)"
        }
    }
}

@MainActor
public enum WorkspacePersistenceGate {
    public static func require(_ store: LedgerStore) async throws {
        guard await store.flush() else {
            let detail: String
            if case let .failed(message) = store.persistenceState {
                detail = message
            } else {
                detail = "Stash local persistence is unavailable."
            }
            throw WorkspacePersistenceGateError.persistenceFailed(detail)
        }
    }

    public static func perform<Value>(
        _ mutation: WorkspaceRemoteMutation,
        store: LedgerStore,
        operation: () async throws -> Value
    ) async throws -> Value {
        do {
            try await require(store)
        } catch let error as WorkspacePersistenceGateError {
            throw WorkspacePersistenceGateError.remoteMutationBlocked(
                mutation,
                error.localizedDescription
            )
        }
        return try await operation()
    }
}
