import { redirect } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { getCurrentUser, nextStep } from "@/lib/auth";
import LoginForm from "./LoginForm";
import "../app.css";

export const metadata = { title: "Log in | Arachne" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(nextStep(user));

  return (
    <div className="app-page">
      <AppHeader />
      <main className="app-main">
        <LoginForm />
      </main>
    </div>
  );
}
