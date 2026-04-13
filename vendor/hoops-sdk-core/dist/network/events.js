export function extractDiagnosticEvents(simResult) {
    const events = [];
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
            let contractId;
            try {
                const raw = contractEvent.contractId();
                if (raw)
                    contractId = raw.toString("hex");
            }
            catch {
                // no contract id
            }
            events.push({
                type: contractEvent.type().name,
                contractId,
                topics,
                data,
            });
        }
        catch {
            // skip unparseable events
        }
    }
    return events;
}
//# sourceMappingURL=events.js.map