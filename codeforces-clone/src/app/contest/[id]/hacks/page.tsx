import type { Metadata } from "next";
import { ContestLayout } from "@/components/ContestLayout";
import { CapturedTable } from "@/components/CapturedTable";
import { contestData, CONTEST_ID } from "@/lib/contest";

export function generateStaticParams() {
  return [{ id: CONTEST_ID }];
}

export const metadata: Metadata = {
  title: `Hacks - ${contestData.contest.title} - Codeforces`,
};

export default function HacksPage() {
  return (
    <ContestLayout active="hacks" sidebar="hacks">
      {/* "No items" is the genuine state for this round - the contest announcement says
          hacks were disabled for problems A-D. */}
      <CapturedTable data={contestData.hacks} caption="Hacks" />
    </ContestLayout>
  );
}
