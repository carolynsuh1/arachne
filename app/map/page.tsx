import { redirect } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { requireUser } from "@/lib/auth";
import { getUserNetwork } from "@/lib/network";
import MapClient from "./MapClient";
import "../app.css";
import "./map.css";

export const metadata = { title: "Your web — Arachne" };

export default async function MapPage() {
  const user = await requireUser();
  if (!user.profile?.profileDone) redirect("/profile");
  if (!user.profile.goal) redirect("/goal");

  const network = await getUserNetwork(user.id);

  return (
    <div className="map-page">
      <AppHeader email={user.email} />
      <MapClient
        me={{ name: user.profile.fullName || user.email.split("@")[0], university: user.profile.university }}
        goal={user.profile.goal}
        initial={network}
      />
    </div>
  );
}
