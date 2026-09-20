import AppHeader from "@/components/AppHeader";
import { requireUser } from "@/lib/auth";
import ProfileForm from "./ProfileForm";
import "../app.css";

export const metadata = { title: "Your profile | Arachne" };

export default async function ProfilePage() {
  const user = await requireUser();
  const p = user.profile;

  return (
    <div className="app-page">
      <AppHeader email={user.email} />
      <main className="app-main">
        <ProfileForm
          initial={{
            fullName: p?.fullName ?? "",
            university: p?.university ?? "",
            workExperience: p?.workExperience ?? "",
            projects: p?.projects ?? "",
            education: p?.education ?? "",
            interests: p?.interests ?? "",
            resumeName: p?.resumeName ?? null,
          }}
        />
      </main>
    </div>
  );
}
