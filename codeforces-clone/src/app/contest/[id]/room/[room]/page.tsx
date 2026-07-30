import type { Metadata } from "next";
import { ContestLayout } from "@/components/ContestLayout";
import { contestData } from "@/lib/contest";

export const metadata: Metadata = {
  title: `Room #1 - ${contestData.contest.title} - Codeforces`,
};

export default async function RoomPage({
  params,
}: {
  // Next.js 16: params is a Promise and must be awaited.
  params: Promise<{ id: string; room: string }>;
}) {
  await params;

  return (
    // The Room tab is the one page with no sidebar - #pageContent runs the full 1172px.
    <ContestLayout active="room" sidebar={null}>
      {/* Captured wholesale: this page stacks a room chooser, a "Final standings"
          heading, a hint line and the 42-row standings datatable, none of which are
          reused by any other tab. The structured rows are still on contestData.room. */}
      <div dangerouslySetInnerHTML={{ __html: contestData.roomContentHtml ?? "" }} />
    </ContestLayout>
  );
}
