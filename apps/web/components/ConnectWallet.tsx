"use client";

import { useWallet } from "./WalletProvider";

function shortAddr(a: string): string {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

export function ConnectWallet() {
  const { installed, connected, address, loading, connect, disconnect, error } = useWallet();

  if (loading && !address) {
    return (
      <button
        disabled
        className="px-4 py-2 rounded-lg text-sm font-medium bg-muted text-muted-foreground"
      >
        checking…
      </button>
    );
  }

  if (!installed) {
    return (
      <a
        href="https://www.freighter.app"
        target="_blank"
        rel="noreferrer noopener"
        className="px-4 py-2 rounded-lg text-sm font-semibold border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
      >
        install Freighter →
      </a>
    );
  }

  if (connected && address) {
    return (
      <div className="flex items-center gap-2">
        <span className="live-dot" />
        <button
          onClick={disconnect}
          className="px-4 py-2 rounded-lg text-sm font-mono bg-muted text-foreground hover:bg-muted/70 transition-colors"
          title={address}
        >
          {shortAddr(address)}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-xs text-destructive max-w-[200px] truncate">{error}</span>}
      <button
        onClick={() => void connect()}
        className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        connect Freighter
      </button>
    </div>
  );
}
