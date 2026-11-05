"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "@/state/AppState";
import { clientColor, clientInitials, recentClients } from "@/lib/clientIdentity";
import type { Brand } from "@/lib/types";

/** The coloured initials badge that identifies a client everywhere. */
export function ClientBadge({ brand, size = 32 }: { brand: Brand; size?: number }) {
  const c = clientColor(brand);
  return (
    <span
      className="client-badge"
      aria-hidden="true"
      style={{
        background: c.bg,
        color: c.fg,
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
      }}
    >
      {clientInitials(brand.name)}
    </span>
  );
}

/**
 * Searchable client switcher (⌘K / Ctrl+K). Recently used clients first, then
 * the rest alphabetically; arrow keys + Enter to pick, Esc to close.
 */
export default function ClientSwitcher({ onClose }: { onClose: () => void }) {
  const { brands, brand, selectBrand, setView, view } = useAppState();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const ordered = useMemo(() => {
    const recent = recentClients();
    const rank = (b: Brand) => {
      const i = recent.indexOf(b.id);
      return i < 0 ? 999 : i;
    };
    return [...brands].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [brands]);
  const recentIds = useMemo(() => new Set(recentClients()), []);
  const list = ordered.filter((b) =>
    (b.name + " " + (b.sector || "")).toLowerCase().includes(q.trim().toLowerCase()),
  );

  useEffect(() => input.current?.focus(), []);

  async function pick(b: Brand) {
    onClose();
    if (b.id !== brand?.id) await selectBrand(b.id);
    if (view === "clients") setView("overview");
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") return onClose();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, list.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && list[active]) {
      e.preventDefault();
      pick(list[active]);
    }
  }

  return (
    <div className="switcher-backdrop" onMouseDown={onClose}>
      <div
        className="switcher"
        role="dialog"
        aria-modal="true"
        aria-label="Switch client"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <input
          ref={input}
          value={q}
          placeholder="Switch to client…"
          aria-label="Search clients"
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
        />
        <ul role="listbox">
          {list.map((b, i) => (
            <li
              key={b.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? "on" : ""}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(b)}
            >
              <ClientBadge brand={b} size={26} />
              <span className="sw-name">{b.name}</span>
              <span className="sw-meta">
                {b.id === brand?.id ? "current" : recentIds.has(b.id) ? "recent" : b.sector || ""}
              </span>
            </li>
          ))}
          {!list.length && <li className="muted sw-empty">No client matches “{q}”.</li>}
        </ul>
        <div className="sw-foot">
          <button
            type="button"
            className="linkbtn"
            onClick={() => {
              onClose();
              setView("clients");
            }}
          >
            See all clients →
          </button>
          <span className="muted">↑↓ to move · Enter to open · Esc to close</span>
        </div>
      </div>
    </div>
  );
}
