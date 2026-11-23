import { redirect } from "next/navigation";

// Proposal compatibility redirect: keeps extraction authenticated at /dashboard/extract.
export default function VerifyRedirectPage() {
  redirect("/dashboard/extract");
}
