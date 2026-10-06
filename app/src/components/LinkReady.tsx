"use client";

import { formatInr, formatUsd } from "@/lib/format";
import type { CreatedLink } from "@/lib/useCreateLink";
import { ShareLink } from "./ShareLink";
import { Button, Card, Notice } from "./ui";

export function LinkReady({
  link,
  inrPerUsd,
  onDone,
}: {
  link: CreatedLink;
  inrPerUsd: number | null;
  onDone: () => void;
}) {
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-muted">Link ready</p>
        <p className="text-2xl font-semibold">{formatUsd(link.amount)} is on its way</p>
        <p className="text-sm text-muted">
          {inrPerUsd && <>About {formatInr(link.amount, inrPerUsd)}</>}
          {inrPerUsd && link.note && " · "}
          {link.note && <>For {link.note}</>}
        </p>
      </div>
      <ShareLink url={link.url} amount={link.amount} />
      <Notice>Anyone with this link can collect the money, so only send it to the person you are paying.</Notice>
      <Button variant="secondary" onClick={onDone}>
        Send more
      </Button>
    </Card>
  );
}
