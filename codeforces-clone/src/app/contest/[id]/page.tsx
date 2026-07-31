import type { Metadata } from "next";
import { ContestLayout } from "@/components/ContestLayout";
import { ProblemsTable } from "@/components/ProblemsTable";
import { QuestionsTable } from "@/components/QuestionsTable";
import { contestData, CONTEST_ID } from "@/lib/contest";

export function generateStaticParams() {
  return [{ id: CONTEST_ID }];
}

export const metadata: Metadata = {
  title: `Dashboard - ${contestData.contest.title} - Codeforces`,
};

export default function ProblemsPage() {
  return (
    <ContestLayout active="problems" sidebar="problems">
      <ProblemsTable />
      {/* Inline styles copied verbatim from the live page rather than approximated. */}
      <div style={{ textAlign: "right", fontSize: "1.1rem", marginTop: "3px" }}>
        <a href="/problemset">Complete problemset</a>
      </div>
      <QuestionsTable />
    </ContestLayout>
  );
}
