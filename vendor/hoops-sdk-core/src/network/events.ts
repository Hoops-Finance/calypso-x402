import { rpc } from "@stellar/stellar-sdk";

export interface DiagnosticEvent {
  type: string;
  contractId?: string;
  topics: string[];
  data: string;
}

export function extractDiagnosticEvents(
  simResult: rpc.Api.SimulateTransactionResponse
): DiagnosticEvent[] {
  const events: DiagnosticEvent[] = [];

  if (!("events" in simResult) || !simResult.events) {
    return events;
  }

  for (const event of simResult.events) {
    try {
      const contractEvent = event.event();
      const body = contractEvent.body().v0();
      const topics = body.topics().map((t) => t.toXDR("base64"));
      const data = body.data().toXDR("base64");

      // contractId() returns a Hash which wraps raw bytes
      let contractId: string | undefined;
      try {
        const raw = contractEvent.contractId();
        if (raw) contractId = (raw as unknown as { toString(e: string): string }).toString("hex");
      } catch {
        // no contract id
      }

      events.push({
        type: contractEvent.type().name,
        contractId,
        topics,
        data,
      });
    } catch {
      // skip unparseable events
    }
  }

  return events;
}
