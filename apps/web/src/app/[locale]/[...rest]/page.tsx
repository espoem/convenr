import { notFound } from "next/navigation";

// Any address under a language prefix that no other route matches shows the localized not-found page.
export default function UnknownPage() {
  notFound();
}
