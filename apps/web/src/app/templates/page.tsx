import { redirect } from "next/navigation";

// Templates now live in the Scenario Library.
export default function Page() {
  redirect("/scenarios");
}
