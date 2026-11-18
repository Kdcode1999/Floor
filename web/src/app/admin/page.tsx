import type { Metadata } from "next";

import { AdminApp } from "@/features/admin/AdminApp";

export const metadata: Metadata = { title: "Floor · Reports", robots: { index: false } };

/** Floor's own page for reports and suspension. The database lets nobody else use it. */
export default function AdminPage() {
  return <AdminApp />;
}
