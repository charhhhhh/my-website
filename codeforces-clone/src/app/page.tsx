import { redirect } from "next/navigation";
import { CONTEST_ID } from "@/lib/contest";

export default function Home() {
  redirect(`/contest/${CONTEST_ID}`);
}
