"use client";

import ProposalDetailClient from "./ProposalDetailClient";

export default function ProposalDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <ProposalDetailClient params={params} />;
}
