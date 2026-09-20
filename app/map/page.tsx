import { redirect } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import MapClient from "./MapClient";
import "../app.css";
import "./map.css";

export const metadata = { title: "Your web — Arachne" };

export default async function MapPage() {
  const user = await requireUser();
  if (!user.profile?.profileDone) redirect("/profile");
  if (!user.profile.goal) redirect("/goal");

  const people = await prisma.person.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, university: true },
  });

  return (
    <div className="map-page">
      <AppHeader email={user.email} />
      <MapClient
        me={{ name: user.profile.fullName || user.email.split("@")[0], university: user.profile.university }}
        goal={user.profile.goal}
        initialPeople={people}
      />
    </div>
  );
}
