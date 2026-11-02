import { redirect } from "next/navigation";
import { getCurrentProfile, homePath } from "./lib/auth/dal";

export default async function Home() {
  redirect(homePath(await getCurrentProfile()));
}
