"use client";

import { useState } from "react";
import { PlusIcon } from "@phosphor-icons/react";
import Button from "@/app/components/button";
import SessionTypeSelector from "./session-type-selector";
import NewSessionWizard from "./new-session-wizard";
import DecisionSetupWizard from "./decision-setup-wizard";
import DeliberateSetupWizard from "./deliberate-setup-wizard";

export default function NewSessionLauncher({
  asCard = false,
  hiveId,
  hiveSlug,
}: {
  asCard?: boolean;
  hiveId: string;
  hiveSlug?: string | null;
}) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [understandWizardOpen, setUnderstandWizardOpen] = useState(false);
  const [deliberateWizardOpen, setDeliberateWizardOpen] = useState(false);
  const [decideWizardOpen, setDecideWizardOpen] = useState(false);

  const handleSelectUnderstand = () => {
    setSelectorOpen(false);
    setUnderstandWizardOpen(true);
  };

  const handleSelectDeliberate = () => {
    setSelectorOpen(false);
    setDeliberateWizardOpen(true);
  };

  const handleSelectDecide = () => {
    setSelectorOpen(false);
    setDecideWizardOpen(true);
  };

  const handleCloseUnderstand = () => {
    setUnderstandWizardOpen(false);
  };

  const handleCloseDeliberate = () => {
    setDeliberateWizardOpen(false);
  };

  const handleCloseDecide = () => {
    setDecideWizardOpen(false);
  };

  if (asCard) {
    return (
      <>
        <Button
          variant="secondary"
          className="w-full flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-[#D7E0F0] p-10 h-64 bg-white/60 text-[#566888] hover:border-[#b8c7e6] hover:text-[#3A1DC8] transition-colors"
          onClick={() => setSelectorOpen(true)}
        >
          <span className="w-14 h-14 rounded-lg bg-[#DADDE1] flex items-center justify-center">
            <PlusIcon size={24} className="text-[#566888]" />
          </span>
          <span className="text-sm font-medium">Create New Session</span>
        </Button>
        <SessionTypeSelector
          open={selectorOpen}
          onClose={() => setSelectorOpen(false)}
          onSelectUnderstand={handleSelectUnderstand}
          onSelectDeliberate={handleSelectDeliberate}
          onSelectDecide={handleSelectDecide}
        />
        <NewSessionWizard
          open={understandWizardOpen}
          onClose={handleCloseUnderstand}
          hiveId={hiveId}
          hiveSlug={hiveSlug}
          type="explore"
        />
        <DeliberateSetupWizard
          open={deliberateWizardOpen}
          onClose={handleCloseDeliberate}
          hiveId={hiveId}
          hiveSlug={hiveSlug}
        />
        <DecisionSetupWizard
          open={decideWizardOpen}
          onClose={handleCloseDecide}
          hiveId={hiveId}
          hiveSlug={hiveSlug}
        />
      </>
    );
  }

  return (
    <>
      <Button
        onClick={() => setSelectorOpen(true)}
        className="h-10 w-[117px] whitespace-nowrap"
      >
        New Session
      </Button>
      <SessionTypeSelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelectUnderstand={handleSelectUnderstand}
        onSelectDeliberate={handleSelectDeliberate}
        onSelectDecide={handleSelectDecide}
      />
      <NewSessionWizard
        open={understandWizardOpen}
        onClose={handleCloseUnderstand}
        hiveId={hiveId}
        hiveSlug={hiveSlug}
        type="explore"
      />
      <DeliberateSetupWizard
        open={deliberateWizardOpen}
        onClose={handleCloseDeliberate}
        hiveId={hiveId}
        hiveSlug={hiveSlug}
      />
      <DecisionSetupWizard
        open={decideWizardOpen}
        onClose={handleCloseDecide}
        hiveId={hiveId}
        hiveSlug={hiveSlug}
      />
    </>
  );
}
