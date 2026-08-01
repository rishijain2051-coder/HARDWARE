import { redirect } from "next/navigation";

import { getAccess, getCurrentUser } from "@/lib/dal";
import { landingRouteFor } from "@/lib/permissions";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Send people to the first section their role can actually open, rather than
  // a dashboard they may not be permitted to read.
  const access = await getAccess();
  redirect(landingRouteFor(access));
}
