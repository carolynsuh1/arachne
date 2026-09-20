import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

export default function AppHeader({ email }: { email?: string }) {
  return (
    <header className="app-header">
      <Link href="/" className="logo">
        <img src="/figma/logo.png" alt="" />
        <span>Arachne</span>
      </Link>
      {email ? (
        <div className="app-header-right">
          <span className="app-header-email">{email}</span>
          <LogoutButton />
        </div>
      ) : null}
    </header>
  );
}
