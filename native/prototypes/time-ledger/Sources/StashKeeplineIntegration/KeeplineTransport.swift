import Foundation
import KeeplineKit

public protocol KeeplineTransport: Sendable {
    func metadata() async throws -> KeeplineMetadata
    func listSessions() async throws -> [KeeplineSession]
    func recoveryPreview(sessionID: String) async throws -> KeeplineRecoveryPreview
    func executeRecovery(
        sessionID: String,
        request: RecoveryExecutionRequest
    ) async throws -> KeeplineRecoveryExecution
    func upsertExternalWorkItem(
        source: String,
        externalID: String,
        input: ExternalWorkItemInput
    ) async throws -> KeeplineWorkItem
    func linkSession(workItemID: String, sessionID: String) async throws -> KeeplineSessionLink
    func dispatch(workItemID: String, request: DispatchRequest) async throws -> KeeplineDispatch
    func dispatch(id: String) async throws -> KeeplineDispatch
    func resolveDispatchSession(id: String, sessionID: String) async throws -> KeeplineDispatch
    func reviewCompletion(
        workItemID: String,
        request: CompletionReviewRequest
    ) async throws -> CompletionReviewResult
}

public struct OfficialKeeplineTransport: KeeplineTransport, Sendable {
    public let client: KeeplineClient

    public init(client: KeeplineClient) {
        self.client = client
    }

    public func metadata() async throws -> KeeplineMetadata { try await client.metadata() }
    public func listSessions() async throws -> [KeeplineSession] { try await client.listSessions() }

    public func recoveryPreview(sessionID: String) async throws -> KeeplineRecoveryPreview {
        try await client.recoveryPreview(sessionID: sessionID)
    }

    public func executeRecovery(
        sessionID: String,
        request: RecoveryExecutionRequest
    ) async throws -> KeeplineRecoveryExecution {
        try await client.executeRecovery(sessionID: sessionID, request: request)
    }

    public func upsertExternalWorkItem(
        source: String,
        externalID: String,
        input: ExternalWorkItemInput
    ) async throws -> KeeplineWorkItem {
        try await client.upsertExternalWorkItem(source: source, externalID: externalID, input: input)
    }

    public func linkSession(workItemID: String, sessionID: String) async throws -> KeeplineSessionLink {
        try await client.linkSession(workItemID: workItemID, sessionID: sessionID)
    }

    public func dispatch(workItemID: String, request: DispatchRequest) async throws -> KeeplineDispatch {
        try await client.dispatch(workItemID: workItemID, request: request)
    }

    public func dispatch(id: String) async throws -> KeeplineDispatch {
        try await client.dispatch(id: id)
    }

    public func resolveDispatchSession(id: String, sessionID: String) async throws -> KeeplineDispatch {
        try await client.resolveDispatchSession(id: id, sessionID: sessionID)
    }

    public func reviewCompletion(
        workItemID: String,
        request: CompletionReviewRequest
    ) async throws -> CompletionReviewResult {
        try await client.reviewCompletion(workItemID: workItemID, request: request)
    }
}
