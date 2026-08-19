import { Outlet } from "react-router";
import { NavBar } from "./NavBar";

export function AppShell() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <NavBar />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
