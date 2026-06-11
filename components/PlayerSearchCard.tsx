"use client";

import { useState } from "react";
import { PlayerSearch } from "@/components/PlayerSearch";
import { SectionHeading } from "@/components/SectionHeading";

export function PlayerSearchCard() {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <section
      className={`relative animate-fade-in [animation-delay:120ms] [animation-fill-mode:both] ${
        dropdownOpen ? "isolate z-40" : ""
      }`}
    >
      <SectionHeading title="Sök spelare">
        <div className="card overflow-visible p-4">
          <PlayerSearch onDropdownOpenChange={setDropdownOpen} />
        </div>
      </SectionHeading>
    </section>
  );
}
