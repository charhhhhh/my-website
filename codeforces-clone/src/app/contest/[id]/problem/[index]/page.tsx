import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContestLayout } from "@/components/ContestLayout";
import { ProblemStatement } from "@/components/ProblemStatement";
import { contestData, problemIndexes } from "@/lib/contest";

export function generateStaticParams() {
  return problemIndexes.map((index) => ({ id: contestData.contest.id, index }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ index: string }>;
}): Promise<Metadata> {
  const { index } = await params;
  return { title: `Problem - ${index.toUpperCase()} - Codeforces` };
}

export default async function ProblemPage({
  params,
}: {
  // Next.js 16: params is a Promise and must be awaited.
  params: Promise<{ id: string; index: string }>;
}) {
  const { index } = await params;
  const key = index.toUpperCase();
  const statement = contestData.statements[key];
  if (!statement) notFound();

  return (
    // Each problem page has its own sidebar - same boxes as the dashboard plus a
    // per-problem "Problem tags" box - so the sidebar is keyed to this problem's capture.
    <ContestLayout active="problems" sidebar={`problem-${key}`}>
      <ProblemStatement statement={statement} />
    </ContestLayout>
  );
}
