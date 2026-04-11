"use client";

import { useState } from "react";
import { useWallet } from "./WalletProvider";

type Status =
  | { state: "idle" }
  | { state: "funding" }
  | { state: "success" }
  | { state: "error"; msg: string };

export function FriendbotButton() {
  const { connected, fundFromFriendbot } = useWallet();
  const [status, setStatus] = useState<Status>({ state: "idle" });

  if (!connected) return null;

  async function handleClick() {
    setStatus({ state: "funding" });
    const result = await fundFromFriendbot();
    if (result.ok) {
      setStatus({ state: "success" });
      setTimeout(() => setStatus({ state: "idle" }), 3500);
    } else {
      setStatus({ state: "error", msg: result.error });
      setTimeout(() => setStatus({ state: "idle" }), 5000);
    }
  }

  const label =
    status.state === "funding"
      ? "funding…"
      : status.state === "success"
        ? "✓ funded 10k XLM"
        : status.state === "error"
          ? `✗ ${status.msg}`
          : "fund testnet (friendbot)";

  const tone =
    status.state === "success"
      ? "border-[hsl(var(--success)/0.4)] text-[hsl(var(--success))] bg-[hsl(var(--success)/0.1)]"
      : status.state === "error"
        ? "border-destructive/40 text-destructive bg-destructive/10"
        : "border-primary/40 text-primary hover:bg-primary/10";

  return (
    <button
      onClick={() => void handleClick()}
      disabled={status.state === "funding"}
      className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${tone}`}
    >
      {label}
    </button>
  );
}
