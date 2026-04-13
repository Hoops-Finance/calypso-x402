import { rpc } from "@stellar/stellar-sdk";
export interface DiagnosticEvent {
    type: string;
    contractId?: string;
    topics: string[];
    data: string;
}
export declare function extractDiagnosticEvents(simResult: rpc.Api.SimulateTransactionResponse): DiagnosticEvent[];
//# sourceMappingURL=events.d.ts.map