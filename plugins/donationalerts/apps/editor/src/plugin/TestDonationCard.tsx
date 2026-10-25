import { Button, NumberField, Section, TextField } from "@fluxta/sdk/ui";
import {
  testDonationProblems,
  type EditorMessage,
  type TestDonationDraft,
} from "donationalerts-protocol";
import { useState } from "react";

type Props = {
  /** Whether the sidecar has just confirmed a Test Donation. */
  testSent: boolean;
  send: (message: EditorMessage) => void;
};

const INITIAL: TestDonationDraft = {
  username: "Fluxta test",
  amount: 100,
  currency: "RUB",
  message: "A test donation from Fluxta",
};

export function TestDonationCard({ testSent, send }: Props) {
  const [draft, setDraft] = useState(INITIAL);
  const [amount, setAmount] = useState<number | undefined>(INITIAL.amount);

  const complete = { ...draft, amount: amount ?? Number.NaN };
  const problems = testDonationProblems(complete);
  const canSend = Object.keys(problems).length === 0;

  const set = (key: "username" | "currency" | "message") => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <Section
      title="Test donation"
      description="Runs your scenarios as a real donation would — Event Filters and Conditions included — without any money. It never reaches DonationAlerts, and its Is Test field is on, for a scenario that must tell it apart."
      actions={
        <>
          {testSent ? (
            <span role="status" className="text-muted-foreground text-xs">
              Sent
            </span>
          ) : null}
          <Button
            disabled={!canSend}
            onClick={() =>
              send({ event: "send-test-donation", donation: complete })
            }
          >
            Send test donation
          </Button>
        </>
      }
    >
      <TextField
        label="Username"
        value={draft.username}
        onChange={set("username")}
      />
      <NumberField
        label="Amount"
        value={amount}
        onChange={setAmount}
        min={0}
        error={problems.amount}
      />
      <TextField
        label="Currency"
        value={draft.currency}
        onChange={(value) => set("currency")(value.toUpperCase())}
        maxLength={3}
        error={problems.currency}
      />
      <TextField
        label="Message"
        value={draft.message}
        onChange={set("message")}
        multiline
        rows={3}
      />
    </Section>
  );
}
