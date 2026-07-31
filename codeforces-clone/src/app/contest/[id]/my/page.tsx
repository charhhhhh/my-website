import type { Metadata } from "next";
import { ContestLayout } from "@/components/ContestLayout";
import { CapturedTable } from "@/components/CapturedTable";
import { contestData, CONTEST_ID } from "@/lib/contest";

export function generateStaticParams() {
  return [{ id: CONTEST_ID }];
}

export const metadata: Metadata = {
  title: `Status - ${contestData.contest.title} - Codeforces`,
};

export default function MySubmissionsPage() {
  return (
    <ContestLayout active="my" sidebar="my-submissions">
      {/* Captured while logged out, so Codeforces returned its empty state. The table
          frame and column headers are the real thing; a logged-in capture would fill in
          submission rows. */}
      <CapturedTable data={contestData.mySubmissions} caption="My Submissions" />
    </ContestLayout>
  );
}
