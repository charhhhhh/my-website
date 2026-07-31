import type { Metadata } from "next";
import { ContestLayout } from "@/components/ContestLayout";
import { NotCapturedNotice } from "@/components/NotCapturedNotice";
import { contestData, CONTEST_ID } from "@/lib/contest";

export function generateStaticParams() {
  return [{ id: CONTEST_ID }];
}

export const metadata: Metadata = {
  title: `Submit - ${contestData.contest.title} - Codeforces`,
};

export default function SubmitPage() {
  return (
    <ContestLayout active="submit" sidebar="problems">
      <NotCapturedNotice tab="Submit Code" url={`/contest/${CONTEST_ID}/submit`} />
    </ContestLayout>
  );
}
