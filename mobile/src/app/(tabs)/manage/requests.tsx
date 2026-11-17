import { useRouter } from "expo-router";
import { useState } from "react";

import { BackHeader } from "@/components/BackHeader";
import { EmptyState } from "@/components/EmptyState";
import { Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { approveRequest, declineRequest, loadRequests } from "@/features/manage/api";
import { RequestCard } from "@/features/manage/RequestCard";
import { timeAgo } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";

/** The whole approval queue: everyone waiting for VIP, oldest first. */
export default function RequestsScreen() {
  const router = useRouter();
  const { space } = useSpace();
  const client = supabase;
  const queue = useLoad(client ? () => loadRequests(client, space.id) : null, `requests:${space.id}`);
  const [now] = useState(() => Date.now());

  const settle = async (action: () => Promise<string | null>) => {
    const problem = await action();
    if (!problem) queue.reload();
    return problem;
  };

  return (
    <Screen header={<BackHeader title="Requests" backLabel="Back to Manage" fallback="/manage" />} gap={12}>
      {!client || queue.loading ? (
        <Loading />
      ) : queue.error ? (
        <Trouble detail={queue.error} onRetry={queue.reload} />
      ) : queue.data?.length === 0 ? (
        <EmptyState icon="check" title="No one is waiting" detail="New requests for VIP show up here." />
      ) : (
        queue.data?.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            sent={timeAgo(request.createdAt, now)}
            onApprove={() => settle(() => approveRequest(client, request.id))}
            onDecline={(reason) => settle(() => declineRequest(client, request.id, reason))}
            onProof={
              request.proofPath
                ? () => router.push({ pathname: "/manage/proof", params: { path: request.proofPath ?? "", name: request.name } })
                : undefined
            }
          />
        ))
      )}
    </Screen>
  );
}
