"use client";

import { redirect } from "next/navigation";

export default function ConfigurationRedirect() {
  redirect("/settings");
  return null;
}
