import { redirect } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { requireUser } from "@/lib/auth";
import GoalForm from "./GoalForm";
import "../app.css";

export const metadata = { title: "Your goal — Arachne" };

export default async function GoalPage() {
  const user = await requireUser();
  if (!user.profile?.profileDone) redirect("/profile");

  return (
    <div className="app-page">
      <AppHeader email={user.email} />
      <main className="app-main">
        <GoalForm initial={user.profile.goal} />
      </main>
    </div>
  );
}
