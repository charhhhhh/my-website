import type { Metadata } from "next";
import { ContestLayout } from "@/components/ContestLayout";
import { NotCapturedNotice } from "@/components/NotCapturedNotice";
import { contestData, CONTEST_ID } from "@/lib/contest";

export const metadata: Metadata = {
  title: `Custom Invocation - ${contestData.contest.title} - Codeforces`,
};

export default function CustomTestPage() {
  return (
    <ContestLayout active="customtest" sidebar="problems">
      <NotCapturedNotice
        tab="Custom Invocation"
        url={`/contest/${CONTEST_ID}/customtest`}
      />
    </ContestLayout>
  );
}
